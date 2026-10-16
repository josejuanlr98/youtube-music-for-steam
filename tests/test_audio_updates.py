import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile
from test_regressions import module
import ytm_audio_runtime as runtime


def extractor(version):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        archive.writestr('yt_dlp/version.py', f"__version__ = '{version}'")
        archive.writestr('__main__.py', '')
    return b'#!/usr/bin/env python3\n' + stream.getvalue()


class AudioUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'yt-dlp'
        self.old = extractor('2026.08.19')
        self.new = extractor('2026.10.12')
        self.path.write_bytes(self.old)
        self.sha = hashlib.sha256(self.new).hexdigest()
        self.release = {'tag_name': '2026.10.12', 'assets': [{'name': 'yt-dlp',
            'browser_download_url': 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.12/yt-dlp',
            'digest': 'sha256:' + self.sha}]}

    def download(self, url, limit):
        if url == runtime._API:
            return json.dumps(self.release).encode()
        if url.endswith('SHA2-256SUMS'):
            return f'{self.sha}  yt-dlp\n'.encode()
        return self.new

    def test_verified_update_persists_and_restart_does_not_downgrade_it(self):
        source = self.path.with_name('bundled'); source.write_bytes(self.old)
        with patch.object(runtime, '_download', side_effect=self.download) as fetch, patch.object(runtime, '_probe') as probe:
            self.assertEqual(runtime.check_for_update(self.path, 'node', now=100000)['status'], 'updated')
            probe.assert_called_once()
            self.assertEqual(self.path.read_bytes(), self.new)
            runtime.stage_extractor(source, self.path)
            self.assertEqual(self.path.read_bytes(), self.new)
            self.assertEqual(runtime.check_for_update(self.path, 'node', now=100001)['status'], 'cached')
            self.assertEqual(fetch.call_count, 3)

    def test_bad_digest_and_incompatible_runtime_keep_the_old_extractor(self):
        for failure in ('checksum', 'runtime'):
            self.path.with_name('update-state.json').unlink(missing_ok=True)
            self.path.write_bytes(self.old)
            self.sha = '0' * 64 if failure == 'checksum' else hashlib.sha256(self.new).hexdigest()
            self.release['assets'][0]['digest'] = 'sha256:' + self.sha
            with patch.object(runtime, '_download', side_effect=self.download), patch.object(runtime, '_probe', side_effect=ValueError('Incompatible runtime') if failure == 'runtime' else None):
                result = runtime.check_for_update(self.path, 'node', now=100000)
            self.assertEqual(result['status'], 'failed')
            self.assertEqual(self.path.read_bytes(), self.old)
            self.assertFalse(list(self.path.parent.glob('yt-dlp-update.*')))

    def test_network_failure_keeps_audio_and_retries_after_one_hour(self):
        with patch.object(runtime, '_download', side_effect=TimeoutError) as fetch:
            self.assertFalse(runtime.check_for_update(self.path, 'node', now=100000)['ok'])
            self.assertEqual(runtime.check_for_update(self.path, 'node', now=100001)['status'], 'cached')
            self.assertFalse(runtime.check_for_update(self.path, 'node', now=103600)['ok'])
            self.assertEqual(fetch.call_count, 2)
        self.assertEqual(self.path.read_bytes(), self.old)

    def test_current_release_checks_only_once_per_day(self):
        self.release['tag_name'] = '2026.08.19'
        with patch.object(runtime, '_download', side_effect=self.download) as fetch:
            self.assertEqual(runtime.check_for_update(self.path, 'node', now=100000)['status'], 'current')
            runtime.check_for_update(self.path, 'node', now=186399)
            self.assertEqual(fetch.call_count, 1)
            runtime.check_for_update(self.path, 'node', now=186400)
            self.assertEqual(fetch.call_count, 2)

    def test_rejects_unexpected_source_and_prerelease(self):
        for alteration in ('source', 'prerelease'):
            self.path.with_name('update-state.json').unlink(missing_ok=True)
            self.release['prerelease'] = alteration == 'prerelease'
            if alteration == 'source':
                self.release['assets'][0]['browser_download_url'] = 'https://example.org/update'
            with patch.object(runtime, '_download', side_effect=self.download) as fetch:
                self.assertFalse(runtime.check_for_update(self.path, 'node', now=100000)['ok'])
                self.assertEqual(fetch.call_count, 1)
            self.assertEqual(self.path.read_bytes(), self.old)

    def test_staging_is_atomic_and_does_not_wait_for_background_update(self):
        source = self.path.with_name('bundled'); source.write_bytes(self.new)
        runtime._LOCK.acquire()
        try:
            runtime.stage_extractor(source, self.path)
            self.assertEqual(self.path.read_bytes(), self.old)
        finally:
            runtime._LOCK.release()
        runtime.stage_extractor(source, self.path)
        self.assertEqual(self.path.read_bytes(), self.new)

    def test_error_classification_uses_http_status_not_numbers_in_video_ids(self):
        self.assertEqual(runtime.audio_failure('HTTP Error 429: Too Many Requests').code, 'YOUTUBE_BLOCKED')
        self.assertEqual(runtime.audio_failure('Sign in to confirm you are not a bot').code, 'YOUTUBE_VERIFICATION')
        self.assertEqual(runtime.audio_failure('HTTP Error 403: Forbidden').code, 'YOUTUBE_FORBIDDEN')
        self.assertEqual(runtime.audio_failure('[youtube] abc429xyz: Requested format is not available').code, 'AUDIO_LOOKUP_FAILED')

    def test_cookie_jar_is_private_scoped_and_removed_after_failure(self):
        headers = self.path.with_name('browser.json')
        headers.write_text(json.dumps({'Cookie':'SID=synthetic; __Secure-3PAPISID=synthetic-key'}))
        cookies = None
        with self.assertRaises(TimeoutError):
            with runtime.audio_cookies(headers) as cookies:
                text = Path(cookies).read_text()
                self.assertIn('.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsynthetic', text)
                self.assertNotIn('googlevideo', text)
                self.assertNotIn('synthetic', str(cookies))
                raise TimeoutError
        self.assertFalse(Path(cookies).exists())
        self.assertEqual(json.loads(headers.read_text())['Cookie'], 'SID=synthetic; __Secure-3PAPISID=synthetic-key')

    def test_guests_and_malformed_cookie_headers_stay_anonymous(self):
        headers = self.path.with_name('browser.json')
        for value in (None, {}, {'cookie':'SID=good\n.example.com\tTRUE\t/\tTRUE\t0\tbad\tvalue'}, {'cookie':42}):
            if value is not None:
                headers.write_text(json.dumps(value))
            with runtime.audio_cookies(headers) as cookies:
                self.assertIsNone(cookies)

    def test_staging_accepts_the_actual_pinned_release_format(self):
        bundled = Path(__file__).resolve().parents[1] / 'bin/yt-dlp'
        if not bundled.exists():
            self.skipTest('Runtime fetched by the packaging/CI smoke check')
        runtime.stage_extractor(bundled, self.path)
        self.assertEqual(runtime.version(self.path), (2026, 8, 19))

    def test_restricted_extraction_uses_imported_session_and_cleans_the_jar(self):
        from types import SimpleNamespace
        headers = self.path.with_name('browser.json'); headers.write_text(json.dumps({'cookie':'SID=synthetic'}))
        plugin = module.Plugin(); plugin._check_audio_runtime = Mock()
        def extracted(command, **kwargs):
            if '--cookies' not in command:
                return SimpleNamespace(returncode=1, stdout='', stderr='Sign in required')
            index = command.index('--cookies')
            self.assertTrue(Path(command[index+1]).exists())
            self.assertNotIn('SID=synthetic', ' '.join(command))
            return SimpleNamespace(returncode=0, stdout='https://audio.test/stream', stderr='')
        with patch.object(module, 'BROWSER_AUTH_FILE', str(headers)), patch.object(module, 'YTDLP_BIN', str(self.path)), patch.object(module.subprocess, 'run', side_effect=extracted) as run:
            self.assertEqual(plugin._get_streaming_url('song'), 'https://audio.test/stream')
        command = run.call_args.args[0]
        self.assertFalse(Path(command[command.index('--cookies') + 1]).exists())


class AudioFailurePlaybackTests(unittest.IsolatedAsyncioTestCase):
    async def test_likes_and_other_playlist_stop_on_first_global_error(self):
        plugin = module.Plugin(); plugin.ytmusic = Mock()
        tracks = [{'videoId': f'song-{index}'} for index in range(25)]
        plugin.ytmusic.get_playlist.return_value = {'tracks': tracks}
        plugin.ytmusic.get_liked_songs.return_value = {'tracks': tracks}
        plugin.queue = [{'videoId': 'old'}]; plugin.is_playing = True
        for playlist in ('LM', 'rosalia'):
            plugin._get_streaming_url = Mock(side_effect=runtime.audio_failure('HTTP Error 429'))
            result = await plugin.start_playlist(playlist)
            self.assertEqual(result['code'], 'YOUTUBE_BLOCKED')
            plugin._get_streaming_url.assert_called_once_with('song-0')
            self.assertEqual(plugin.queue, [{'videoId': 'old'}])

    async def test_global_failure_on_next_does_not_skip_or_change_queue_position(self):
        plugin = module.Plugin(); plugin.queue = [{'videoId':'old'}, {'videoId':'next'}]
        plugin.queue_position = 0; plugin.is_playing = True
        plugin._get_streaming_url = Mock(side_effect=runtime.audio_failure('HTTP Error 429'))
        self.assertEqual((await plugin.next_track())['code'], 'YOUTUBE_BLOCKED')
        self.assertEqual(plugin.queue_position, 0)
        plugin._get_streaming_url.assert_called_once()

    async def test_prefetch_next_track_makes_advance_instant_and_error_recovery_refetches(self):
        plugin = module.Plugin()
        plugin.ytmusic = Mock()
        plugin.queue = [{'videoId': 'song-1', 'title': 'One'}, {'videoId': 'song-2', 'title': 'Two'}]
        plugin.queue_position = 0
        plugin.is_playing = True
        plugin._get_streaming_url = Mock(side_effect=['https://audio.test/two-prefetched', 'https://audio.test/two-fresh'])

        prefetched = await plugin.prefetch_next_track()
        self.assertTrue(prefetched['prefetched'])
        self.assertEqual(prefetched['videoId'], 'song-2')
        plugin._get_streaming_url.assert_called_once_with('song-2')

        # Second prefetch call for the same next track is a no-op cache hit
        cached_prefetch = await plugin.prefetch_next_track()
        self.assertTrue(cached_prefetch.get('cached'))
        self.assertEqual(plugin._get_streaming_url.call_count, 1)

        # Advancing to song-2 uses the prefetched URL without spawning yt-dlp again
        advanced = await plugin.next_track()
        self.assertEqual(advanced['videoId'], 'song-2')
        self.assertEqual(advanced['url'], 'https://audio.test/two-prefetched')
        self.assertEqual(plugin._get_streaming_url.call_count, 1)

        # Error recovery via get_current_track invalidates the cached URL and fetches fresh
        recovered = await plugin.get_current_track()
        self.assertEqual(recovered['url'], 'https://audio.test/two-fresh')
        self.assertEqual(plugin._get_streaming_url.call_count, 2)

    async def test_bulk_api_calls_reuse_keep_alive_sessions_and_close_on_signout(self):
        from ytmusicapi import YTMusic
        sessions = []
        class TrackingClient(YTMusic):
            def __init__(self, headers, requests_session=None):
                self._session = requests_session
                sessions.append(requests_session)
            def search(self, *args, **kwargs):
                return [{'videoId': 'v1'}]

        plugin = module.Plugin()
        with patch('ytmusicapi.YTMusic', TrackingClient):
            plugin.ytmusic = client = object.__new__(TrackingClient)
            client._auth_headers = {'cookie': 'synthetic'}
            await plugin._api_call('search', 'one')
            await plugin._api_call('search', 'two')
            self.assertEqual(len(sessions), 2)
            self.assertIs(sessions[0], sessions[1])
            await plugin.sign_out()
            self.assertEqual(len(getattr(plugin, '_bulk_sessions', [])), 0)

    async def test_stage_node_binary_skips_rewrite_when_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / 'src_node'
            dst = Path(tmp) / 'dst_node'
            src.write_bytes(b'node-binary-content')
            with patch.object(module.shutil, 'copyfile', wraps=module.shutil.copyfile) as copy_spy:
                module._stage_node_binary(str(src), str(dst))
                self.assertEqual(copy_spy.call_count, 1)
                module._stage_node_binary(str(src), str(dst))
                self.assertEqual(copy_spy.call_count, 1)

    async def test_set_volume_caches_sink_inputs_and_runs_off_loop(self):
        from types import SimpleNamespace
        plugin = module.Plugin()
        plugin._save_settings = Mock()
        calls = []
        def fake_run(cmd, **kwargs):
            calls.append(cmd)
            if cmd[:2] == ['pactl', 'list']:
                return SimpleNamespace(returncode=0, stdout='Sink Input #42\n\tapplication.name = "steamwebhelper"\n')
            return SimpleNamespace(returncode=0, stdout='')
        with patch.object(module.subprocess, 'run', side_effect=fake_run):
            await plugin.set_volume(50)
            await plugin.set_volume(65)
        self.assertEqual(calls, [
            ['pactl', 'list', 'sink-inputs'],
            ['pactl', 'set-sink-input-volume', '42', '50%'],
            ['pactl', 'set-sink-input-volume', '42', '65%'],
        ])

    async def test_next_track_shares_inflight_prefetch_without_duplicate_ytdlp_process(self):
        import asyncio
        import threading
        plugin = module.Plugin()
        plugin.ytmusic = Mock()
        plugin.queue = [{'videoId': 'song-1', 'title': 'One'}, {'videoId': 'song-2', 'title': 'Two'}]
        plugin.queue_position = 0
        plugin.is_playing = True
        started = threading.Event()
        release = threading.Event()
        calls = 0
        def slow_extract(vid):
            nonlocal calls
            calls += 1
            started.set()
            release.wait(2)
            return f'https://audio.test/{vid}'
        plugin._get_streaming_url = slow_extract
        prefetch_task = asyncio.create_task(plugin.prefetch_next_track())
        self.assertTrue(await asyncio.to_thread(started.wait, 1))
        next_task = asyncio.create_task(plugin.next_track())
        await asyncio.sleep(0.05)
        release.set()
        pref_res, next_res = await asyncio.gather(prefetch_task, next_task)
        self.assertTrue(pref_res['prefetched'])
        self.assertEqual(next_res['url'], 'https://audio.test/song-2')
        self.assertEqual(calls, 1)

    async def test_phase4_ytdlp_retries_with_fallback_player_client_on_format_error(self):
        from types import SimpleNamespace
        plugin = module.Plugin()
        plugin._check_audio_runtime = Mock()
        cmds = []
        def fake_run(cmd, **kwargs):
            cmds.append(list(cmd))
            if len(cmds) == 1:
                return SimpleNamespace(returncode=1, stdout='', stderr='ERROR: [youtube] song: Requested format is not available')
            return SimpleNamespace(returncode=0, stdout='https://audio.test/fallback-ok\n', stderr='')
        with tempfile.TemporaryDirectory() as tmp:
            fake_ytdlp = Path(tmp) / 'yt-dlp'
            fake_ytdlp.write_bytes(b'stub')
            with patch.object(module, 'YTDLP_BIN', str(fake_ytdlp)), patch.object(module.subprocess, 'run', side_effect=fake_run):
                url = plugin._get_streaming_url('song')
        self.assertEqual(url, 'https://audio.test/fallback-ok')
        self.assertEqual(len(cmds), 2)
        self.assertIn('youtube:player_client=tv,ios,mweb', cmds[1])

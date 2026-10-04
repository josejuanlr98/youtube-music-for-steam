import asyncio
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from test_regressions import module
from requests.exceptions import Timeout


class LibraryReliabilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_cast_rating_survives_metadata_replacement(self):
        from unittest.mock import AsyncMock
        self.p._api_call = AsyncMock(return_value={})
        result = await self.p.rate_song('cast-song', 'LIKE')
        self.assertEqual(result, {'rating': 'LIKE'})
        await self.p.sync_cast_queue([{'videoId':'cast-song','title':'New metadata'}])
        self.assertEqual(await self.p.get_song_rating('cast-song'), {'rating':'LIKE'})
        await self.p.rate_song('cast-song', 'INDIFFERENT')
        self.assertEqual(await self.p.get_song_rating('cast-song'), {'rating':'INDIFFERENT'})
    async def test_cast_rating_lookup_is_cached_and_local_change_wins(self):
        from unittest.mock import AsyncMock
        self.p._api_call = AsyncMock(return_value={'tracks':[{'videoId':'cast-song','likeStatus':'LIKE'}]})
        self.assertEqual(await self.p.get_song_rating('cast-song'), {'rating':'LIKE'})
        self.assertEqual(await self.p.get_song_rating('cast-song'), {'rating':'LIKE'})
        self.p._api_call.assert_awaited_once()
        async def pending_lookup(*args, **kwargs):
            self.p._ratings = {'another-song':'DISLIKE'}
            return {'tracks':[{'videoId':'another-song','likeStatus':'LIKE'}]}
        self.p._api_call = pending_lookup
        self.assertEqual(await self.p.get_song_rating('another-song'), {'rating':'DISLIKE'})

    def setUp(self):
        self.p = module.Plugin()
        self.p.ytmusic = Mock()
        self.p.authenticated = True
        self.p.queue = [{'videoId': 'old', 'title': 'Current'}]
        self.p.queue_position = 0
        self.p.is_playing = True
        self.p.shuffle = False
        self.p.shuffle_order = []
        self.p._cached_playlists = None
        self.p._get_streaming_url = Mock(return_value='https://audio.test/new')
        self.items = [{'videoId': f'song-{i}', 'title': f'Song {i}', 'duration': None,
                       'artists': None, 'album': None, 'thumbnails': None} for i in range(80)]
        self.p.ytmusic.get_playlist.return_value = {'tracks': self.items}

    async def test_whole_playlist_and_nullable_metadata(self):
        result = await self.p.load_playlist('playlist')
        self.assertEqual(result['queueLength'], 80)
        self.assertEqual(len(self.p.queue), 80)
        self.p.ytmusic.get_playlist.assert_called_once_with('playlist', limit=None)
        self.assertEqual(self.p.queue[0]['duration'], 0)

    async def test_initial_batch_then_remaining_tracks(self):
        self.p.ytmusic.get_playlist.side_effect = lambda pid, limit=None: {'tracks': self.items if limit is None else self.items[:25]}
        result = await self.p.start_playlist('large')
        self.assertEqual(len(self.p.queue), 25)
        self.assertEqual(result['videoId'], 'song-0')
        self.p.ytmusic.get_playlist.assert_called_once_with('large', limit=0)
        self.p.queue_position = 3
        await self.p.complete_playlist('large', result['initialIds'])
        self.assertEqual(len(self.p.queue), 80)
        self.assertEqual(self.p.queue_position, 3)
        self.assertFalse((await self.p.get_queue())['loading'])

    async def test_replay_reuses_first_page_and_short_lived_start_url(self):
        first = await self.p.start_playlist('large')
        again = await self.p.start_playlist('large')
        self.assertEqual(first['videoId'], again['videoId'])
        self.p.ytmusic.get_playlist.assert_called_once_with('large', limit=0)
        self.p._get_streaming_url.assert_called_once()

    async def test_large_background_read_does_not_lock_interactive_api(self):
        from ytmusicapi import YTMusic
        started, release = threading.Event(), threading.Event()
        client = self.p.ytmusic = object.__new__(YTMusic)
        client._auth_headers = {'cookie':'synthetic'}
        client.search = Mock(return_value=[])
        class BulkClient(YTMusic):
            def __init__(self, headers, requests_session=None):
                self._session = requests_session
            def search(self, *args, **kwargs):
                return []
            def get_playlist(self, *args, **kwargs):
                started.set()
                release.wait(3)
                return {'tracks': []}
        with patch('ytmusicapi.YTMusic', BulkClient):
            # Keep isinstance true for the client used in this test.
            self.p.ytmusic = client = object.__new__(BulkClient)
            client._auth_headers = {'cookie':'synthetic'}
            client.search = Mock(return_value=[])
            task = asyncio.create_task(self.p._api_call('get_playlist', 'large', limit=None))
            try:
                self.assertTrue(await asyncio.to_thread(started.wait, 2))
                self.assertEqual(await asyncio.wait_for(self.p._api_call('search', 'song'), .5), [])
            finally:
                release.set()
                await task

    async def test_completion_does_not_restore_stopped_queue(self):
        result = await self.p.start_playlist('large')
        await self.p.stop_all()
        self.assertIn('error', await self.p.complete_playlist('large', result['initialIds']))
        self.assertEqual(self.p.queue, [])

    async def test_skip_unplayable_advances_and_preserves_repeat(self):
        self.p.queue = [{'videoId': 'bad'}, {'videoId': 'also-bad'}, {'videoId': 'good'}]
        self.p.repeat = 'ONE'
        self.p._get_streaming_url.side_effect = [None, 'https://audio.test/good']
        result = await self.p.skip_unplayable('bad')
        self.assertEqual(result['videoId'], 'good')
        self.assertEqual(self.p.queue_position, 2)
        self.assertEqual(self.p.repeat, 'ONE')

    async def test_playlist_next_inserts_whole_playlist_before_pending_tracks(self):
        self.p.queue.append({'videoId':'pending'})
        self.p.shuffle = True
        self.p.shuffle_order = [0, 1]
        result = await self.p.queue_playlist_next('list')
        self.assertEqual(result['added'], 80)
        self.assertEqual(self.p.queue[-1]['videoId'], 'pending')
        self.assertEqual(self.p.queue[1]['videoId'], 'song-0')
        self.assertEqual(self.p.shuffle_order, list(range(82)))

    async def test_search_append_preserves_playback_and_goes_last_under_shuffle(self):
        self.p.queue.append({'videoId': 'existing'})
        self.p.shuffle = True
        self.p.shuffle_order = [0, 1]
        self.p.repeat = 'ONE'
        result = await self.p.queue_song_append({'videoId':'new', 'title':'Added', 'duration':'3:05'})
        self.assertTrue(result['success'])
        self.assertEqual([t['videoId'] for t in self.p.queue], ['old', 'existing', 'new'])
        self.assertEqual(self.p.shuffle_order, [0, 1, 2])
        self.assertEqual(self.p.queue_position, 0)
        self.assertEqual(self.p.queue[-1]['duration'], 185)
        self.assertEqual(self.p.repeat, 'ONE')
        self.assertTrue(self.p.is_playing)

    async def test_search_append_empty_queue_does_not_autoplay(self):
        self.p.queue = []
        self.p.is_playing = False
        result = await self.p.queue_song_append({'videoId':'new'})
        self.assertTrue(result['success'])
        self.assertEqual(len(self.p.queue), 1)
        self.assertEqual(self.p.queue_position, 0)
        self.assertFalse(self.p.is_playing)

    async def test_large_playlist_cache_keeps_all_tracks_and_isolates_copies(self):
        self.p.ytmusic.get_playlist.return_value = {'tracks': self.items * 20}
        first = await self.p.get_playlist_tracks('large')
        first['tracks'][0]['title'] = 'Changed'
        second = await self.p.get_playlist_tracks('large')
        self.assertEqual(len(second['tracks']), 1600)
        self.assertEqual(second['tracks'][0]['title'], 'Song 0')
        self.p.ytmusic.get_playlist.assert_called_once()
        with patch.object(module.time, 'monotonic', return_value=module.time.monotonic() + 301):
            await self.p.get_playlist_tracks('large')
        self.assertEqual(self.p.ytmusic.get_playlist.call_count, 2)

    async def test_unavailable_items_are_skipped(self):
        self.p.ytmusic.get_playlist.return_value = {'tracks': [
            None, {}, {'videoId':'hidden', 'isAvailable':False}, self.items[0]]}
        result = await self.p.load_playlist('playlist')
        self.assertEqual(result['queueLength'], 1)
        self.assertEqual(result['videoId'], 'song-0')

    async def test_failures_preserve_queue_playing_and_saved_session(self):
        for error in [KeyError('twoColumnBrowseResultsRenderer'), Timeout('network'), RuntimeError('HTTP 403')]:
            self.p.ytmusic.get_playlist.side_effect = error
            result = await self.p.load_playlist('playlist')
            self.assertIn('error', result)
            self.assertNotIn('expired', result['error'])
            self.assertEqual(self.p.queue[0]['videoId'], 'old')
            self.assertTrue(self.p.authenticated)
            self.assertTrue(self.p.is_playing)

    async def test_failed_extraction_preserves_queue(self):
        self.p._get_streaming_url.return_value = None
        self.assertIn('error', await self.p.load_playlist('playlist'))
        self.assertEqual(self.p.queue[0]['videoId'], 'old')
        self.assertTrue(self.p.is_playing)

    async def test_playlist_skips_more_than_five_unplayable_tracks(self):
        self.p.ytmusic.get_playlist.return_value = {'tracks': self.items[:8]}
        self.p._get_streaming_url.side_effect = [None] * 7 + ['https://audio.test/eighth']
        result = await self.p.load_playlist('playlist')
        self.assertEqual(result['videoId'], 'song-7')
        self.assertEqual(self.p.queue_position, 7)
        self.assertEqual(self.p._get_streaming_url.call_count, 8)

    async def test_shuffle_starts_with_shuffled_song(self):
        with patch.object(module.random, 'shuffle', side_effect=lambda items: items.reverse()):
            result = await self.p.load_playlist('playlist', True)
        self.assertEqual(result['videoId'], 'song-79')
        self.assertTrue(self.p.shuffle)
        self.assertEqual(sorted(self.p.shuffle_order), list(range(80)))

    async def test_append_keeps_current_and_shuffle_order(self):
        self.p.shuffle = True
        self.p.shuffle_order = [0]
        result = await self.p.append_playlist('playlist')
        self.assertEqual(result['added'], 80)
        self.assertEqual(self.p.queue[0]['videoId'], 'old')
        self.assertTrue(self.p.is_playing)
        self.assertEqual(self.p.shuffle_order[0], 0)
        self.assertEqual(sorted(self.p.shuffle_order), list(range(81)))
        self.p._get_streaming_url.assert_not_called()

    async def test_transient_read_retries_once_without_reauth(self):
        self.p.ytmusic.search.side_effect = [Timeout(), []]
        self.assertEqual(await self.p.search_songs('music'), {'results': []})
        self.assertEqual(self.p.ytmusic.search.call_count, 2)
        self.assertTrue(self.p.authenticated)

    async def test_only_explicit_auth_failure_requests_new_headers(self):
        self.assertTrue(self.p._account_error(RuntimeError('HTTP 401: Unauthorized'))['authRequired'])
        self.assertNotIn('authRequired', self.p._account_error(KeyError('twoColumnBrowseResultsRenderer')))

    async def test_stop_wins_while_playlist_is_loading(self):
        started, release = threading.Event(), threading.Event()
        def extract(_):
            started.set()
            release.wait(3)
            return 'https://audio.test/new'
        self.p._get_streaming_url = extract
        task = asyncio.create_task(self.p.load_playlist('playlist'))
        try:
            self.assertTrue(await asyncio.to_thread(started.wait, 2))
            await self.p.stop_all()
        finally:
            release.set()
        self.assertIn('error', await task)
        self.assertEqual(self.p.queue, [])
        self.assertFalse(self.p.is_playing)

    async def test_signout_wins_while_library_is_loading(self):
        started, release = threading.Event(), threading.Event()
        def read(*args, **kwargs):
            started.set(); release.wait(3)
            return {'tracks': self.items}
        self.p.ytmusic.get_playlist.side_effect = read
        task = asyncio.create_task(self.p.get_playlist_tracks('playlist'))
        try:
            self.assertTrue(await asyncio.to_thread(started.wait, 2))
            self.p.ytmusic = None
        finally:
            release.set()
        self.assertIn('error', await task)

    async def test_bad_headers_do_not_overwrite_working_file(self):
        with tempfile.TemporaryDirectory() as directory:
            saved = Path(directory) / 'browser.json'
            source = Path(directory) / 'headers.txt'
            saved.write_text('previous credentials')
            source.write_text('bad headers')
            client = self.p.ytmusic
            with patch.object(module, 'BROWSER_AUTH_FILE', str(saved)), patch('ytmusicapi.setup', side_effect=ValueError()):
                result = await self.p.load_headers_from_file(str(source))
            self.assertIn('error', result)
            self.assertEqual(saved.read_text(), 'previous credentials')
            self.assertIs(self.p.ytmusic, client)
            self.assertTrue(self.p.authenticated)

    async def test_valid_headers_replace_file_after_server_validation(self):
        from ytmusicapi.auth.types import AuthType
        with tempfile.TemporaryDirectory() as directory:
            saved = Path(directory) / 'browser.json'
            source = Path(directory) / 'headers.txt'
            source.write_text('headers')
            candidate = Mock(auth_type=AuthType.BROWSER)
            with patch.object(module, 'BROWSER_AUTH_FILE', str(saved)), patch('ytmusicapi.setup', return_value=json.dumps({'cookie':'test'})), patch('ytmusicapi.YTMusic', return_value=candidate):
                self.assertTrue((await self.p.load_headers_from_file(str(source)))['success'])
            candidate.get_library_playlists.assert_called_once_with(limit=1)
            self.assertEqual(json.loads(saved.read_text()), {'cookie':'test'})
            self.assertIs(self.p.ytmusic, candidate)

    async def test_stale_remove_and_failed_jump_preserve_current(self):
        self.p.queue.append({'videoId':'next'})
        self.assertIn('error', await self.p.remove_from_queue(1, ['old']))
        self.assertIn('error', await self.p.remove_from_queue(0, ['old', 'next']))
        self.p._get_streaming_url.return_value = None
        self.assertIn('error', await self.p.jump_to_queue(1, ['old', 'next']))
        self.assertEqual(self.p.queue_position, 0)

    async def test_local_handoff_restores_shuffle_and_repeat(self):
        self.p.shuffle = True
        self.p.shuffle_order = [0]
        self.p.repeat = 'ALL'
        snapshot = await self.p.get_queue()
        await self.p.sync_cast_queue([], -1)
        self.assertTrue((await self.p.restore_local_queue(snapshot))['success'])
        self.assertEqual(self.p.queue[0]['videoId'], 'old')
        self.assertEqual(self.p.shuffle_order, [0])
        self.assertEqual(self.p.repeat, 'ALL')

import importlib.util
import logging
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'py_modules'))
sys.modules['decky'] = types.SimpleNamespace(
    DECKY_PLUGIN_DIR=str(ROOT), DECKY_PLUGIN_SETTINGS_DIR=str(ROOT),
    logger=logging.getLogger('test'))
spec = importlib.util.spec_from_file_location('plugin', ROOT / 'main.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
from ytmusicapi.parsers.watch import get_tab_browse_ids
from ytmusicapi import YTMusic


class PlaybackTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = module.Plugin()
        self.plugin.ytmusic = Mock()
        from ytm_lyrics import LyricsResolver
        self.plugin._lyrics_resolver = LyricsResolver(api_factory=lambda: self.plugin.ytmusic)
        self.plugin.queue = []
        self.plugin._get_streaming_url = Mock(return_value='https://audio.test/stream')

    async def test_search_result_plays_without_radio_or_get_song(self):
        self.plugin.ytmusic.search.return_value = [
            {'videoId': 'selected', 'title': 'Song', 'artists': [{'name': 'Artist'}], 'duration': '3:21'},
            {'title': 'Unavailable'}]
        results = (await self.plugin.search_songs('song'))['results']
        self.assertEqual(len(results), 1)
        result = await self.plugin.play_song(results[0]['videoId'], results[0])
        self.assertEqual(result['videoId'], 'selected')
        self.assertEqual(result['duration'], 201)
        self.assertEqual(result['title'], 'Song')
        self.assertEqual(result['queueLength'], 1)
        self.plugin._get_streaming_url.assert_called_once_with('selected')
        self.plugin.ytmusic.get_watch_playlist.assert_not_called()
        self.plugin.ytmusic.get_song.assert_not_called()

    async def test_failed_stream_preserves_queue(self):
        self.plugin.queue = [{'videoId': 'previous'}]
        self.plugin._get_streaming_url.return_value = None
        self.assertIn('error', await self.plugin.play_song('selected'))
        self.assertEqual(self.plugin.queue, [{'videoId': 'previous'}])

    async def test_empty_id_does_not_extract(self):
        self.assertIn('error', await self.plugin.play_song(''))
        self.plugin._get_streaming_url.assert_not_called()

    async def test_radio_fallback_reads_video_details(self):
        self.plugin.ytmusic.get_watch_playlist.side_effect = KeyError('endpoint')
        self.plugin.ytmusic.get_song.return_value = {'videoDetails': {
            'videoId': 'selected', 'title': 'Song', 'author': 'Artist', 'lengthSeconds': '201'}}
        result = await self.plugin.play_song_radio('selected')
        self.assertEqual(result['videoId'], 'selected')
        self.assertEqual(result['duration'], 201)

    async def test_lyrics_string_and_object_ids(self):
        for value in ['MPLYt_test', {'browseId': 'MPLYt_test'}]:
            self.plugin._lyrics_resolver.cache.clear()
            self.plugin.ytmusic.get_watch_playlist.return_value = {'lyrics': value}
            self.plugin.ytmusic.get_lyrics.return_value = {'lyrics': 'Text', 'source': 'Provider'}
            result = await self.plugin.get_lyrics('selected')
            self.assertEqual(result['lyrics'], 'Text')
            self.plugin.ytmusic.get_lyrics.assert_called_with('MPLYt_test', timestamps=True)
            self.plugin.ytmusic.get_watch_playlist.assert_called_with(videoId='selected', radio=False)

    async def test_absent_lyrics_and_parser_errors(self):
        for watch in [{}, {'lyrics': None}]:
            self.plugin._lyrics_resolver.cache.clear()
            self.plugin.ytmusic.get_watch_playlist.return_value = watch
            self.assertIsNone((await self.plugin.get_lyrics('selected'))['lyrics'])
        self.plugin.ytmusic.get_watch_playlist.side_effect = KeyError('endpoint')
        self.plugin._lyrics_resolver.cache.clear()
        self.assertIsNone((await self.plugin.get_lyrics('selected'))['lyrics'])
        self.plugin.ytmusic.get_lyrics.assert_not_called()

    async def test_network_failure_is_retryable_error(self):
        self.plugin.ytmusic.get_watch_playlist.side_effect = RuntimeError('timeout')
        self.assertIn('try again', (await self.plugin.get_lyrics('selected'))['error'])


class QueueEditingTests(unittest.IsolatedAsyncioTestCase):
    async def test_search_play_next_preserves_current_and_overrides_shuffle_repeat(self):
        p = module.Plugin()
        p.ytmusic = Mock()
        p._get_streaming_url = Mock(return_value='https://audio.test/stream')
        p.queue = [{'videoId': x} for x in ['a', 'b', 'c']]
        p.queue_position = 1
        p.shuffle = True
        p.shuffle_order = [1, 0, 2]
        p.repeat = 'ONE'
        p.is_playing = True
        result = await p.queue_song_next({'videoId': 'new', 'duration': '3:21'})
        self.assertTrue(result['success'])
        self.assertEqual(p.queue[p.queue_position]['videoId'], 'b')
        self.assertTrue(p.is_playing)
        self.assertEqual(sorted(p.shuffle_order), [0, 1, 2, 3])
        self.assertEqual(p.queue[2]['duration'], 201)
        p._advance_queue()
        self.assertEqual(p.queue[p.queue_position]['videoId'], 'new')

    async def test_search_play_next_handles_empty_queue(self):
        p = module.Plugin()
        p.ytmusic = Mock()
        p.queue = []
        p.queue_position = 8
        p.shuffle = True
        p.shuffle_order = [8]
        self.assertTrue((await p.queue_song_next({'videoId': 'new'}))['success'])
        self.assertEqual(p.queue_position, 0)
        self.assertEqual(p.shuffle_order, [0])

    async def test_moves_preserve_current_song_in_every_direction(self):
        for current in range(4):
            for index in range(4):
                for action in ['up', 'down', 'next']:
                    p = module.Plugin()
                    p.queue = [{'videoId': str(i)} for i in range(4)]
                    p.queue_position = current
                    p.is_playing = True
                    p._get_streaming_url = Mock(return_value='https://audio.test/stream')
                    p.shuffle = True
                    p.shuffle_order = [2, 0, 3, 1]
                    before = p.queue[current]
                    result = await p.edit_queue(index, action, ['0', '1', '2', '3'])
                    self.assertIs(p.queue[p.queue_position], before)
                    self.assertTrue(p.is_playing)
                    self.assertEqual(sorted(p.shuffle_order), [0, 1, 2, 3])
                    if result.get('success') and action == 'next':
                        self.assertEqual(p.queue[p.queue_position + 1]['videoId'], str(index))
                        p.repeat = 'NONE'
                        p._advance_queue()
                        self.assertEqual(p.queue[p.queue_position]['videoId'], str(index))

    async def test_stale_and_invalid_edits_do_not_modify_queue(self):
        p = module.Plugin()
        p.queue = [{'videoId':'a'}, {'videoId':'b'}]
        for index, action, ids in [(0, 'down', ['old']), (4, 'next', ['a','b']), (True, 'up', ['a','b']), (0, 'invalid', ['a','b'])]:
            self.assertIn('error', await p.edit_queue(index, action, ids))
            self.assertEqual([t['videoId'] for t in p.queue], ['a','b'])

    async def test_notification_settings_survive_volume_save_and_restart(self):
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory, patch.object(module, 'SETTINGS_FILE', str(Path(directory) / 'settings.json')):
            p = module.Plugin()
            await p.set_notification_settings({'tracks': False, 'connectionSound': True})
            p.volume = 0.3
            p._save_settings()
            restored = module.Plugin()
            restored._load_settings()
            self.assertFalse((await restored.get_notification_settings())['tracks'])
            self.assertTrue(restored.notification_settings['connectionSound'])
            self.assertEqual(restored.volume, 0.3)
            self.assertIn('error', await p.set_notification_settings({'tracks':'yes'}))


class ArtworkPaletteTests(unittest.IsolatedAsyncioTestCase):
    class Response:
        def __init__(self, url, mime='image/jpeg', data=b'cover'):
            self.url, self.mime, self.data = url, mime, data
            self.headers = self
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def geturl(self): return self.url
        def get_content_type(self): return self.mime
        def read(self, _): return self.data

    async def test_artwork_fallback_is_small_and_google_only(self):
        from unittest.mock import patch
        p = module.Plugin()
        with patch.object(module.urllib.request, 'urlopen') as urlopen:
            self.assertEqual(await p.get_artwork_data_url('https://example.com/cover.jpg'), {})
            urlopen.assert_not_called()
        allowed = 'https://lh3.googleusercontent.com/cover=w64-h64'
        with patch.object(module.urllib.request, 'urlopen', return_value=self.Response(allowed)):
            result = await p.get_artwork_data_url(allowed)
            self.assertTrue(result['dataUrl'].startswith('data:image/jpeg;base64,'))

    async def test_cast_artwork_fallback(self):
        from unittest.mock import patch
        p = module.Plugin()
        allowed = 'https://i.ytimg.com/vi/test/hqdefault.jpg'
        with patch.object(module.urllib.request, 'urlopen', return_value=self.Response(allowed)):
            self.assertTrue((await p.get_artwork_data_url(allowed))['dataUrl'].startswith('data:image/jpeg;base64,'))
        with patch.object(module.urllib.request, 'urlopen') as fetch:
            self.assertEqual(await p.get_artwork_data_url('https://ytimg.com.example.org/art.jpg'), {})
            fetch.assert_not_called()

    async def test_artwork_fallback_rejects_redirects_and_large_files(self):
        from unittest.mock import patch
        p = module.Plugin()
        allowed = 'https://lh3.googleusercontent.com/cover'
        with patch.object(module.urllib.request, 'urlopen', return_value=self.Response('https://example.com/cover')):
            self.assertEqual(await p.get_artwork_data_url(allowed), {})
        with patch.object(module.urllib.request, 'urlopen', return_value=self.Response(allowed, data=b'x' * 524289)):
            self.assertEqual(await p.get_artwork_data_url(allowed), {})


class WatchParserTests(unittest.TestCase):
    def test_optional_tabs(self):
        for response in [{}, {'tabs': []}, {'tabs': [{}, {'tabRenderer': {}}]},
                         {'tabs': [{}, {'tabRenderer': {'unselectable': True}}]}]:
            self.assertEqual(get_tab_browse_ids(response), {})

    def test_supported_endpoint_shapes(self):
        for key in ['endpoint', 'navigationEndpoint']:
            response = {'tabs': [{}, {'tabRenderer': {key: {'browseEndpoint': {'browseId': 'MPLYt_test'}}}}]}
            self.assertEqual(get_tab_browse_ids(response), {'MUSIC_PAGE_TYPE_TRACK_LYRICS': 'MPLYt_test'})

    def test_real_watch_parser_survives_missing_related_endpoint(self):
        # Exercise the bundled API, not only the plugin's mocked return values.
        api = YTMusic()
        api._send_request = Mock(return_value={'contents': {
            'singleColumnMusicWatchNextResultsRenderer': {'tabbedRenderer': {
                'watchNextTabbedResultsRenderer': {'tabs': [
                    {'tabRenderer': {'content': {'musicQueueRenderer': {'content': {
                        'playlistPanelRenderer': {'contents': []}}}}}},
                    {'tabRenderer': {'endpoint': {'browseEndpoint': {'browseId': 'MPLYt_test'}}}},
                    {'tabRenderer': {}}
                ]}}}}})
        result = api.get_watch_playlist(videoId='selected', radio=False)
        self.assertEqual(result['lyrics'], 'MPLYt_test')
        self.assertIsNone(result['related'])


if __name__ == '__main__':
    unittest.main()

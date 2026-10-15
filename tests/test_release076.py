import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'py_modules'))
import ytm_translation as translation


class GoogleTranslationTests(unittest.TestCase):
    def setUp(self):
        translation._cache.clear()
        translation._source_cache.clear()
        translation._loaded_path = None
        translation._google_retry_at = 0
        translation._quota_retry_at = 0
        self.session = Mock()
        self.responses = []

    def response(self, text=None, status=200, data=None):
        response = Mock(status_code=status, headers={})
        response.json.return_value = data if data is not None else [[[text]]]
        self.responses.append(response)
        return response

    def test_google_success_persists_and_reuses_cache_across_restart(self):
        self.session.get.return_value = self.response('El sol brilla hoy.\n\nMe encanta escuchar música.')
        lyrics = 'The sun is shining today.\n\nI love listening to music.\nThe sun is shining today.'
        with tempfile.TemporaryDirectory() as directory, patch.object(translation.requests, 'Session', return_value=self.session) as factory, patch.object(translation, '_apertium_translate') as fallback:
            cache = str(Path(directory) / 'cache.json')
            first = translation.translate_lyrics(lyrics, 'es', cache)
            self.assertTrue(first['complete'])
            self.assertEqual(first['translatedLines'], ['El sol brilla hoy.', '', 'Me encanta escuchar música.', 'El sol brilla hoy.'])
            self.assertEqual(len(json.loads(Path(cache).read_text())), 2)
            translation._cache.clear()
            translation._loaded_path = None
            self.assertEqual(translation.translate_lyrics(lyrics, 'es', cache), first)
            factory.assert_called_once()
            fallback.assert_not_called()
        self.session.get.assert_called_once()
        self.session.close.assert_called_once()
        self.responses[0].close.assert_called_once()
        self.assertEqual(self.session.get.call_args.kwargs['params']['sl'], 'en')
        self.assertNotIn('Cookie', self.session.get.call_args.kwargs['headers'])

    def test_collapsed_stanza_retries_individual_lines_without_misalignment(self):
        def request(_url, **kwargs):
            return self.response({'one\n\ntwo': 'collapsed stanza', 'one': 'uno', 'two': 'dos'}[kwargs['params']['q']])
        self.session.get.side_effect = request
        with patch.object(translation.requests, 'Session', return_value=self.session):
            result = translation._google_nmt_translate(['one', 'two'], 'en', 'es', translation.monotonic() + 5)
        self.assertEqual(result, {'one': 'uno', 'two': 'dos'})
        self.assertEqual(self.session.get.call_count, 3)
        self.assertTrue(all(response.close.call_count == 1 for response in self.responses))
        self.session.close.assert_called_once()

    def test_rate_limit_closes_response_and_suppresses_further_google_requests(self):
        response = self.response(status=429, data={})
        response.headers = {'Retry-After': '120'}
        self.session.get.return_value = response
        with patch.object(translation.requests, 'Session', return_value=self.session) as factory:
            self.assertEqual(translation._google_nmt_translate(['one'], 'en', 'es', translation.monotonic() + 5), {})
            self.assertEqual(translation._google_nmt_translate(['two'], 'en', 'fr', translation.monotonic() + 5), {})
            factory.assert_called_once()
        self.session.get.assert_called_once()
        response.close.assert_called_once()
        self.assertGreater(translation._google_retry_at, translation.monotonic() + 110)

    def test_bad_payload_preserves_missing_lines_and_closes_resources(self):
        self.session.get.side_effect = lambda *args, **kwargs: self.response(data={'unexpected': 'payload'})
        with patch.object(translation.requests, 'Session', return_value=self.session):
            self.assertEqual(translation._google_nmt_translate(['one'], 'en', 'es', translation.monotonic() + 5), {})
        self.assertTrue(all(response.close.call_count == 1 for response in self.responses))
        self.session.close.assert_called_once()

    def test_expired_budget_does_not_start_a_request(self):
        with patch.object(translation.requests, 'Session') as factory:
            self.assertEqual(translation._google_nmt_translate(['one'], 'en', 'es', translation.monotonic() - 1), {})
            factory.assert_not_called()


class SourceArchiveTests(unittest.TestCase):
    def test_developer_zip_cannot_be_recognized_as_an_uncompiled_decky_plugin(self):
        spec = importlib.util.spec_from_file_location('package_source_076', ROOT / 'scripts/package_source.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory) / 'project'
            project.mkdir()
            (project / 'plugin.json').write_text('{"name":"YouTube Music"}')
            (project / 'main.py').write_text('# editable source')
            target = Path(directory) / 'source.zip'
            module.package(project, target, '0.7.6')
            with zipfile.ZipFile(target) as archive:
                names = archive.namelist()
                self.assertFalse(any(name.endswith('/plugin.json') and name.count('/') == 1 for name in names), 'Decky must reject the source-only archive before installation')
                self.assertEqual(archive.read('youtube-music-for-steam-0.7.6-source/project/plugin.json'), (project / 'plugin.json').read_bytes())
                self.assertIn('youtube-music-for-steam-0.7.6.zip', archive.read('youtube-music-for-steam-0.7.6-source/SOURCE-ONLY.txt').decode())


class LyricSearchMatchTests(unittest.TestCase):
    def test_search_rejects_missing_artist_and_wrong_recording_duration(self):
        from ytm_lyrics import LyricsResolver
        response = Mock(status_code=200)
        response.json.return_value = [
            {'trackName':'Song', 'artistName':'', 'duration':180, 'syncedLyrics':'[00:01]Unknown artist\n[00:04]Second line'},
            {'trackName':'Song', 'artistName':'Artist', 'duration':188, 'syncedLyrics':'[00:01]Wrong recording\n[00:04]Second line'},
            {'trackName':'Song', 'artistName':'Artist', 'duration':180, 'syncedLyrics':'[00:01]Correct recording\n[00:04]Second line'},
        ]
        resolver = LyricsResolver(http_get=Mock(return_value=response))
        self.assertEqual(resolver._lrclib_search('Song', 'Artist', 180)['timedLines'][0]['text'], 'Correct recording')
        response.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()

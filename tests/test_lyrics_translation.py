import sys
import unittest
import requests
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'py_modules'))
from ytm_translation import translate_lyrics
import ytm_translation


class TranslationTests(unittest.TestCase):
    def setUp(self):
        ytm_translation._cache.clear()
        ytm_translation._quota_retry_at = 0

    def test_disabled_path_requires_no_service(self):
        with patch('requests.Session') as session:
            result = translate_lyrics('Esta canción es muy hermosa y quiero escucharla de nuevo.', 'es')
        self.assertEqual(result['sourceLanguage'], 'es')
        session.assert_not_called()

    def test_preserves_original_alignment_when_service_fails(self):
        class BrokenSession:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, *args, **kwargs): raise requests.ConnectionError('offline')

        with patch('requests.Session', return_value=BrokenSession()):
            result = translate_lyrics('I cannot believe the song is over.\nI want to hear it again.', 'es')
        self.assertNotIn('translatedLines', result)

    def test_quota_failure_is_visible_and_prevents_repeat_requests(self):
        class QuotaResponse:
            status_code = 429
            def json(self): return {'responseStatus': 429}
        class QuotaSession:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, *args, **kwargs): return QuotaResponse()

        with patch('requests.Session', return_value=QuotaSession()) as session:
            first = translate_lyrics('I cannot believe the song is over.\nI want to hear it again.', 'es')
            second = translate_lyrics('I cannot believe the song is over.\nI want to hear it again.', 'fr')
        self.assertIn('daily limit', first['error'])
        self.assertIn('daily limit', second['error'])
        self.assertEqual(session.call_count, 1)

    def test_success_is_cached_and_line_aligned(self):
        class SuccessResponse:
            status_code = 200
            def raise_for_status(self): pass
            def json(self): return {'responseStatus': 200, 'responseData': {'translatedText': 'No puedo creer que haya terminado.\nQuiero escucharlo otra vez.'}}
        class SuccessSession:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, *args, **kwargs): return SuccessResponse()

        lyrics = 'I cannot believe the song is over.\n\nI want to hear it again.'
        with patch('requests.Session', return_value=SuccessSession()) as session:
            first = translate_lyrics(lyrics, 'es')
            second = translate_lyrics(lyrics, 'es')
        self.assertEqual(first['translatedLines'][1], '')
        self.assertEqual(first, second)
        self.assertEqual(session.call_count, 1)


if __name__ == '__main__':
    unittest.main()

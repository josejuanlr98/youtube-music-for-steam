import sys
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'py_modules'))
import requests
from ytm_translation import translate_lyrics
import ytm_translation


class TranslationTests(unittest.TestCase):
    def setUp(self):
        ytm_translation._cache.clear()
        ytm_translation._quota_retry_at = 0
        ytm_translation._loaded_path = None
        ytm_translation._source_cache.clear()
        ytm_translation._apertium_pairs=None
        ytm_translation._apertium_pairs_until=0
        self.fallback = patch('ytm_translation._apertium_translate', return_value={})
        self.fallback.start()
        self.addCleanup(self.fallback.stop)

    def test_free_fallback_recovers_daily_quota_and_preserves_line_alignment(self):
        self.fallback.stop()
        calls=[]
        class Response:
            status_code=200
            def __init__(self,data):self.data=data
            def raise_for_status(self):pass
            def json(self):return self.data
        class Session:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,url,**kwargs):
                calls.append(url)
                if 'mymemory' in url:return Response({'responseStatus':429})
                if url.endswith('listPairs'):return Response({'responseData':[{'sourceLanguage':'eng','targetLanguage':'spa'}]})
                self_outer.assertEqual(kwargs['params']['langpair'],'eng|spa')
                return Response({'responseStatus':200,'responseData':{'translatedText':'El sol brilla hoy.\nMe gusta escuchar música.'}})
        self_outer=self
        lyrics='The sun is shining today.\n\nI love listening to music.\nThe sun is shining today.'
        with patch('requests.Session',return_value=Session()):
            first=translate_lyrics(lyrics,'es')
            cached=translate_lyrics(lyrics,'es')
            unsupported=translate_lyrics(lyrics,'ja')
        self.assertTrue(first['complete'])
        self.assertEqual(first['translatedLines'],['El sol brilla hoy.','','Me gusta escuchar música.','El sol brilla hoy.'])
        self.assertEqual(first,cached)
        self.assertFalse(unsupported['complete'])
        self.assertEqual(len(calls),3,'cache and unsupported pairs do not send more lyric requests')

    def test_different_languages_do_not_wait_behind_each_other(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Event
        blocked,release=Event(),Event()
        calls=[]
        def fake(lyrics,target,path):
            calls.append(target)
            if target=='es':
                blocked.set();release.wait(2)
            return {'translatedLines':[target],'complete':True}
        with patch('ytm_translation._translate',side_effect=fake),ThreadPoolExecutor(max_workers=3) as workers:
            first=workers.submit(translate_lyrics,'The sun is shining today.','es')
            self.assertTrue(blocked.wait(1))
            duplicate=workers.submit(translate_lyrics,'The sun is shining today.','es')
            other=workers.submit(translate_lyrics,'The sun is shining today.','fr')
            try:
                self.assertEqual(other.result(timeout=1)['translatedLines'],['fr'])
            finally:release.set()
            self.assertEqual(first.result(),duplicate.result())
        self.assertEqual(calls.count('es'),1,'same-song requests still coalesce')

    def test_invalid_requests_do_not_make_network_calls(self):
        with patch('requests.Session') as session:
            self.assertIn('error',translate_lyrics([], 'es'))
            self.assertIn('error',translate_lyrics('hello', []))
            self.assertIn('error',translate_lyrics('x'*12001, 'es'))
        session.assert_not_called()

    def test_cold_language_detection_is_safe_for_parallel_languages(self):
        from concurrent.futures import ThreadPoolExecutor
        import langdetect.detector_factory as factory
        class Response:
            status_code=200
            def raise_for_status(self):pass
            def json(self):return {'responseStatus':200,'responseData':{'translatedText':'Translation'}}
        class Session:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,*args,**kwargs):return Response()
        with patch.object(factory,'_factory',None),patch('requests.Session',return_value=Session()),ThreadPoolExecutor(max_workers=3) as workers:
            results=list(workers.map(lambda target:translate_lyrics('The sun is shining today and I love listening to music.',target),['es','fr','ja']))
        self.assertTrue(all(result.get('sourceLanguage')=='en' for result in results))
        self.assertTrue(all(result.get('complete') for result in results))

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

    def test_repeated_verses_use_one_translation_and_persist_across_restarts(self):
        requests_seen=[]
        class Response:
            status_code=200
            def raise_for_status(self):pass
            def json(self):return {'responseStatus':200,'responseData':{'translatedText':'El sol brilla hoy.\nMe encanta escuchar música.'}}
        class Session:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,*args,**kwargs):requests_seen.append(kwargs['params']['q']);return Response()
        lyrics='The sun is shining today.\nI love listening to music.\n\nThe sun is shining today.'
        with tempfile.TemporaryDirectory() as directory,patch('requests.Session',return_value=Session()):
            path=str(Path(directory)/'cache.json')
            first=translate_lyrics(lyrics,'es',path)
            ytm_translation._cache.clear();ytm_translation._loaded_path=None
            second=translate_lyrics(lyrics,'es',path)
        self.assertEqual(first,second)
        self.assertTrue(first['complete'])
        self.assertEqual(first['translatedLines'][0],first['translatedLines'][3])
        self.assertEqual(requests_seen,['The sun is shining today.\nI love listening to music.'])

    def test_collapsed_lines_fall_back_individually_and_preserve_partial_success(self):
        calls=[]
        class Response:
            status_code=200
            def __init__(self,text):self.text=text
            def raise_for_status(self):pass
            def json(self):return {'responseStatus':200,'responseData':{'translatedText':self.text}}
        class Session:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,*args,**kwargs):
                text=kwargs['params']['q'];calls.append(text)
                if '\n' in text:return Response('Two lines collapsed')
                if text.startswith('The sun'):return Response('El sol brilla hoy.')
                raise requests.ConnectionError('offline')
        lyrics='The sun is shining today.\nI love listening to music.'
        with patch('requests.Session',return_value=Session()):
            first=translate_lyrics(lyrics,'es')
            second=translate_lyrics(lyrics,'es')
        self.assertFalse(first['complete'])
        self.assertEqual(first['translatedLines'],['El sol brilla hoy.',''])
        self.assertEqual(second['translatedLines'],first['translatedLines'])
        self.assertEqual(calls.count('The sun is shining today.'),1,'successful line is reused on retry')

    def test_success_http_status_with_quota_flag_never_becomes_lyric_text(self):
        class Response:
            status_code=200
            def json(self):return {'responseStatus':200,'quotaFinished':True,'responseData':{'translatedText':'Quota exhausted'}}
        class Session:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def get(self,*args,**kwargs):return Response()
        with patch('requests.Session',return_value=Session()):
            result=translate_lyrics('The sun is shining today. I love listening to music.','es')
        self.assertNotIn('translatedLines',result)
        self.assertIn('daily limit',result['error'])

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

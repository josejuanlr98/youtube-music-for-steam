import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'py_modules'))
from ytm_lyrics import LyricsResolver, clean_lyric_artist, clean_lyric_title
TIMED={'lyrics':'one\ntwo','timedLines':[{'text':'one','start':0,'end':1},{'text':'two','start':1,'end':2}],'source':'test'}
META={'title':'Song','artist':'Artist','duration':180}
class LyricsLatencyTests(unittest.TestCase):
 def resolver(self):
  result=LyricsResolver();self.addCleanup(result.close);return result
 def test_fast_timing_does_not_wait_for_slow_provider(self):
  resolver=self.resolver();release=threading.Event();started=threading.Event()
  def slow(_):
   started.set();release.wait(3);return {},{},False
  resolver._resolve_youtube=slow;resolver._lrclib=lambda _:TIMED
  try:
   start=time.monotonic();result=resolver.resolve('video',META)
   self.assertIs(result,TIMED);self.assertLess(time.monotonic()-start,.3);self.assertTrue(started.is_set())
  finally:release.set()
 def test_native_timing_does_not_wait_for_slow_external(self):
  resolver=self.resolver();release=threading.Event()
  resolver._resolve_youtube=lambda _:(TIMED,{},False)
  resolver._lrclib=lambda _:(release.wait(3) and {})
  try:
   start=time.monotonic();self.assertIs(resolver.resolve('video',META),TIMED);self.assertLess(time.monotonic()-start,.3)
  finally:release.set()
 def test_simultaneous_views_and_metadata_share_native_lookup(self):
  resolver=self.resolver();release=threading.Event();started=threading.Event();calls=[]
  def native(video):calls.append(video);started.set();release.wait(3);return TIMED,{},False
  resolver._resolve_youtube=native;resolver._lrclib=lambda _:{}
  with ThreadPoolExecutor(max_workers=3) as pool:
   requests=[pool.submit(resolver.resolve,'video',META),pool.submit(resolver.resolve,'video',META),pool.submit(resolver.resolve,'video',{**META,'album':'Album'})]
   self.assertTrue(started.wait(1));release.set()
   self.assertTrue(all(request.result(timeout=2).get('timedLines') for request in requests))
  self.assertEqual(calls,['video'])
 def test_plain_text_can_arrive_before_timing_then_upgrade_in_cache(self):
  resolver=self.resolver();release=threading.Event()
  resolver._resolve_youtube=lambda _:({'lyrics':'plain','source':'youtube'},{},False)
  resolver._lrclib=lambda _:(release.wait(3) and TIMED)
  result=resolver.resolve('video',META)
  self.assertEqual(result['lyrics'],'plain');self.assertTrue(result['timingPending'])
  release.set()
  until=time.monotonic()+1
  while time.monotonic()<until:
   if resolver.resolve('video',META).get('timedLines'):break
   time.sleep(.005)
  self.assertTrue(resolver.resolve('video',META).get('timedLines'))
 def test_unknown_cast_metadata_uses_exact_watch_track(self):
  resolver=self.resolver();resolver._resolve_youtube=lambda _:({},META,False)
  calls=[];resolver._lrclib=lambda meta:(calls.append(meta) or TIMED)
  self.assertTrue(resolver.resolve('video',{'title':'Loading...','artist':'','duration':0}).get('timedLines'))
  self.assertEqual(calls[0]['artist'],'Artist');self.assertEqual(calls[0]['duration'],180)
 def test_cast_duration_enrichment_retries_external_once(self):
  resolver=self.resolver();resolver._resolve_youtube=lambda _:({},META,False)
  calls=[]
  def external(meta):
   calls.append(meta)
   return TIMED if meta.get('duration') else {}
  resolver._lrclib=external
  self.assertTrue(resolver.resolve('video',{**META,'duration':0}).get('timedLines'))
  self.assertLessEqual(len(calls),2)
 def test_no_false_timing_for_music_video_or_live_variant(self):
  resolver=self.resolver();record={'trackName':'Song','artistName':'Artist','duration':205,'syncedLyrics':'[00:01]one\n[00:02]two','plainLyrics':'plain'}
  self.assertEqual(resolver._record(record,'Song','Artist',180),{})
  self.assertFalse(resolver._record(record,'Song','Artist',0).get('timedLines'))
  self.assertEqual(clean_lyric_title('Song (Live)'), 'Song (Live)')
  self.assertEqual(clean_lyric_artist('Roxy Music'), 'Roxy Music')
 def test_counterpart_with_different_duration_returns_text_only(self):
  api=Mock();api.get_watch_playlist.side_effect=[{'tracks':[{'videoId':'video','duration_seconds':205,'counterpart':{'videoId':'audio'}}]}, {'lyrics':'browse','tracks':[{'videoId':'audio','duration_seconds':180}]}]
  api.get_lyrics.return_value={'lyrics':[{'text':'one','start_time':0,'end_time':1000},{'text':'two','start_time':1000,'end_time':2000}]}
  resolver=LyricsResolver(api_factory=lambda:api);self.addCleanup(resolver.close)
  result=resolver.resolve('video');self.assertTrue(result['lyrics']);self.assertFalse(result.get('timedLines'))
 def test_transient_errors_are_not_cached_and_cache_stays_bounded(self):
  resolver=self.resolver();calls=[]
  def native(video):calls.append(video);return {},{},True
  resolver._resolve_youtube=native;resolver._lrclib=lambda _:{}
  resolver.resolve('video',META);resolver.resolve('video',META);self.assertEqual(len(calls),2)
  resolver._resolve_youtube=lambda _:(TIMED,{},False)
  for index in range(40):resolver.resolve(str(index))
  self.assertLessEqual(len(resolver.cache),6);self.assertLessEqual(len(resolver.video_cache),6);self.assertLessEqual(len(resolver._youtube_cache),24)
 def test_empty_native_response_does_not_poison_video_cache(self):
  resolver=self.resolver();calls=[]
  resolver._resolve_youtube=lambda video:(calls.append(video) or ({},{},False))
  resolver.resolve('video');resolver.resolve('video');self.assertEqual(len(calls),2)
if __name__=='__main__':unittest.main()

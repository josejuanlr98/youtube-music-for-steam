import sys
import time
import unittest
from pathlib import Path
from unittest.mock import Mock
from dataclasses import dataclass

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'py_modules'))
from ytm_lyrics import LyricsResolver, parse_lrc, youtube_result


class TimedLyricsTests(unittest.TestCase):
    def api(self):
        api = Mock()
        api.get_watch_playlist.return_value = {'lyrics': 'MPLYt_test'}
        return api

    def test_youtube_milliseconds_and_json_safe_dataclasses(self):
        @dataclass
        class Line:
            text: str
            start_time: int
            end_time: int
        payload = {'lyrics': [Line('First', 1200, 2600), Line('Second', 4200, 6000)]}
        result = youtube_result(payload)
        self.assertEqual(result['timingSource'], 'youtube')
        self.assertEqual(result['timedLines'][0], {'text': 'First', 'start': 1.2, 'end': 2.6})
        import json
        json.dumps(result)

    def test_invalid_or_incomplete_timing_does_not_fake_sync(self):
        result = youtube_result({'lyrics': [{'text': 'First', 'start_time': 1000, 'end_time': 2000}, {'text':'No timing'}]})
        self.assertFalse(result['timedLines'])
        self.assertEqual(result['lyrics'], 'First\nNo timing')

    def test_native_preferred_and_bounded_cache(self):
        api = self.api()
        api.get_lyrics.return_value = {'lyrics': [{'text':'One', 'start_time':0, 'end_time':1000}, {'text':'Two', 'start_time':1000, 'end_time':2000}]}
        http = Mock()
        resolver = LyricsResolver(lambda: api, http)
        a = resolver.resolve('video')
        self.assertEqual(resolver.resolve('video'), a)
        api.get_lyrics.assert_called_once_with('MPLYt_test', timestamps=True)
        http.assert_not_called()
        for i in range(7):
            resolver.resolve(str(i))
        self.assertEqual(len(resolver.cache), 6)

    def test_mobile_parser_failure_falls_back_to_plain(self):
        api = self.api()
        api.get_lyrics.side_effect = [KeyError('cueRange'), {'lyrics':'Plain text'}]
        result = LyricsResolver(lambda: api).resolve('id')
        self.assertEqual(result['lyrics'], 'Plain text')
        self.assertFalse(result.get('timedLines'))
        api.get_lyrics.assert_called_with('MPLYt_test', timestamps=False)

    def test_lrc_repeat_cues_blank_gaps_and_offset(self):
        lines = parse_lrc('[offset:200]\n[00:01.50][00:04.50]Repeat\n[00:03.0]\n[ar:Artist]', 8)
        self.assertEqual([line['start'] for line in lines], [1.7, 3.2, 4.7])
        self.assertEqual(lines[1]['text'], '')
        self.assertEqual(lines[0]['end'], 3.2)
        self.assertEqual(lines[-1]['end'], 8)

    def test_external_lyrics_require_matching_artist_title_and_duration(self):
        api = self.api()
        api.get_lyrics.return_value = {'lyrics':'Plain'}
        record = {'trackName':'Song', 'artistName':'Artist', 'duration':180, 'syncedLyrics':'[00:01]One\n[00:04]Two'}
        response = Mock(status_code=200)
        response.json.return_value = record
        http = Mock(return_value=response)
        resolver = LyricsResolver(lambda:api, http)
        metadata = {'title':'Song', 'artist':'Artist', 'duration':180}
        self.assertEqual(resolver.resolve('correct', metadata)['timingSource'], 'lrclib')
        self.assertNotIn('Cookie', http.call_args.kwargs['headers'])
        for field, value in [('artistName','Other'), ('trackName','Song live'), ('duration',200)]:
            wrong = dict(record, **{field:value})
            response.json.return_value = wrong
            self.assertEqual(resolver.resolve(field, metadata)['lyrics'], 'Plain')

    def test_rate_limit_respects_retry_after(self):
        api = self.api()
        api.get_lyrics.return_value = {'lyrics':'Plain'}
        response = Mock(status_code=429, headers={'Retry-After':'120'})
        http = Mock(return_value=response)
        resolver = LyricsResolver(lambda:api, http)
        metadata = {'title':'Song', 'artist':'Artist', 'duration':180}
        resolver.resolve('a', metadata)
        resolver.resolve('b', metadata)
        self.assertGreater(resolver.retry_after, time.time() + 110)
        http.assert_called_once()

    def test_native_network_error_can_still_use_external_times(self):
        api = self.api()
        api.get_watch_playlist.side_effect = RuntimeError('offline')
        response = Mock(status_code=200)
        response.json.return_value = {'trackName':'Song', 'artistName':'Artist', 'duration':180, 'syncedLyrics':'[00:01]One\n[00:04]Two'}
        result = LyricsResolver(lambda:api, Mock(return_value=response)).resolve('a', {'title':'Song','artist':'Artist','duration':180})
        self.assertEqual(result['timingSource'], 'lrclib')

    def test_cast_counterpart_and_title_cleaning(self):
        from ytm_lyrics import clean_lyric_artist, clean_lyric_title
        self.assertEqual(clean_lyric_artist("ArtistVEVO"), "Artist")
        self.assertEqual(clean_lyric_artist("Artist - Topic"), "Artist")
        self.assertEqual(clean_lyric_title("Artist - Song (Official Music Video)", "ArtistVEVO"), "Song")
        api = Mock()
        def watch_side_effect(videoId=None, radio=False):
            if videoId == "omv_id":
                return {
                    "lyrics": None,
                    "tracks": [{
                        "videoId": "omv_id",
                        "title": "Song",
                        "artists": [{"name": "Artist"}],
                        "duration_seconds": 180,
                        "counterpart": {"videoId": "atv_id"},
                    }],
                }
            return {"lyrics": "MPLYt_atv", "tracks":[{"videoId":"atv_id","duration_seconds":180}]}
        api.get_watch_playlist.side_effect = watch_side_effect
        api.get_lyrics.return_value = {"lyrics": [{"text": "Line 1", "start_time": 1000, "end_time": 3000}, {"text": "Line 2", "start_time": 3500, "end_time": 6000}]}
        resolver = LyricsResolver(lambda: api)
        res = resolver.resolve("omv_id", {"title": "Loading...", "artist": "", "duration": 0})
        self.assertEqual(res["timingSource"], "youtube")
        self.assertEqual(len(res["timedLines"]), 2)

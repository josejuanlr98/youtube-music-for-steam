"""On-demand timed lyrics. Dedicated clients never mutate playback authentication."""
import math
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from email.utils import parsedate_to_datetime

import requests


def youtube_result(payload):
    if not isinstance(payload, dict):
        return {}
    raw = payload.get('lyrics')
    source = payload.get('source') or 'YouTube Music'
    if isinstance(raw, str):
        return {'lyrics': raw, 'source': source, 'timingSource': None}
    lines = []
    texts = []
    for item in raw if isinstance(raw, list) else []:
        value = item if isinstance(item, dict) else vars(item)
        text = str(value.get('text') or '')
        texts.append(text)
        try:
            start = float(value['start_time']) / 1000
            end = float(value['end_time']) / 1000
            if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
                continue
            lines.append({'text': text, 'start': start, 'end': end})
        except (KeyError, ValueError, TypeError):
            continue
    lines.sort(key=lambda line: line['start'])
    # Never invent timing for a transcript with incomplete cues.
    valid = len(lines) == len(texts) and len({line['start'] for line in lines}) > 1
    return {'lyrics': '\n'.join(texts), 'source': source,
            'timedLines': lines if valid else [], 'timingSource': 'youtube' if valid else None}


def parse_lrc(text, duration):
    if not isinstance(text, str) or len(text) > 200000:
        return []
    offset_match = re.search(r'\[offset:([+-]?\d+)\]', text, re.I)
    offset = int(offset_match[1]) / 1000 if offset_match else 0
    pattern = r'\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]'
    lines = []
    for row in text.splitlines():
        stamps = list(re.finditer(pattern, row))
        if not stamps:
            continue
        words = row[stamps[-1].end():].strip()
        for stamp in stamps:
            if float(stamp[2]) >= 60:
                continue
            start = max(0, int(stamp[1]) * 60 + float(stamp[2]) + offset)
            if start <= duration + 2:
                lines.append({'text': words, 'start': start})
    lines.sort(key=lambda line: line['start'])
    if len({line['start'] for line in lines}) < 2:
        return []
    # Preserve empty instrumental cues, and use the next distinct cue as the end.
    ends = sorted({line['start'] for line in lines} | {duration})
    for line in lines:
        line['end'] = next((end for end in ends if end > line['start']), duration)
    return [line for line in lines if line['end'] > line['start']]


def signature(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value)).casefold()
                   if c.isalnum())


class LyricsResolver:
    def __init__(self, api_factory=None, http_get=None):
        self.api_factory = api_factory or self._new_api
        self.http_get = http_get or requests.get
        self.lock = threading.Lock()
        self.cache = OrderedDict()
        self.retry_after = 0
        self.last_request = 0

    @staticmethod
    def _new_api():
        from functools import partial
        from ytmusicapi import YTMusic
        session = requests.Session()
        session.request = partial(session.request, timeout=8)
        return YTMusic(requests_session=session)

    def _lrclib(self, metadata):
        title, artist = metadata.get('title'), metadata.get('artist')
        try:
            duration = float(metadata.get('duration') or 0)
        except (ValueError, TypeError):
            return {}
        if not title or not artist or not 1 <= duration <= 3600 or time.time() < self.retry_after:
            return {}
        time.sleep(max(0, .3 - (time.monotonic() - self.last_request)))
        params = {'track_name': title, 'artist_name': artist, 'duration': duration}
        if metadata.get('album'):
            params['album_name'] = metadata['album']
        self.last_request = time.monotonic()
        response = self.http_get('https://lrclib.net/api/get', params=params, timeout=8,
                                 headers={'User-Agent': 'YouTubeMusicForSteam/0.6.8 (https://github.com/josejuanlr98/youtube-music-for-steam)'})
        try:
            if response.status_code == 429:
                retry = response.headers.get('Retry-After', '60')
                try:
                    self.retry_after = time.time() + max(1, float(retry))
                except ValueError:
                    try:
                        self.retry_after = max(time.time() + 1, parsedate_to_datetime(retry).timestamp())
                    except (TypeError, ValueError):
                        self.retry_after = time.time() + 60
                return {}
            if response.status_code != 200:
                return {}
            record = response.json()
            if (signature(record.get('trackName')) != signature(title)
                    or signature(record.get('artistName')) != signature(artist)
                    or abs(float(record.get('duration') or 0) - duration) > 2):
                return {}
            lines = parse_lrc(record.get('syncedLyrics'), duration)
            if not lines:
                return {}
            return {'lyrics': '\n'.join(line['text'] for line in lines), 'source': 'LRCLIB',
                    'timingSource': 'lrclib', 'timedLines': lines}
        finally:
            response.close()

    def resolve(self, video_id, metadata=None):
        metadata = metadata if isinstance(metadata, dict) else {}
        key = (video_id, str(metadata.get('title', '')), str(metadata.get('artist', '')),
               str(metadata.get('duration', '')), str(metadata.get('album', '')))
        with self.lock:
            cached = self.cache.get(key)
            if cached and cached[0] > time.time():
                self.cache.move_to_end(key)
                return cached[1]
            result, failed = {}, False
            api = None
            try:
                api = self.api_factory()
                watch = api.get_watch_playlist(videoId=video_id, radio=False)
                info = watch.get('lyrics') if isinstance(watch, dict) else None
                browse = info if isinstance(info, str) else info.get('browseId') if isinstance(info, dict) else None
                if browse:
                    try:
                        result = youtube_result(api.get_lyrics(browse, timestamps=True))
                    except (KeyError, IndexError, TypeError, ValueError):
                        # Older parsers can fail on untimed mobile lines (upstream #1002).
                        pass
                    if not result.get('lyrics'):
                        result = youtube_result(api.get_lyrics(browse, timestamps=False))
            except (KeyError, IndexError, TypeError):
                pass
            except Exception:
                failed = True
            finally:
                if api is not None and hasattr(api, '_session'):
                    api._session.close()
            if not result.get('timedLines'):
                try:
                    fallback = self._lrclib(metadata)
                    if fallback.get('timedLines'):
                        result = fallback
                except (requests.RequestException, ValueError, TypeError, AttributeError):
                    failed = True
            if not result.get('lyrics'):
                result = {'error': 'Could not load lyrics. Please try again.'} if failed else {'lyrics': None}
            # Short negative cache; successful lyrics stay in a six-track memory cache.
            self.cache[key] = (time.time() + (30 if 'error' in result else 60 if not result.get('lyrics') else 3600), result)
            while len(self.cache) > 6:
                self.cache.popitem(last=False)
            return result

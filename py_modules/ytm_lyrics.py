"""On-demand timed lyrics. Dedicated clients never mutate playback authentication."""
import math
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from email.utils import parsedate_to_datetime

import requests


def clean_lyric_artist(value):
    text = str(value or '')
    text = re.sub(r'\s*[-–—]\s*Topic\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s*\(Topic\)', '', text, flags=re.IGNORECASE).strip()
    return text or str(value or '').strip()


def clean_lyric_title(value):
    text = str(value or '').strip()
    # Strip soundtrack/video suffixes like "(from the series Arcane...)" or "[Official Video]"
    cleaned = re.sub(r'\s*[\(\[](?:from\s+[^\)\]]+|official\s+[^\)\]]+|lyric\s+[^\)\]]+|audio|video|visualizer)[\)\]]', '', text, flags=re.IGNORECASE).strip()
    return cleaned or text


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
        self._ytm_session = None
        self._lrclib_session = None
        self._uses_default_api = api_factory is None
        self.api_factory = api_factory or self._new_api
        self.http_get = http_get or self._session_get
        self.lock = threading.Lock()
        self.cache = OrderedDict()
        self.retry_after = 0
        self.last_request = 0

    def _get_ytm_session(self):
        if self._ytm_session is None:
            from functools import partial
            session = requests.Session()
            session.request = partial(session.request, timeout=8)
            self._ytm_session = session
        return self._ytm_session

    def _session_get(self, *args, **kwargs):
        if self._lrclib_session is None:
            self._lrclib_session = requests.Session()
        return self._lrclib_session.get(*args, **kwargs)

    def _new_api(self):
        from ytmusicapi import YTMusic
        return YTMusic(requests_session=self._get_ytm_session())

    def _lrclib_query(self, track_title, artist_name, album_name, duration):
        if time.time() < self.retry_after:
            return {}
        time.sleep(max(0, .3 - (time.monotonic() - self.last_request)))
        params = {'track_name': track_title, 'artist_name': artist_name, 'duration': duration}
        if album_name:
            params['album_name'] = album_name
        self.last_request = time.monotonic()
        response = self.http_get('https://lrclib.net/api/get', params=params, timeout=8,
                                 headers={'User-Agent': 'YouTubeMusicForSteam/0.7.6 (https://github.com/josejuanlr98/youtube-music-for-steam)'})
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
            if (signature(record.get('trackName')) != signature(track_title)
                    or signature(record.get('artistName')) != signature(artist_name)
                    or abs(float(record.get('duration') or 0) - duration) > 2):
                return {}
            lines = parse_lrc(record.get('syncedLyrics'), duration)
            if not lines:
                return {}
            return {'lyrics': '\n'.join(line['text'] for line in lines), 'source': 'LRCLIB',
                    'timingSource': 'lrclib', 'timedLines': lines}
        finally:
            response.close()

    def _lrclib_search(self, track_title, artist_name, duration):
        if not self._uses_default_api or time.time() < self.retry_after:
            return {}
        time.sleep(max(0, .3 - (time.monotonic() - self.last_request)))
        self.last_request = time.monotonic()
        response = self.http_get(
            'https://lrclib.net/api/search',
            params={'track_name': track_title, 'artist_name': artist_name},
            timeout=8,
            headers={'User-Agent': 'YouTubeMusicForSteam/0.7.6 (https://github.com/josejuanlr98/youtube-music-for-steam)'},
        )
        try:
            if response.status_code != 200:
                return {}
            records = response.json()
            if not isinstance(records, list):
                return {}
            target_title = signature(track_title)
            target_artist = signature(artist_name)
            for record in records[:8]:
                if not isinstance(record, dict):
                    continue
                rec_title = signature(record.get('trackName'))
                rec_artist = signature(record.get('artistName'))
                if not rec_title or not rec_artist:
                    continue
                if rec_title != target_title or (rec_artist != target_artist and target_artist not in rec_artist and rec_artist not in target_artist):
                    continue
                rec_dur = float(record.get('duration') or 0)
                if duration > 0 and rec_dur > 0 and abs(rec_dur - duration) > 2:
                    continue
                eff_dur = duration if duration > 0 else max(rec_dur, 180)
                lines = parse_lrc(record.get('syncedLyrics'), eff_dur)
                if lines:
                    return {'lyrics': '\n'.join(line['text'] for line in lines), 'source': 'LRCLIB',
                            'timingSource': 'lrclib', 'timedLines': lines}
                plain = str(record.get('plainLyrics') or '').strip()
                if plain:
                    return {'lyrics': plain, 'source': 'LRCLIB', 'timingSource': None, 'timedLines': []}
            return {}
        finally:
            response.close()

    def _lrclib(self, metadata):
        raw_title = metadata.get('title')
        raw_artist = metadata.get('artist')
        try:
            duration = float(metadata.get('duration') or 0)
        except (ValueError, TypeError):
            duration = 0
        if not raw_title or not raw_artist or time.time() < self.retry_after:
            return {}
        artist = clean_lyric_artist(raw_artist)
        cleaned_title = clean_lyric_title(raw_title)
        if 1 <= duration <= 3600:
            album = metadata.get('album')
            result = self._lrclib_query(raw_title, artist, album, duration)
            if result:
                return result
            if album:
                result = self._lrclib_query(raw_title, artist, None, duration)
                if result:
                    return result
            if cleaned_title and cleaned_title != raw_title:
                result = self._lrclib_query(cleaned_title, artist, album, duration)
                if result:
                    return result
                if album:
                    result = self._lrclib_query(cleaned_title, artist, None, duration)
                    if result:
                        return result
        if self._uses_default_api:
            result = self._lrclib_search(cleaned_title or raw_title, artist, duration)
            if result:
                return result
        return {}

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
                    except requests.RequestException:
                        raise
                    except Exception:
                        # Older parsers and ytmusicapi 1.12+ can raise YTMusicServerError
                        # or KeyError when mobile timed lyrics are unavailable.
                        pass
                    if not result.get('lyrics'):
                        result = youtube_result(api.get_lyrics(browse, timestamps=False))
            except (KeyError, IndexError, TypeError):
                pass
            except Exception:
                failed = True
                if self._ytm_session is not None:
                    try:
                        self._ytm_session.close()
                    except Exception:
                        pass
                    self._ytm_session = None
            finally:
                if api is not None and hasattr(api, '_session') and not self._uses_default_api:
                    api._session.close()
            if not result.get('timedLines'):
                try:
                    fallback = self._lrclib(metadata)
                    if fallback.get('timedLines') or (not result.get('lyrics') and fallback.get('lyrics')):
                        result = fallback
                except (requests.RequestException, ValueError, TypeError, AttributeError):
                    failed = True
            if not result.get('lyrics'):
                result = {'error': 'Could not load lyrics. Please try again.'} if failed else {'lyrics': None}
            has_duration = False
            try:
                has_duration = 1 <= float(metadata.get('duration') or 0) <= 3600
            except (ValueError, TypeError):
                pass
            ttl = 8 if 'error' in result else (12 if has_duration else 0) if not result.get('lyrics') else 3600
            if ttl > 0 or not self._uses_default_api:
                self.cache[key] = (time.time() + (ttl or 60), result)
            while len(self.cache) > 6:
                self.cache.popitem(last=False)
            return result

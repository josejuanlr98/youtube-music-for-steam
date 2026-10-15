"""On-demand timed lyrics. Dedicated clients never mutate playback authentication."""
from concurrent.futures import ThreadPoolExecutor, Future, wait, FIRST_COMPLETED
import math
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from email.utils import parsedate_to_datetime

import requests
from requests.adapters import HTTPAdapter


def clean_lyric_artist(value):
    text = str(value or '').strip()
    text = re.sub(r'\s*[-â€“â€”]\s*Topic\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s*\(Topic\)', '', text, flags=re.IGNORECASE)
    text = re.sub(r'(?<=\w)VEVO$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+-\s+Official(?:\s+Channel)?$', '', text, flags=re.IGNORECASE).strip()
    return text or str(value or '').strip()


def clean_lyric_title(value, artist=''):
    text = str(value or '').strip()
    # Strip soundtrack/video suffixes like "(from the series Arcane...)" or "[Official Video]"
    cleaned = re.sub(
        r'\s*[\(\[](?:from\s+[^\)\]]+|official[^\)\]]*|lyric[^\)\]]*|audio[^\)\]]*|video[^\)\]]*|visualizer[^\)\]]*|hd|hq|4k)[\)\]]',
        '',
        text,
        flags=re.IGNORECASE,
    ).strip()
    cleaned = re.sub(
        r'\s*[-â€“â€”|]\s*(?:official\s+(?:music\s+)?video|official\s+audio|lyric\s+video|visualizer|audio|video)\s*$',
        '',
        cleaned,
        flags=re.IGNORECASE,
    ).strip()
    if artist:
        cleaned_artist = clean_lyric_artist(artist)
        if cleaned_artist:
            prefix_pattern = r'^' + re.escape(cleaned_artist) + r'\s*[-â€“â€”:]\s*'
            stripped = re.sub(prefix_pattern, '', cleaned, flags=re.IGNORECASE).strip()
            if stripped:
                cleaned = stripped
    return cleaned or text


def _parse_duration_seconds(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) if value > 0 else 0.0
    text = str(value or '').strip()
    if not text:
        return 0.0
    try:
        val = float(text)
        return val if val > 0 else 0.0
    except ValueError:
        pass
    if ':' in text:
        try:
            parts = [int(p) for p in text.split(':')]
            if len(parts) == 2:
                return float(parts[0] * 60 + parts[1])
            if len(parts) == 3:
                return float(parts[0] * 3600 + parts[1] * 60 + parts[2])
        except ValueError:
            return 0.0
    return 0.0


def _extract_watch_metadata(watch, video_id):
    if not isinstance(watch, dict):
        return {}
    tracks = watch.get('tracks')
    if not isinstance(tracks, list) or not tracks:
        return {}
    match = next((t for t in tracks if isinstance(t, dict) and t.get('videoId') == video_id), None)
    if not isinstance(match, dict):
        return {}
    artists = match.get('artists') or []
    artist_name = ', '.join(
        a.get('name', '').strip()
        for a in artists
        if isinstance(a, dict) and a.get('name')
    ).strip()
    album = match.get('album')
    album_name = album.get('name', '').strip() if isinstance(album, dict) else ''
    duration = _parse_duration_seconds(match.get('duration_seconds') or match.get('length') or match.get('duration'))
    counterpart = match.get('counterpart') if isinstance(match.get('counterpart'), dict) else None
    counterpart_id = (counterpart or {}).get('videoId')
    return {
        'title': str(match.get('title') or '').strip(),
        'artist': artist_name,
        'album': album_name,
        'duration': duration,
        'counterpartVideoId': str(counterpart_id).strip() if counterpart_id else '',
    }


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
    """Race isolated providers, share in-flight reads, and never wait for a losing worker."""
    def __init__(self, api_factory=None, http_get=None):
        self._uses_default_api = api_factory is None
        self.api_factory = api_factory or self._new_api
        self.http_get = http_get or self._session_get
        self.lock = threading.RLock()
        self._sessions = threading.local()
        self._headers = None
        self._pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='ytm-lyrics')
        self.cache = OrderedDict()
        self.video_cache = OrderedDict()
        self._youtube_cache = OrderedDict()
        self._youtube_pending = {}
        self._lrclib_pending = {}
        self._pending = {}
        self.retry_after = 0
        self.last_request = 0
        self._closed = False

    def close(self):
        with self.lock:
            self._closed = True
        self._pool.shutdown(wait=False, cancel_futures=True)

    def _session(self, name):
        session = getattr(self._sessions, name, None)
        if session is None:
            from functools import partial
            session = requests.Session()
            session.mount('https://', HTTPAdapter(pool_connections=2, pool_maxsize=2))
            session.request = partial(session.request, timeout=(2.5, 4))
            setattr(self._sessions, name, session)
        return session

    def _new_api(self):
        from ytmusicapi import YTMusic
        from ytmusicapi.helpers import initialize_headers
        api = YTMusic(requests_session=self._session('youtube'))
        # Anonymous lyrics do not need a homepage request to acquire a visitor ID.
        with self.lock:
            if self._headers is None:
                self._headers = initialize_headers()
                self._headers.setdefault('X-Goog-Visitor-Id', '')
            api.__dict__['base_headers'] = dict(self._headers)
        return api

    def _session_get(self, *args, **kwargs):
        return self._session('lrclib').get(*args, **kwargs)

    def _throttle(self):
        with self.lock:
            now = time.monotonic()
            slot = max(now, self.last_request + .15)
            self.last_request = slot
        time.sleep(max(0, slot - now))

    def _lrclib_request(self, endpoint, params):
        if time.time() < self.retry_after:
            return None
        self._throttle()
        if time.time() < self.retry_after:
            return None
        response = self.http_get('https://lrclib.net/api/' + endpoint, params=params,
                                 timeout=(2.5, 4), headers={'User-Agent': 'YouTubeMusicForSteam/0.7.7 (https://github.com/josejuanlr98/youtube-music-for-steam)'})
        try:
            if response.status_code == 429:
                value = response.headers.get('Retry-After', '60')
                try:
                    until = time.time() + max(1, float(value))
                except (ValueError, TypeError):
                    try:
                        until = parsedate_to_datetime(value).timestamp()
                    except (ValueError, TypeError, OverflowError):
                        until = time.time() + 60
                self.retry_after = max(time.time() + 1, until)
                return None
            if response.status_code >= 500:
                raise requests.RequestException('Lyrics provider unavailable')
            return response.json() if response.status_code == 200 else None
        finally:
            response.close()

    @staticmethod
    def _record(record, title, artist, duration):
        if not isinstance(record, dict) or not title or not artist:
            return {}
        if signature(record.get('trackName')) != signature(title) or signature(record.get('artistName')) != signature(artist):
            return {}
        record_duration = _parse_duration_seconds(record.get('duration'))
        # Never attach album timestamps to a longer/shorter music video.
        matches_clock = duration > 0 and record_duration > 0 and abs(record_duration - duration) <= 2
        if duration > 0 and not matches_clock:
            return {}
        lines = parse_lrc(record.get('syncedLyrics'), duration) if matches_clock else []
        if lines:
            return {'lyrics': '\n'.join(line['text'] for line in lines), 'source': 'LRCLIB', 'timingSource': 'lrclib', 'timedLines': lines}
        plain = str(record.get('plainLyrics') or '').strip()
        return {'lyrics': plain, 'source': 'LRCLIB', 'timingSource': None, 'timedLines': []} if plain else {}

    def _lrclib_query(self, track_title, artist_name, album_name, duration):
        params = {'track_name': track_title, 'artist_name': artist_name, 'duration': duration}
        if album_name:
            params['album_name'] = album_name
        return self._record(self._lrclib_request('get', params), track_title, artist_name, duration)

    def _lrclib_search(self, track_title, artist_name, duration):
        records = self._lrclib_request('search', {'track_name': track_title, 'artist_name': artist_name})
        plain = {}
        for record in records[:12] if isinstance(records, list) else []:
            result = self._record(record, track_title, artist_name, duration)
            if result.get('timedLines'):
                return result
            if result.get('lyrics') and not plain:
                plain = result
        return plain

    def _lrclib(self, metadata):
        title = str(metadata.get('title') or '').strip()
        artist = str(metadata.get('artist') or '').strip()
        if title.lower() in ('', 'loading...', 'unknown') or artist.lower() in ('', 'unknown'):
            return {}
        artist = clean_lyric_artist(artist)
        title = clean_lyric_title(title, artist)
        duration = _parse_duration_seconds(metadata.get('duration'))
        plain = {}
        if 1 <= duration <= 3600:
            plain = self._lrclib_query(title, artist, metadata.get('album'), duration)
            if plain.get('timedLines'):
                return plain
        return self._lrclib_search(title, artist, duration) or plain

    @staticmethod
    def _browse(watch):
        value = watch.get('lyrics') if isinstance(watch, dict) else None
        return value if isinstance(value, str) else value.get('browseId') if isinstance(value, dict) else None

    def _resolve_youtube(self, video_id):
        api = None
        try:
            api = self.api_factory()
            watch = api.get_watch_playlist(videoId=video_id, radio=False)
            metadata = _extract_watch_metadata(watch, video_id)
            browse = self._browse(watch)
            counterpart = False
            if not browse and metadata.get('counterpartVideoId'):
                other = api.get_watch_playlist(videoId=metadata['counterpartVideoId'], radio=False)
                browse = self._browse(other)
                other_metadata = _extract_watch_metadata(other, metadata['counterpartVideoId'])
                original_duration, other_duration = metadata.get('duration', 0), other_metadata.get('duration', 0)
                counterpart = not (original_duration > 0 and other_duration > 0 and abs(original_duration - other_duration) <= 2)
            result = {}
            if browse:
                try:
                    result = youtube_result(api.get_lyrics(browse, timestamps=True))
                except requests.RequestException:
                    raise
                except Exception:
                    pass
                if not result.get('lyrics'):
                    result = youtube_result(api.get_lyrics(browse, timestamps=False))
                if counterpart:
                    result = {**result, 'timedLines': [], 'timingSource': None}
            return result, metadata, False
        except (KeyError, IndexError, TypeError):
            return {}, {}, False
        except Exception:
            # A bad keep-alive affects only this worker, never another active lookup.
            session = getattr(self._sessions, 'youtube', None)
            if session is not None:
                session.close()
                del self._sessions.youtube
            return {}, {}, True
        finally:
            if api is not None and not self._uses_default_api and hasattr(api, '_session'):
                api._session.close()

    def _youtube(self, video_id):
        with self.lock:
            cached = self._youtube_cache.get(video_id)
            if cached and cached[0] > time.time():
                future = Future()
                future.set_result(cached[1])
                return future
            pending = self._youtube_pending.get(video_id)
            if pending is not None:
                return pending
            future = self._pool.submit(self._resolve_youtube, video_id)
            self._youtube_pending[video_id] = future
        def finished(done):
            with self.lock:
                if self._youtube_pending.get(video_id) is done:
                    self._youtube_pending.pop(video_id, None)
                if not done.cancelled() and not self._closed:
                    try:
                        value = done.result()
                    except Exception:
                        return
                    if not value[2] and (value[0].get('lyrics') or any(value[1].values())):
                        self._youtube_cache[video_id] = (time.time() + (300 if value[0].get('lyrics') else 10), value)
                        while len(self._youtube_cache) > 24:
                            self._youtube_cache.popitem(last=False)
        future.add_done_callback(finished)
        return future

    def _external(self, metadata):
        key = tuple(str(metadata.get(field) or '') for field in ('title', 'artist', 'duration', 'album'))
        with self.lock:
            future = self._lrclib_pending.get(key)
            if future is not None:
                return future
            future = self._pool.submit(self._lrclib, metadata)
            self._lrclib_pending[key] = future
        def finished(done):
            with self.lock:
                if self._lrclib_pending.get(key) is done:
                    self._lrclib_pending.pop(key, None)
        future.add_done_callback(finished)
        return future

    def _save(self, key, result):
        with self.lock:
            if self._closed:
                return
            old = self.cache.get(key)
            if old and old[1].get('timedLines') and not result.get('timedLines'):
                return
            if result.get('lyrics'):
                self.cache[key] = (time.time() + (1 if result.get('timingPending') else 3600), result)
                if result.get('timedLines'):
                    self.video_cache[key[0]] = (time.time() + 3600, result)
                    while len(self.video_cache) > 6:
                        self.video_cache.popitem(last=False)
            elif not result.get('error') and key[1] and key[2]:
                self.cache[key] = (time.time() + 2, result)
            while len(self.cache) > 6:
                self.cache.popitem(last=False)

    def _resolve(self, key, video_id, metadata):
        deadline = time.monotonic() + 10
        youtube = self._youtube(video_id)
        pending = {youtube}
        has_metadata = bool(metadata.get('title') and metadata.get('artist') and str(metadata['title']).lower() != 'loading...')
        lrc = self._external(metadata) if has_metadata else None
        if lrc:
            pending.add(lrc)
        best, failed, plain_deadline = {}, False, None
        canonical_metadata, retried_canonical = None, False
        fields = ('title', 'artist', 'duration')
        original_signature = tuple(str(metadata.get(field) or '') for field in fields)
        while pending:
            remaining = min(deadline, plain_deadline or deadline) - time.monotonic()
            if remaining <= 0:
                break
            done, pending = wait(pending, timeout=remaining, return_when=FIRST_COMPLETED)
            if not done:
                break
            for future in done:
                try:
                    if future is youtube:
                        result, canonical, error = future.result()
                        failed = failed or error
                        # A Cast video can arrive before its title, artist or duration.
                        # Canonical metadata fills the missing fields, not a random queue row.
                        richer = {**metadata}
                        for field in ('title', 'artist', 'album', 'duration'):
                            if not richer.get(field) or str(richer[field]).lower() in ('loading...', 'unknown'):
                                richer[field] = canonical.get(field)
                        if richer.get('title') and richer.get('artist') and not result.get('timedLines'):
                            changed = tuple(str(richer.get(field) or '') for field in fields) != original_signature
                            if lrc is None or (changed and lrc.done()):
                                lrc = self._external(richer)
                                pending.add(lrc)
                                retried_canonical = True
                            elif changed:
                                canonical_metadata = richer
                    else:
                        result = future.result()
                        if future is lrc and not result.get('timedLines') and canonical_metadata and not retried_canonical:
                            lrc = self._external(canonical_metadata)
                            pending.add(lrc)
                            retried_canonical = True
                    if result.get('timedLines'):
                        return result
                    if result.get('lyrics') and not best:
                        best = result
                        plain_deadline = time.monotonic() + .45
                except Exception:
                    failed = True
        if best:
            if pending:
                best = {**best, 'timingPending': True}
                def upgrade(done):
                    try:
                        value = done.result()
                        value = value[0] if isinstance(value, tuple) else value
                        if value.get('timedLines'):
                            self._save(key, value)
                    except Exception:
                        pass
                for future in pending:
                    future.add_done_callback(upgrade)
            return best
        return {'error': 'Could not load lyrics. Please try again.'} if failed or pending else {'lyrics': None}

    def resolve(self, video_id, metadata=None):
        metadata = metadata if isinstance(metadata, dict) else {}
        key = (video_id, *(str(metadata.get(field) or '') for field in ('title', 'artist', 'duration', 'album')))
        with self.lock:
            for cached in (self.video_cache.get(video_id), self.cache.get(key)):
                if cached and cached[0] > time.time():
                    return cached[1]
            if self._closed:
                return {'error': 'Lyrics cancelled'}
            pending = self._pending.get(key)
            if pending is None:
                if len(self._pending) >= 8:
                    return {'error': 'Lyrics are busy. Please try again.'}
                pending = self._pending[key] = Future()
                owner = True
            else:
                owner = False
        if not owner:
            return pending.result(timeout=11)
        try:
            result = self._resolve(key, video_id, metadata)
            self._save(key, result)
            pending.set_result(result)
            return result
        except Exception:
            result = {'error': 'Could not load lyrics. Please try again.'}
            pending.set_result(result)
            return result
        finally:
            with self.lock:
                if self._pending.get(key) is pending:
                    self._pending.pop(key, None)

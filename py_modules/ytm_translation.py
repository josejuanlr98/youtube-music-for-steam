"""Optional, on-demand lyric translation. No account data is sent to the provider."""
from html import unescape
from collections import OrderedDict
from hashlib import sha256
from time import monotonic

import requests

SUPPORTED = frozenset({'en', 'es', 'fr', 'de', 'pt', 'it', 'ja'})
_cache = OrderedDict()
_quota_retry_at = 0


def translate_lyrics(lyrics, target):
    global _quota_retry_at
    if target not in SUPPORTED or not isinstance(lyrics, str):
        return {'error': 'Unsupported translation request'}
    cache_key = sha256((target + '\0' + lyrics).encode('utf-8')).digest()
    if cache_key in _cache:
        _cache.move_to_end(cache_key)
        return _cache[cache_key]
    lines = lyrics.split('\n')
    if len(lyrics) > 12000 or len(lines) > 240:
        return {'error': 'Lyrics are too long to translate'}
    content = [line for line in lines if line.strip()]
    if not content:
        return {'error': 'No lyrics to translate'}
    try:
        from langdetect import DetectorFactory, detect
        DetectorFactory.seed = 0
        source = detect('\n'.join(content))
    except Exception:
        return {'error': 'Could not detect lyric language'}
    source = source.split('-')[0]
    if source == target:
        return {'translatedLines': lines, 'sourceLanguage': source}
    if source not in SUPPORTED:
        return {'error': 'This lyric language is not supported for translation'}
    if monotonic() < _quota_retry_at:
        return {'error': 'Translation provider daily limit reached. Try again later.'}

    # MyMemory limits request size. Keep line boundaries so translations align
    # with timed lyrics; if a response changes their count, retain originals.
    chunks = []
    current = []
    size = 0
    for line in content:
        byte_count = len(line.encode('utf-8'))
        if byte_count > 480:
            return {'error': 'A lyric line is too long to translate'}
        if current and size + byte_count + 1 > 480:
            chunks.append(current)
            current = []
            size = 0
        current.append(line)
        size += byte_count + 1
    if current:
        chunks.append(current)
    if len(chunks) > 16:
        return {'error': 'Lyrics exceed the translation service limit'}

    deadline = monotonic() + 15
    def fetch(chunk):
        remaining = deadline - monotonic()
        if remaining <= 0:
            raise TimeoutError()
        with requests.Session() as session:
            response = session.get(
                'https://api.mymemory.translated.net/get',
                params={'q': '\n'.join(chunk), 'langpair': f'{source}|{target}'},
                timeout=min(5, remaining),
            )
            data = response.json()
            if response.status_code == 429 or int(data.get('responseStatus', 0)) == 429:
                raise TranslationQuotaError()
            response.raise_for_status()
            if int(data.get('responseStatus', 0)) != 200:
                raise ValueError('Provider rejected the translation')
            converted = unescape(data['responseData']['translatedText']).split('\n')
            if len(converted) != len(chunk):
                raise ValueError('Translation line count changed')
            return converted

    try:
        # Sequential requests stop immediately on quota exhaustion instead of
        # spending several daily-quota requests in parallel for the same song.
        translated = [line for group in chunks for line in fetch(group)]
    except TranslationQuotaError:
        _quota_retry_at = monotonic() + 900
        return {'error': 'Translation provider daily limit reached. Try again later.'}
    except (requests.RequestException, KeyError, ValueError, TimeoutError, TypeError):
        return {'error': 'Translation is temporarily unavailable'}

    translated_iter = iter(translated)
    result = {'translatedLines': [next(translated_iter) if line.strip() else '' for line in lines], 'sourceLanguage': source}
    _cache[cache_key] = result
    if len(_cache) > 32:
        _cache.popitem(last=False)
    return result


class TranslationQuotaError(Exception):
    pass

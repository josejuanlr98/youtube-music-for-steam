"""Free opt-in translation, line-aligned caching and independent requests."""
from collections import OrderedDict
from concurrent.futures import Future, ThreadPoolExecutor
from hashlib import sha256
from html import unescape
from pathlib import Path
from threading import RLock
from time import monotonic
import json
import re
import requests

SUPPORTED = frozenset({'en', 'es', 'fr', 'de', 'pt', 'it', 'ja'})
_cache = OrderedDict()
_lock = RLock()
_pending = {}
_source_cache = OrderedDict()
_loaded_path = None
_quota_retry_at = 0
_apertium_pairs = None
_apertium_pairs_until = 0
_apertium_pending = None
_ISO3 = {'en': 'eng', 'es': 'spa', 'fr': 'fra', 'de': 'deu', 'pt': 'por', 'it': 'ita', 'ja': 'jpn'}


class TranslationQuotaError(Exception):
    pass


def _key(text, source, target):
    return sha256((source + '|' + target + '\0' + text).encode('utf-8')).hexdigest()


def _load_cache(path):
    global _loaded_path
    if not path or _loaded_path == path:
        return
    _loaded_path = path
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if isinstance(data, dict):
            for key, value in list(data.items())[-4096:]:
                if re.fullmatch(r'[a-f0-9]{64}', key) and isinstance(value, str) and len(value) < 2000:
                    _cache[key] = value
    except (OSError, ValueError, TypeError):
        pass


def _save_cache(path):
    while len(_cache) > 4096:
        _cache.popitem(last=False)
    if not path:
        return
    try:
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix('.tmp')
        temporary.write_text(json.dumps(_cache, ensure_ascii=False), encoding='utf-8')
        temporary.replace(destination)
    except OSError:
        pass


def translate_lyrics(lyrics, target, cache_path=None):
    if not isinstance(target, str) or target not in SUPPORTED or not isinstance(lyrics, str):
        return {'error': 'Unsupported translation request'}
    if len(lyrics) > 12000 or len(lyrics.split('\n')) > 240:
        return {'error': 'Lyrics are too long to translate'}
    job = (sha256(lyrics.encode('utf-8')).hexdigest(), target, cache_path)
    with _lock:
        owner = job not in _pending
        future = _pending.setdefault(job, Future())
    if not owner:
        try:
            return future.result(timeout=16)
        except TimeoutError:
            return {'error': 'Translation is still loading. Please retry.'}
    try:
        # No network request holds the shared cache lock. Changing the language
        # or song cannot be trapped behind an unrelated slow translation.
        result = _translate(lyrics, target, cache_path)
        future.set_result(result)
        return result
    except Exception:
        result = {'error': 'Translation is temporarily unavailable. Please retry.'}
        future.set_result(result)
        return result
    finally:
        with _lock:
            if _pending.get(job) is future:
                _pending.pop(job, None)


def _pairs(deadline):
    global _apertium_pairs, _apertium_pairs_until, _apertium_pending
    with _lock:
        if monotonic() < _apertium_pairs_until:
            return _apertium_pairs or set()
        owner = _apertium_pending is None
        if owner:
            _apertium_pending = Future()
        future = _apertium_pending
    if not owner:
        try:
            return future.result(timeout=max(.01, deadline - monotonic()))
        except TimeoutError:
            return set()
    pairs = set()
    try:
        remaining = deadline - monotonic()
        if remaining <= 0:
            return pairs
        with requests.Session() as session:
            response = session.get('https://www.apertium.org/apy/listPairs', timeout=min(2, remaining))
            response.raise_for_status()
            data = response.json()
            pairs = {(item['sourceLanguage'], item['targetLanguage']) for item in data['responseData']}
    except (requests.RequestException, ValueError, KeyError, TypeError):
        pass
    finally:
        with _lock:
            _apertium_pairs, _apertium_pairs_until = pairs, monotonic() + (3600 if pairs else 60)
            future.set_result(pairs)
            _apertium_pending = None
    return pairs


def _apertium_translate(lines, source, target, deadline):
    """Documented no-key fallback; use only pairs advertised by the server."""
    if not lines or source not in _ISO3 or target not in _ISO3:
        return {}
    pair = (_ISO3[source], _ISO3[target])
    if pair not in _pairs(deadline):
        return {}
    converted = {}
    # A single batch is faster and consumes fewer requests than per-line calls.
    batches, current, size = [], [], 0
    for line in lines:
        count = len(line.encode('utf-8'))
        if current and size + count + 1 > 2400:
            batches.append(current); current, size = [], 0
        current.append(line); size += count + 1
    if current:
        batches.append(current)
    with requests.Session() as session:
        for batch in batches:
            remaining = deadline - monotonic()
            if remaining <= 0:
                break
            try:
                response = session.get('https://www.apertium.org/apy/translate',
                    params={'q': '\n'.join(batch), 'langpair': '|'.join(pair), 'markUnknown': 'no'},
                    timeout=min(4, remaining))
                response.raise_for_status()
                data = response.json()
                if int(data.get('responseStatus', 0)) != 200:
                    break
                text = data['responseData']['translatedText']
                result = unescape(text).replace('\r\n', '\n').strip().split('\n')
                if len(result) == len(batch) and all(line.strip() for line in result):
                    converted.update((original, line.strip()) for original, line in zip(batch, result))
            except (requests.RequestException, ValueError, KeyError, TypeError, AttributeError):
                break
    return converted


def _translate(lyrics, target, cache_path):
    global _quota_retry_at
    lines = lyrics.split('\n')
    content = list(dict.fromkeys(line.strip() for line in lines if line.strip()))
    if not content:
        return {'error': 'No lyrics to translate'}
    try:
        from langdetect import DetectorFactory, detect
        from langdetect.detector_factory import init_factory
        source_key = sha256('\n'.join(content).encode('utf-8')).hexdigest()
        with _lock:
            source = _source_cache.get(source_key)
            # langdetect exposes its factory before loading profiles. Protect
            # that first initialization, while all HTTP requests stay parallel.
            if source is None:
                DetectorFactory.seed = 0
                init_factory()
        if source is None:
            source = detect('\n'.join(content))
            with _lock:
                if len(_source_cache) >= 128:
                    _source_cache.popitem(last=False)
                _source_cache[source_key] = source
    except Exception:
        return {'error': 'Could not detect lyric language'}
    if source == target:
        return {'translatedLines': lines, 'sourceLanguage': source, 'complete': True}
    with _lock:
        _load_cache(cache_path)
        converted = {line: _cache[_key(line, source, target)] for line in content if _key(line, source, target) in _cache}
    missing = [line for line in content if line not in converted]
    if missing:
        deadline = monotonic() + 12
        memory_deadline = deadline - 4
        chunks, current, size = [], [], 0
        for line in missing:
            count = len(line.encode('utf-8'))
            if count > 480:
                continue
            if current and size + count + 1 > 480:
                chunks.append(current); current, size = [], 0
            current.append(line); size += count + 1
        if current:
            chunks.append(current)

        def fetch(chunk):
            global _quota_retry_at
            output = {}
            if monotonic() >= memory_deadline or monotonic() < _quota_retry_at:
                return output
            try:
                with requests.Session() as session:
                    def request(text):
                        global _quota_retry_at
                        remaining = memory_deadline - monotonic()
                        if remaining <= 0:
                            raise TimeoutError()
                        if monotonic() < _quota_retry_at:
                            raise TranslationQuotaError()
                        response = session.get('https://api.mymemory.translated.net/get',
                            params={'q': text, 'langpair': f'{source}|{target}'}, timeout=min(4, remaining))
                        data = response.json()
                        if response.status_code == 429 or int(data.get('responseStatus', 0)) == 429 or data.get('quotaFinished') is True:
                            details = str(data.get('responseDetails') or '')
                            wait = re.search(r'(\d+) HOURS?\s+(\d+) MINUTES?\s+(\d+) SECONDS?', details)
                            seconds = sum(int(value) * factor for value, factor in zip(wait.groups(), (3600, 60, 1))) if wait else 900
                            with _lock:
                                _quota_retry_at = monotonic() + max(60, min(86400, seconds))
                            raise TranslationQuotaError()
                        response.raise_for_status()
                        if int(data.get('responseStatus', 0)) != 200:
                            raise ValueError()
                        text = data['responseData']['translatedText']
                        if not isinstance(text, str) or not text.strip():
                            raise ValueError()
                        return unescape(text).replace('\r\n', '\n').strip()
                    result = request('\n'.join(chunk)).split('\n')
                    if len(result) == len(chunk) and all(line.strip() for line in result):
                        output.update((line, translated.strip()) for line, translated in zip(chunk, result))
                    else:
                        for line in chunk:
                            output[line] = request(line)
            except (requests.RequestException, ValueError, KeyError, TypeError, TimeoutError, TranslationQuotaError):
                pass
            return output

        with ThreadPoolExecutor(max_workers=2) as workers:
            for result in workers.map(fetch, chunks):
                converted.update(result)
        remaining = [line for line in content if line not in converted]
        converted.update(_apertium_translate(remaining, source, target, deadline))
        with _lock:
            for original, translation in converted.items():
                _cache[_key(original, source, target)] = translation
            _save_cache(cache_path)
    translated = [converted.get(line.strip(), '') if line.strip() else '' for line in lines]
    complete = all(line in converted for line in content)
    result = {'sourceLanguage': source, 'complete': complete}
    if any(translated):
        result['translatedLines'] = translated
    if not complete:
        result['error'] = ('Translation provider daily limit reached; the free fallback does not support every language. Try later.'
                           if monotonic() < _quota_retry_at else 'Some translated lines could not load. Retry translation.')
    return result

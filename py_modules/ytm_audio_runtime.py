"""Audio engine staging and verified stable updates shared by local and Cast playback."""
import hashlib
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
import urllib.request
import zipfile

_LOCK = threading.Lock()
_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
_VERSION = re.compile(r'\d{4}\.\d{2}\.\d{2}(?:\.\d+)?')


@contextmanager
def audio_cookies(auth_path):
    """Scope the already imported YouTube session to YouTube, never media CDNs."""
    cookie_file = None
    directory = None
    try:
        path = Path(auth_path)
        if path.is_file() and path.stat().st_size <= 1024 * 1024:
            headers = json.loads(path.read_text(encoding='utf-8'))
            cookie = next((value for name, value in headers.items() if name.lower() == 'cookie'), '') if isinstance(headers, dict) else ''
            rows = []
            if isinstance(cookie, str) and not any(char in cookie for char in '\r\n\t'):
                for part in cookie.split(';'):
                    name, separator, value = part.strip().partition('=')
                    if separator and re.fullmatch(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+", name) and value and all(32 <= ord(char) < 127 for char in value):
                        rows.append(f'.youtube.com\tTRUE\t/\tTRUE\t0\t{name}\t{value}')
            if rows:
                directory = tempfile.TemporaryDirectory(prefix='ytm-audio-session-')
                os.chmod(directory.name, 0o700)
                cookie_file = Path(directory.name) / 'cookies.txt'
                atomic_write(cookie_file, ('# Netscape HTTP Cookie File\n' + '\n'.join(rows) + '\n').encode(), 0o600)
    except (OSError, ValueError, TypeError):
        cookie_file = None  # Cast guests and missing sessions remain supported.
    try:
        yield str(cookie_file) if cookie_file else None
    finally:
        if directory:
            directory.cleanup()


class AudioLookupError(Exception):
    def __init__(self, message, code='AUDIO_LOOKUP_FAILED', retryable=False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable

    def result(self):
        return {'error': str(self), 'code': self.code, 'retryable': self.retryable}


def audio_failure(stderr):
    text = str(stderr).lower()
    if 'no supported javascript runtime' in text or 'unsupported runtime' in text:
        return AudioLookupError('The audio engine needs Node 22 or newer. Install the current plugin ZIP.', 'RUNTIME_UNSUPPORTED')
    if re.search(r'\b(?:http(?: error)?|status(?: code)?)\s*:?\s*429\b', text) or 'too many requests' in text:
        return AudioLookupError('YouTube temporarily blocked audio requests (HTTP 429). Wait and retry; your queue was kept.', 'YOUTUBE_BLOCKED')
    if 'not a bot' in text or 'confirm you’re not' in text or 'confirm you\'re not' in text:
        return AudioLookupError('YouTube requires a browser verification before it will provide audio. Retrying more songs will not fix this.', 'YOUTUBE_VERIFICATION')
    if 'sign in' in text and ('confirm' in text or 'required' in text or 'age' in text):
        return AudioLookupError('YouTube requires a valid signed-in session for this audio.', 'YOUTUBE_AUTH_REQUIRED')
    if re.search(r'\bhttp(?: error)?\s*:?\s*403\b', text):
        return AudioLookupError('YouTube rejected this audio request (HTTP 403). The stream or playback verification may have expired.', 'YOUTUBE_FORBIDDEN')
    if any(value in text for value in ('timed out', 'timeout', 'connection', 'name resolution', 'network is unreachable', 'unable to download')):
        return AudioLookupError('Could not connect to YouTube audio. Check your connection and retry.', 'AUDIO_NETWORK', True)
    if any(value in text for value in ('private video', 'video unavailable', 'video is unavailable', 'has been removed', 'not available in your country', 'age-restricted', 'members-only', 'copyright')):
        return None
    return AudioLookupError('YouTube did not provide a compatible audio stream. Please retry.', 'AUDIO_LOOKUP_FAILED')


def version(path):
    with zipfile.ZipFile(path) as archive:
        text = archive.read('yt_dlp/version.py').decode('utf-8')
        match = re.search(r"__version__\s*=\s*['\"](\d{4}\.\d{2}\.\d{2}(?:\.\d+)?)['\"]", text)
        if not match or '__main__.py' not in archive.namelist():
            raise ValueError('Invalid yt-dlp release')
        return tuple(map(int, match[1].split('.')))


def atomic_write(path, data, mode=0o644):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def stage_extractor(source, destination):
    """Never replace a successfully updated extractor with an older bundled one."""
    if not _LOCK.acquire(blocking=False):
        if Path(destination).is_file():
            return  # A background download must not stall Settings/startup.
        raise OSError('Audio engine update is still in progress')
    try:
        source, destination = Path(source), Path(destination)
        try:
            if destination.exists() and version(destination) >= version(source):
                os.chmod(destination, 0o755)
                return
        except (OSError, ValueError, zipfile.BadZipFile):
            pass
        version(source)
        atomic_write(destination, source.read_bytes(), 0o755)
    finally:
        _LOCK.release()


def _download(url, limit):
    request = urllib.request.Request(url, headers={'User-Agent': 'YouTube-Music-for-Steam', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=12) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Update response exceeded its size limit')
    return data


def _probe(candidate, node):
    # A future stable extractor must accept our JS runtime before replacing the
    # working copy. Use a separate interpreter; never import update code into Decky.
    script = ('import sys;sys.path.insert(0,sys.argv[1]);'
              'from yt_dlp.utils._jsruntime import NodeJsRuntime;'
              'i=NodeJsRuntime(sys.argv[2]).info;sys.exit(0 if i and i.supported else 1)')
    env = os.environ.copy()
    env.pop('LD_LIBRARY_PATH', None)
    env.pop('PYTHONPATH', None)
    subprocess.run(['python3', '-c', script, str(candidate), str(node)],
                   env=env, capture_output=True, timeout=12, check=True)


def check_for_update(destination, node, now=None):
    """Check stable releases daily; retry failed checks after an hour, keeping audio usable."""
    destination = Path(destination)
    state_path = destination.with_name('update-state.json')
    now = time.time() if now is None else now
    with _LOCK:
        try:
            state = json.loads(state_path.read_text())
        except (OSError, ValueError):
            state = {}
        if not isinstance(state, dict) or type(state.get('checked')) not in (int, float):
            state = {}
        if 'checked' in state and 0 <= now - state['checked'] < (86400 if state.get('ok') else 3600):
            return {**state, 'status': 'cached'}
        temporary = None
        try:
            release = json.loads(_download(_API, 1024 * 1024))
            tag = release['tag_name']
            if not _VERSION.fullmatch(tag) or release.get('prerelease') or release.get('draft'):
                raise ValueError('Not an official stable version')
            current = version(destination)
            latest = tuple(map(int, tag.split('.')))
            if latest <= current:
                result = {'status': 'current', 'version': '.'.join(map(str, current))}
            else:
                base = f'https://github.com/yt-dlp/yt-dlp/releases/download/{tag}/'
                asset = next(a for a in release['assets'] if a['name'] == 'yt-dlp')
                if asset['browser_download_url'] != base + 'yt-dlp':
                    raise ValueError('Unexpected update source')
                sums = _download(base + 'SHA2-256SUMS', 1024 * 1024).decode('utf-8')
                expected = next(line.split()[0] for line in sums.splitlines() if len(line.split()) == 2 and line.split()[1].lstrip('*') == 'yt-dlp')
                if not re.fullmatch(r'[0-9a-f]{64}', expected):
                    raise ValueError('Invalid release checksum')
                data = _download(base + 'yt-dlp', 20 * 1024 * 1024)
                digest = hashlib.sha256(data).hexdigest()
                if digest != expected or (asset.get('digest') and asset['digest'] != 'sha256:' + digest):
                    raise ValueError('Release checksum mismatch')
                fd, temporary = tempfile.mkstemp(prefix='yt-dlp-update.', dir=destination.parent)
                with os.fdopen(fd, 'wb') as output:
                    output.write(data)
                if version(temporary) != latest:
                    raise ValueError('Release version mismatch')
                _probe(temporary, node)
                os.chmod(temporary, 0o755)
                os.replace(temporary, destination)
                result = {'status': 'updated', 'version': tag}
            state = {'checked': now, 'ok': True, **result}
        except Exception as error:
            # Do not include network URLs, cookies or signed media URLs in the UI/log.
            state = {'checked': now, 'ok': False, 'status': 'failed', 'error': type(error).__name__}
        finally:
            if temporary and os.path.exists(temporary):
                os.unlink(temporary)
        atomic_write(state_path, (json.dumps(state) + '\n').encode())
        return state

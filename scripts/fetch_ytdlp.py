"""Fetch a pinned official extractor and verify the release checksum."""
import argparse
import hashlib
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'py_modules'))
from ytm_audio_runtime import _download, _VERSION, atomic_write, version


def fetch(release, destination):
    if not _VERSION.fullmatch(release):
        raise ValueError('Expected a stable yt-dlp release version')
    base = f'https://github.com/yt-dlp/yt-dlp/releases/download/{release}/'
    sums = _download(base + 'SHA2-256SUMS', 1024 * 1024).decode()
    expected = next(line.split()[0] for line in sums.splitlines() if len(line.split()) == 2 and line.split()[1].lstrip('*') == 'yt-dlp')
    if not destination.exists() or hashlib.sha256(destination.read_bytes()).hexdigest() != expected:
        data = _download(base + 'yt-dlp', 20 * 1024 * 1024)
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError('Official extractor checksum mismatch')
        atomic_write(destination, data, 0o755)
    if version(destination) != tuple(map(int, release.split('.'))):
        raise ValueError('Extractor version mismatch')
    print('Verified official yt-dlp:', release, expected)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    parser.add_argument('--destination', required=True, type=Path)
    args = parser.parse_args()
    fetch(args.version, args.destination)

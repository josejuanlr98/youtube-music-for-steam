"""Fetch a pinned official Linux runtime, verify its digest, and stage atomically."""
import argparse
import hashlib
import json
import re
import tarfile
import urllib.request
import zipfile
from pathlib import Path


def fetch_runtime(version, destination, cache):
    if not re.fullmatch(r'v\d+\.\d+\.\d+', version) or int(version[1:].split('.')[0]) < 22:
        raise ValueError('YouTube audio requires a supported Node runtime (22+)')
    metadata_path = destination.with_name('node.runtime.json')
    try:
        metadata = json.loads(metadata_path.read_text())
        if metadata['version'] == version and hashlib.sha256(destination.read_bytes()).hexdigest() == metadata['sha256']:
            print('Verified existing Node runtime:', version)
            return
    except (OSError, ValueError, KeyError, TypeError):
        pass
    cache.mkdir(parents=True, exist_ok=True)
    filename = f'node-{version}-linux-x64.tar.xz'
    base = f'https://nodejs.org/dist/{version}/'
    with urllib.request.urlopen(base+'SHASUMS256.txt', timeout=30) as response:
        sums = {name: digest for digest, name in (line.split() for line in response.read().decode().splitlines())}
    expected = sums[filename]
    archive_path = cache / filename
    if not archive_path.exists() or hashlib.sha256(archive_path.read_bytes()).hexdigest() != expected:
        temporary = archive_path.with_suffix('.download')
        with urllib.request.urlopen(base+filename, timeout=30) as response, temporary.open('wb') as output:
            while block := response.read(1024*1024):
                output.write(block)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
            raise ValueError('Official Node archive checksum mismatch')
        temporary.replace(archive_path)
    with tarfile.open(archive_path, 'r:xz') as archive:
        binary = archive.extractfile(f'node-{version}-linux-x64/bin/node').read()
        license_text = archive.extractfile(f'node-{version}-linux-x64/LICENSE').read()
    if not binary.startswith(b'\x7fELF'):
        raise ValueError('Expected Linux Node executable')
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.new')
    temporary.write_bytes(binary)
    temporary.chmod(0o755)
    temporary.replace(destination)
    metadata_path.write_text(json.dumps({'version':version, 'sha256':hashlib.sha256(binary).hexdigest(),
                                         'archive':base+filename, 'archiveSha256':expected}, indent=2)+'\n')
    destination.with_name('node.LICENSE').write_bytes(license_text)
    print('Installed verified Node runtime:', version)


def fetch_windows_probe(version, destination, cache):
    cache.mkdir(parents=True, exist_ok=True)
    filename = f'node-{version}-win-x64.zip'
    base = f'https://nodejs.org/dist/{version}/'
    with urllib.request.urlopen(base+'SHASUMS256.txt', timeout=30) as response:
        expected = next(line.split()[0] for line in response.read().decode().splitlines() if line.endswith(filename))
    archive_path = cache / filename
    if not archive_path.exists() or hashlib.sha256(archive_path.read_bytes()).hexdigest() != expected:
        urllib.request.urlretrieve(base+filename, archive_path)
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != expected:
        raise ValueError('Windows probe runtime checksum mismatch')
    with zipfile.ZipFile(archive_path) as archive:
        binary = archive.read(f'node-{version}-win-x64/node.exe')
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(binary)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    parser.add_argument('--destination', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--windows-probe', type=Path)
    args = parser.parse_args()
    fetch_runtime(args.version, args.destination, args.cache)
    if args.windows_probe:
        fetch_windows_probe(args.version, args.windows_probe, args.cache)

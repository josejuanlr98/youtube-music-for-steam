"""Offline smoke test of the actual shipped extractor/runtime combination."""
import argparse
import hashlib
import json
import logging
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace


def verify(root, probe_node=None):
    binary = root / 'bin/node'
    metadata = json.loads((root / 'bin/node.runtime.json').read_text())
    if hashlib.sha256(binary.read_bytes()).hexdigest() != metadata['sha256']:
        raise ValueError('Bundled Node digest does not match the verified release')
    if not binary.read_bytes()[:4] == b'\x7fELF':
        raise ValueError('The installer must contain the Linux runtime')
    node = str(probe_node or binary.resolve())
    version = subprocess.check_output([node, '--version'], text=True, timeout=5).strip()
    if version != metadata['version']:
        raise ValueError(f'Expected {metadata["version"]}, received {version}')
    sys.path.insert(0, str((root / 'bin/yt-dlp').resolve()))
    from yt_dlp.utils._jsruntime import NodeJsRuntime
    from yt_dlp.extractor.youtube.jsc._builtin.node import NodeJCP
    runtime = NodeJsRuntime(node).info
    if not runtime or not runtime.supported:
        raise ValueError('The actual extractor rejects this JavaScript runtime')
    # Execute the extractor's real Node provider, including its permission flags.
    provider = SimpleNamespace(runtime_info=runtime, _ARGS=['-'],
                               ejs_setting=lambda *args: ['false'],
                               logger=logging.getLogger('audio-smoke'),
                               _clean_stderr=lambda value: value.strip())
    output = NodeJCP._run_js_runtime(provider, 'console.log(JSON.stringify({ok:[1,2,3].reduce((a,b)=>a+b,0)===6}))')
    if json.loads(output) != {'ok': True}:
        raise ValueError('The extractor JavaScript provider did not execute')
    print('PASS actual yt-dlp Node provider:', version, '(offline; no claim of live media playback)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--probe-node', type=Path, help='Same-release host runtime for Windows smoke tests')
    args = parser.parse_args()
    verify(args.root, args.probe_node)

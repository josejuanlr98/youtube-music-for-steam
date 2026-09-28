"""Package an already built local checkout; does not upload or modify git."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
slug = f"youtube-music-for-steam-{version}"

runtime = set()
for directory in ["dist", "backend/out", "backend/xml", "py_modules", "bin"]:
    runtime.update(p for p in (root / directory).rglob("*")
                   if p.is_file() and "__pycache__" not in p.parts and p.suffix not in {".pyc", ".pyo"})
runtime.update(root / name for name in ["package.json", "plugin.json", "main.py", "LICENSE", f"RELEASE-{version}.md"])
for required in ["dist/index.js", "backend/out/server.cjs", "bin/node", "bin/yt-dlp", "py_modules/ytmusicapi/__init__.py"]:
    assert (root / required).is_file(), f"Missing runtime file: {required}"


def archive(name, prefix, files, compiled=True):
    target = output / name
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(files):
            relative = p.relative_to(root).as_posix()
            info = zipfile.ZipInfo.from_file(p, f"{prefix}/{relative}")
            info.create_system = 3
            info.external_attr = (0o100755 if relative in {"bin/node", "bin/yt-dlp"} else 0o100644) << 16
            z.writestr(info, p.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        assert json.loads(z.read(f"{prefix}/package.json"))["version"] == version
        if compiled:
            assert b"Lyrics" in z.read(f"{prefix}/dist/index.js")
            assert b"playbackId" in z.read(f"{prefix}/backend/out/server.cjs")
        else:
            for required in ["backend/src/server.ts", "src/index.tsx", "rollup.config.js", "tsconfig.json"]:
                assert f"{prefix}/{required}" in z.namelist(), required
        for p in files:
            assert z.read(f"{prefix}/{p.relative_to(root).as_posix()}") == p.read_bytes()
    print(f"Verified {name}: {target.stat().st_size / 1024**2:.1f} MiB, {len(files)} files")
    return hashlib.sha256(target.read_bytes()).hexdigest() + "  " + name


tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode("utf-8").split("\0")
new_sources = subprocess.check_output([
    "git", "ls-files", "-z", "--others", "--exclude-standard", "--",
    "src", "backend/src", "backend/tests", "tests", "scripts",
], cwd=root).decode("utf-8").split("\0")
source = runtime | {root / name for name in tracked + new_sources if name}
hashes = [archive(f"{slug}.zip", "YouTube Music", runtime),
          archive(f"{slug}-source.zip", f"{slug}-source", source)]
review = {p for p in source if p.relative_to(root).parts[0] not in {"bin", "dist", "outputs", ".git"}
          and not p.relative_to(root).as_posix().startswith("backend/out/")
          and p.suffix not in {".zip", ".pyc", ".pyo"}}
review.add(root / "SOURCE-REVIEW.md")
hashes.append(archive(f"{slug}-source-review.zip", f"{slug}-source-review", review, compiled=False))
(output / f"SHA256SUMS-{version}.txt").write_text("\n".join(hashes) + "\n", encoding="utf-8")

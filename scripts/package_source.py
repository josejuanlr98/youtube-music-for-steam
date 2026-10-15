"""Build a small, reviewable source archive without dependencies or local state."""
import argparse
from pathlib import Path
import zipfile


SOURCE_DIRS = ("src", "backend/src", "backend/tests", "backend/xml", "tests", "scripts", "screenshots")
SOURCE_FILES = (
    "main.py",
    "py_modules/ytm_firefox.py",
    "py_modules/ytm_lyrics.py",
    "py_modules/ytm_translation.py",
    "py_modules/ytm_catalog.py",
    "py_modules/ytm_audio_runtime.py",
    "package.json",
    "pnpm-lock.yaml",
    "rollup.config.js",
    "tsconfig.json",
    "backend/tsconfig.json",
    "vitest.config.ts",
    ".github/workflows/ci.yml",
    "requirements.txt",
    "plugin.json",
    "build.ps1",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
)


def wanted_files(source: Path, version: str):
    paths: set[Path] = set()
    for directory in SOURCE_DIRS:
        root = source / directory
        if root.exists():
            paths.update(path for path in root.rglob("*") if path.is_file())
    for relative in (*SOURCE_FILES, f"RELEASE-{version}.md"):
        path = source / relative
        if path.is_file():
            paths.add(path)
    return sorted(
        path for path in paths
        if "__pycache__" not in path.parts and path.suffix not in {".pyc", ".zip"}
    )


def package(source: Path, output: Path, version: str) -> None:
    source = source.resolve()
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    root_name = f"youtube-music-for-steam-{version}-source"
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        # Decky recognizes a plugin.json directly beneath the archive root as
        # an installer. Nest developer sources to prevent accidental loading
        # of a second uncompiled plugin alongside the actual runtime.
        archive.writestr(f"{root_name}/SOURCE-ONLY.txt",
                         "Developer source archive. Do not install this ZIP in Decky.\n"
                         f"Install youtube-music-for-steam-{version}.zip instead.\n"
                         "The editable project is in project/.\n")
        for path in wanted_files(source, version):
            relative = path.relative_to(source).as_posix()
            archive.write(path, f"{root_name}/project/{relative}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    package(args.source, args.output, args.version)


if __name__ == "__main__":
    main()

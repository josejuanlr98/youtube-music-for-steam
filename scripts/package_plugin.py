"""Create a Decky plugin ZIP while preserving SteamOS executable permissions."""
import argparse
from pathlib import Path
import stat
import zipfile


def package(source: Path, output: Path, plugin_name: str) -> None:
    source = source.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(source.rglob("*")):
            if not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
                continue
            relative = path.relative_to(source).as_posix()
            if "Cryptodome" in path.parts and "SelfTest" in path.parts:
                continue
            archive_name = f"{plugin_name}/{relative}"
            info = zipfile.ZipInfo(archive_name)
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            is_executable = relative in ("bin/node", "bin/yt-dlp")
            info.external_attr = ((stat.S_IFREG | (0o755 if is_executable else 0o644)) << 16)
            info.flag_bits |= 0x800
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    package(args.source, args.output, args.name)


if __name__ == "__main__":
    main()

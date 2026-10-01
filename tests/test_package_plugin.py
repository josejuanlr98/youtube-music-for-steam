import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.package_plugin import package


class PackagePluginTests(unittest.TestCase):
    def test_decky_zip_preserves_executables_and_skips_python_cache(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "plugin"
            (source / "bin").mkdir(parents=True)
            (source / "bin/node").write_bytes(b"node")
            (source / "bin/yt-dlp").write_bytes(b"yt-dlp")
            (source / "main.py").write_text("print('ok')")
            (source / "__pycache__").mkdir()
            (source / "__pycache__/main.cpython-314.pyc").write_bytes(b"invalid for Deck")
            (source / "py_modules/Cryptodome/SelfTest").mkdir(parents=True)
            (source / "py_modules/Cryptodome/SelfTest/test.py").write_text("not needed at runtime")
            output = root / "plugin.zip"
            package(source, output, "YouTube Music")
            with zipfile.ZipFile(output) as archive:
                self.assertIsNone(archive.testzip())
                entries = {item.filename: item for item in archive.infolist()}
                self.assertEqual(entries["YouTube Music/bin/node"].create_system, 3)
                self.assertEqual(stat.S_IMODE(entries["YouTube Music/bin/node"].external_attr >> 16), 0o755)
                self.assertEqual(stat.S_IMODE(entries["YouTube Music/bin/yt-dlp"].external_attr >> 16), 0o755)
                self.assertEqual(stat.S_IMODE(entries["YouTube Music/main.py"].external_attr >> 16), 0o644)
                self.assertFalse(any("__pycache__" in name or name.endswith(".pyc") or "Cryptodome/SelfTest" in name for name in entries))


if __name__ == "__main__":
    unittest.main()

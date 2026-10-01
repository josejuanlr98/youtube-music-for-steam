import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from test_regressions import module

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py_modules"))
from ytm_firefox import read_firefox_headers


class FirefoxImportTests(unittest.IsolatedAsyncioTestCase):
    def profile(self, home, flatpak=False):
        root = Path(home) / (".var/app/org.mozilla.firefox/.mozilla/firefox" if flatpak else ".mozilla/firefox")
        profile = root / "test.default-release"
        profile.mkdir(parents=True)
        (root / "profiles.ini").write_text("[Profile0]\nName=default\nIsRelative=1\nPath=test.default-release\nDefault=1\n")
        db = sqlite3.connect(profile / "cookies.sqlite")
        db.execute("CREATE TABLE moz_cookies (name TEXT,value TEXT,host TEXT,path TEXT,expiry INTEGER,originAttributes TEXT)")
        db.executemany("INSERT INTO moz_cookies VALUES (?,?,?,?,?,?)", [
            ("SAPISID", "synthetic-session", ".youtube.com", "/", int(time.time())+3600, ""),
            ("__Secure-3PAPISID", "synthetic-session", ".youtube.com", "/", int(time.time())+3600, ""),
            ("SID", "synthetic-sid", ".youtube.com", "/", 0, ""),
            ("OTHER", "must-not-import", ".example.com", "/", 0, ""),
            ("EXPIRED", "old", ".youtube.com", "/", 1, ""),
            ("CONTAINER", "other-account", ".youtube.com", "/", 0, "^userContextId=1"),
        ])
        db.commit()
        db.close()
        return profile / "cookies.sqlite"

    async def test_native_and_flatpak_only_read_youtube_default_container(self):
        for flatpak in (False, True):
            with tempfile.TemporaryDirectory() as home:
                database = self.profile(home, flatpak)
                before = database.read_bytes()
                headers = read_firefox_headers(home)
                self.assertIn("SAPISID=synthetic-session", headers["cookie"])
                self.assertNotIn("OTHER", headers["cookie"])
                self.assertNotIn("EXPIRED", headers["cookie"])
                self.assertNotIn("CONTAINER", headers["cookie"])
                self.assertEqual(headers["x-goog-authuser"], "0")
                self.assertTrue(headers["authorization"].startswith("SAPISIDHASH "))
                self.assertEqual(database.read_bytes(), before)

    async def test_zen_profile_is_discovered_without_profiles_ini(self):
        with tempfile.TemporaryDirectory() as home:
            root = Path(home) / ".var/app/app.zen_browser.zen/.zen/profiles/abc.default"
            root.mkdir(parents=True)
            db = sqlite3.connect(root / "cookies.sqlite")
            db.execute("CREATE TABLE moz_cookies (name TEXT,value TEXT,host TEXT,path TEXT,expiry INTEGER,originAttributes TEXT)")
            db.execute("INSERT INTO moz_cookies VALUES (?,?,?,?,?,?)", ("__Secure-3PAPISID", "zen-cookie", ".youtube.com", "/", 0, ""))
            db.commit(); db.close()
            self.assertIn("zen-cookie", read_firefox_headers(home)["cookie"])

    async def test_missing_profile_has_actionable_message(self):
        with tempfile.TemporaryDirectory() as home:
            with self.assertRaisesRegex(ValueError, "Desktop Mode"):
                read_firefox_headers(home)

    async def test_xdg_native_flatpak_and_grouped_profiles(self):
        for location in (".config/mozilla/firefox", ".var/app/org.mozilla.firefox/config/mozilla/firefox",
                         ".var/app/org.mozilla.firefox/.config/mozilla/firefox"):
            with tempfile.TemporaryDirectory() as home:
                database = self.profile(home)
                original = database.parent.parent
                destination = Path(home) / location
                destination.parent.mkdir(parents=True, exist_ok=True)
                original.rename(destination)
                self.assertIn("synthetic-session", read_firefox_headers(home)["cookie"])
                (destination / "profiles.ini").unlink()
                group = destination / "Profile Groups"
                group.mkdir()
                (destination / "test.default-release").rename(group / "test.default-release")
                self.assertIn("synthetic-session", read_firefox_headers(home)["cookie"])

    async def test_failed_validation_preserves_existing_session_and_file(self):
        with tempfile.TemporaryDirectory() as home:
            self.profile(home)
            saved = Path(home) / "browser.json"
            saved.write_text('{"previous":true}')
            plugin = module.Plugin()
            previous = plugin.ytmusic = Mock()
            with patch.object(module.decky, "DECKY_USER_HOME", home, create=True), patch.object(module, "BROWSER_AUTH_FILE", str(saved)), patch("ytmusicapi.YTMusic", side_effect=ValueError("expired")):
                result = await plugin.import_firefox_session()
            self.assertIn("error", result)
            self.assertEqual(saved.read_text(), '{"previous":true}')
            self.assertIs(plugin.ytmusic, previous)

    async def test_valid_import_atomically_replaces_saved_file(self):
        from ytmusicapi.auth.types import AuthType
        with tempfile.TemporaryDirectory() as home:
            self.profile(home, True)
            saved = Path(home) / "browser.json"
            saved.write_text('{"previous":true}')
            plugin = module.Plugin()
            candidate = Mock(auth_type=AuthType.BROWSER)
            with patch.object(module.decky, "DECKY_USER_HOME", home, create=True), patch.object(module, "BROWSER_AUTH_FILE", str(saved)), patch("ytmusicapi.YTMusic", return_value=candidate):
                self.assertTrue((await plugin.import_firefox_session())["success"])
            self.assertNotIn("previous", saved.read_text())
            self.assertIs(plugin.ytmusic, candidate)
            self.assertFalse(Path(str(saved)+".tmp").exists())

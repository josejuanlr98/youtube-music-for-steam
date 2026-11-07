import json
import sqlite3
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from test_regressions import module

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py_modules"))
from ytm_firefox import read_firefox_headers
from ytmusicapi.helpers import sapisid_from_cookie, get_visitor_id
from ytmusicapi.parsers.library import get_library_contents


class Release078PythonTests(unittest.IsolatedAsyncioTestCase):
    def test_sapisid_from_cookie_resilient_to_special_characters_in_prior_cookies(self):
        cookie_str = (
            'PREF=f6=40000000&tz=America.Mexico_City; '
            'WEIRD_JSON={"a":1,"b":"[2,3]"}; '
            '__Secure-3PAPISID=valid-sapisid-token/12345; '
            'SID=some-sid'
        )
        self.assertEqual(sapisid_from_cookie(cookie_str), "valid-sapisid-token/12345")

    def test_get_library_contents_handles_missing_tabs_gracefully(self):
        response = {
            "contents": {
                "singleColumnBrowseResultsRenderer": {}
            }
        }
        self.assertIsNone(get_library_contents(response, []))

    def test_get_visitor_id_never_raises_or_returns_none_on_changed_homepage(self):
        def fake_request(_url):
            return "<html><body>No ytcfg block here</body></html>"

        vid = get_visitor_id(fake_request)
        self.assertEqual(vid, {"X-Goog-Visitor-Id": ""})

    def test_normalize_headers_raw_supports_json_curl_netscape_and_bare_cookies(self):
        plugin = module.Plugin()
        # 1. JSON browser.json / Copy as fetch
        json_raw = json.dumps({
            "headers": {
                ":authority": "music.youtube.com",
                "Cookie": "__Secure-3PAPISID=abc; SID=def",
                "X-Goog-AuthUser": "0"
            }
        })
        normalized = plugin._normalize_headers_raw(json_raw)
        self.assertIn("cookie: __secure-3papisid=abc; sid=def", normalized.lower())
        self.assertNotIn(":authority", normalized)

        # 2. Copy as cURL
        curl_raw = (
            "curl 'https://music.youtube.com/youtubei/v1/browse' \\\n"
            "  -H ':authority: music.youtube.com' \\\n"
            "  -H 'cookie: __Secure-3PAPISID=curl-token; SID=curl-sid' \\\n"
            "  -b 'VISITOR_INFO1_LIVE=visitor123'"
        )
        normalized_curl = plugin._normalize_headers_raw(curl_raw)
        self.assertIn("__Secure-3PAPISID=curl-token", normalized_curl)

        # 3. Netscape cookies.txt
        netscape_raw = (
            "# Netscape HTTP Cookie File\n"
            ".youtube.com\tTRUE\t/\tTRUE\t1893456000\t__Secure-3PAPISID\tnetscape-token\n"
            ".youtube.com\tTRUE\t/\tTRUE\t1893456000\tSID\tnetscape-sid\n"
            ".example.com\tTRUE\t/\tFALSE\t1893456000\tOTHER\tignore-me\n"
        )
        normalized_netscape = plugin._normalize_headers_raw(netscape_raw)
        self.assertIn("__Secure-3PAPISID=netscape-token", normalized_netscape)
        self.assertNotIn("ignore-me", normalized_netscape)

        # 4. Bare cookie string
        bare_raw = "SID=bare-sid; __Secure-3PAPISID=bare-token; SAPISID=bare-token"
        normalized_bare = plugin._normalize_headers_raw(bare_raw)
        self.assertTrue(normalized_bare.lower().startswith("cookie:"))
        self.assertIn("__Secure-3PAPISID=bare-token", normalized_bare)

    def test_firefox_wal_and_zen_workspace_container_and_visitor_id(self):
        with tempfile.TemporaryDirectory() as home:
            root = Path(home) / ".var/app/io.gitlab.librewolf-community/.librewolf/zen.default"
            root.mkdir(parents=True)
            db_path = root / "cookies.sqlite"
            db = sqlite3.connect(db_path)
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE moz_cookies (name TEXT,value TEXT,host TEXT,path TEXT,expiry INTEGER,originAttributes TEXT)")
            db.executemany("INSERT INTO moz_cookies VALUES (?,?,?,?,?,?)", [
                ("__Secure-3PAPISID", "zen-workspace-sapisid", ".youtube.com", "/", int(time.time()) + 3600, "^userContextId=1"),
                ("SID", "zen-workspace-sid", ".youtube.com", "/", 0, "^userContextId=1"),
                ("VISITOR_INFO1_LIVE", "visitor-abc-999", ".youtube.com", "/", 0, "^userContextId=1"),
            ])
            db.commit()
            # Keep connection open so WAL file exists while reading
            headers = read_firefox_headers(home)
            db.close()
            self.assertIn("zen-workspace-sapisid", headers["cookie"])
            self.assertEqual(headers.get("x-goog-visitor-id"), "visitor-abc-999")

    async def test_deferred_boot_cast_reset_skips_when_already_advertising(self):
        plugin = module.Plugin()
        fake_response = Mock()
        fake_response.__enter__ = Mock(return_value=fake_response)
        fake_response.__exit__ = Mock(return_value=False)
        fake_response.read.return_value = b'{"advertising": true, "connected": false, "isPlaying": false, "track": null}'
        fake_opener = Mock()
        fake_opener.open.return_value = fake_response
        with patch("asyncio.sleep", return_value=None), \
             patch("urllib.request.build_opener", return_value=fake_opener), \
             patch.object(plugin, "hard_reset", new_callable=AsyncMock) as reset_mock:
            await plugin._deferred_boot_cast_reset()
            reset_mock.assert_not_called()

    async def test_single_page_playlist_with_filtered_unavailable_items_marks_complete(self):
        plugin = module.Plugin()
        plugin.ytmusic = Mock()
        playlist_payload = {
            "id": "PL123",
            "title": "Test Playlist",
            "trackCount": 3,
            "tracks": [
                {"videoId": "v1", "title": "Song 1", "artists": [{"name": "Artist"}], "duration_seconds": 180},
                {"videoId": None, "title": "Deleted Song"},
                {"videoId": "v2", "title": "Song 2", "artists": [{"name": "Artist"}], "duration_seconds": 200},
            ],
        }
        with patch.object(plugin, "_api_call", new=AsyncMock(return_value=playlist_payload)):
            result = await plugin._get_playlist_tracks("PL123", limit=0)
        self.assertEqual(len(result["tracks"]), 2)
        self.assertTrue(result["complete"])

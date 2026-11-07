"""On-demand, read-only import of the local user's YouTube Firefox session."""
import configparser
import hashlib
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time

SESSION_COOKIES = ("SID", "HSID", "SSID", "__Secure-1PSID", "__Secure-3PSID", "LOGIN_INFO")


def _query_youtube_rows(db_path: Path, now: int):
    connection = sqlite3.connect(db_path.as_uri() + "?mode=ro", uri=True, timeout=2)
    try:
        connection.execute("PRAGMA query_only=ON")
        rows = connection.execute(
            "SELECT name,value,host,path,originAttributes FROM moz_cookies "
            "WHERE host IN ('.youtube.com','youtube.com','music.youtube.com','.music.youtube.com') "
            "AND (expiry=0 OR expiry>?) "
            "ORDER BY CASE WHEN originAttributes='' THEN 0 ELSE 1 END, "
            "length(path) DESC,length(host) DESC", (now,)).fetchall()
        return rows
    finally:
        connection.close()


def _read_profile_rows(database: Path, now: int):
    wal = Path(str(database) + "-wal")
    rows = []
    try:
        rows = _query_youtube_rows(database, now)
    except sqlite3.Error:
        rows = []
    has_sapisid = any(r[0] in ("__Secure-3PAPISID", "SAPISID") for r in rows)
    if (not has_sapisid or wal.is_file()) and database.is_file():
        try:
            with tempfile.TemporaryDirectory(prefix="ytm-ff-") as tmp:
                os.chmod(tmp, 0o700)
                copied = Path(tmp) / "cookies.sqlite"
                shutil.copy2(database, copied)
                for suffix in ("-wal", "-shm"):
                    sidecar = Path(str(database) + suffix)
                    if sidecar.is_file():
                        shutil.copy2(sidecar, Path(str(copied) + suffix))
                wal_rows = _query_youtube_rows(copied, now)
                if any(r[0] in ("__Secure-3PAPISID", "SAPISID") for r in wal_rows):
                    rows = wal_rows
        except OSError:
            pass
        except sqlite3.Error:
            pass
    return rows


def _extract_candidate_cookies(rows):
    buckets = {}
    order = []
    for name, value, host, path, origin_attr in rows:
        if not "/youtubei/v1/browse".startswith(path or "/") or any(c in name + value for c in "\r\n;"):
            continue
        attr = origin_attr or ""
        if attr not in buckets:
            buckets[attr] = {}
            order.append(attr)
        buckets[attr].setdefault(name, value)
    # Always prefer the default container ('') when it has a YouTube session;
    # fall back to a single workspace/container only if default has none.
    for attr in ([""] if "" in buckets else []) + [a for a in order if a != ""]:
        cookies = buckets[attr]
        sapisid = cookies.get("__Secure-3PAPISID") or cookies.get("SAPISID")
        if sapisid:
            if "__Secure-3PAPISID" not in cookies:
                cookies["__Secure-3PAPISID"] = sapisid
            has_session = any(k in cookies for k in SESSION_COOKIES)
            return cookies, sapisid, has_session
    return None, None, False


def read_firefox_headers(user_home):
    home = Path(user_home).resolve()
    roots = [home / ".mozilla/firefox",
             home / ".config/mozilla/firefox",
             home / ".var/app/org.mozilla.firefox/.mozilla/firefox",
             home / ".var/app/org.mozilla.firefox/config/mozilla/firefox",
             home / ".var/app/org.mozilla.firefox/.config/mozilla/firefox",
             # Zen is a Firefox fork and keeps the standard, readable
             # cookies.sqlite database inside its own profile directory.
             home / ".zen",
             home / ".var/app/app.zen_browser.zen/.zen",
             home / ".var/app/io.github.zen_browser.zen/.zen",
             # Other Firefox-family browsers also use Mozilla's cookie database.
             home / ".librewolf",
             home / ".var/app/io.gitlab.librewolf-community/.librewolf",
             home / ".waterfox",
             home / ".var/app/net.waterfox.waterfox/.waterfox",
             home / ".floorp",
             home / ".var/app/one.ablaze.floorp/.floorp"]
    config_home = Path(os.environ.get("XDG_CONFIG_HOME") or home / ".config").resolve()
    if config_home.is_relative_to(home):
        roots.append(config_home / "mozilla/firefox")
    roots = list(dict.fromkeys(roots))
    profiles = []
    for root in roots:
        previous_count = len(profiles)
        config = configparser.ConfigParser(interpolation=None)
        try:
            config.read(root / "profiles.ini", encoding="utf-8")
        except configparser.Error:
            config = configparser.ConfigParser(interpolation=None)
        defaults = {config.get(section, "Default", fallback="")
                    for section in config.sections() if section.startswith("Install")}
        for section in config.sections():
            if not section.startswith("Profile"):
                continue
            name = config.get(section, "Path", fallback="")
            profile = (root / name if config.get(section, "IsRelative", fallback="1") == "1" else Path(name)).resolve()
            # Never inspect a profile outside the desktop user's home.
            if not name or not profile.is_relative_to(home.resolve()):
                continue
            database = profile / "cookies.sqlite"
            if database.is_file():
                preferred = name in defaults or config.get(section, "Default", fallback="0") == "1"
                profiles.append((preferred, database.stat().st_mtime, database))
        if root.is_dir() and len(profiles) == previous_count:
            profiles.extend((False, p.stat().st_mtime, p) for pattern in ("*/cookies.sqlite", "profiles/*/cookies.sqlite", "Profiles/*/cookies.sqlite", "Profile Groups/*/cookies.sqlite") for p in root.glob(pattern)
                            if p.resolve().is_relative_to(home.resolve()))
    if not profiles:
        raise ValueError("Firefox-family profile not found. In Desktop Mode, sign in to music.youtube.com in Firefox, Zen, LibreWolf, Waterfox or Floorp first.")
    now = int(time.time())
    best_fallback = None
    for _, _, database in sorted(profiles, key=lambda item: (item[0], item[1]), reverse=True):
        rows = _read_profile_rows(database, now)
        if not rows:
            continue
        cookies, sapisid, has_session = _extract_candidate_cookies(rows)
        if not sapisid:
            continue
        origin = "https://music.youtube.com"
        digest = hashlib.sha1(f"{now} {sapisid} {origin}".encode()).hexdigest()
        from ytmusicapi.helpers import initialize_headers
        headers = {**initialize_headers(), "origin": origin, "x-goog-authuser": "0",
                   "authorization": f"SAPISIDHASH {now}_{digest}",
                   "cookie": "; ".join(f"{name}={value}" for name, value in cookies.items())}
        visitor = cookies.get("VISITOR_INFO1_LIVE")
        if visitor:
            headers["x-goog-visitor-id"] = visitor
        if has_session:
            return headers
        if best_fallback is None:
            best_fallback = headers
    if best_fallback is not None:
        return best_fallback
    raise ValueError("No YouTube login found in a Firefox-family browser. Sign in using Firefox, Zen, LibreWolf, Waterfox or Floorp, close the browser, then retry.")

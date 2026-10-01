"""On-demand, read-only import of the local user's YouTube Firefox session."""
import configparser
import hashlib
import os
from pathlib import Path
import sqlite3
import time


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
             home / ".waterfox",
             home / ".floorp"]
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
    for _, _, database in sorted(profiles, key=lambda item: (item[0], item[1]), reverse=True):
        try:
            connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=2)
            try:
                connection.execute("PRAGMA query_only=ON")
                rows = connection.execute(
                    "SELECT name,value,host,path FROM moz_cookies "
                    "WHERE host IN ('.youtube.com','youtube.com','music.youtube.com','.music.youtube.com') "
                    "AND (expiry=0 OR expiry>?) AND originAttributes='' "
                    "ORDER BY length(path) DESC,length(host) DESC", (now,)).fetchall()
            finally:
                connection.close()
        except sqlite3.Error:
            continue
        cookies = {}
        for name, value, host, path in rows:
            if not "/youtubei/v1/browse".startswith(path or "/") or any(c in name + value for c in "\r\n;"):
                continue
            cookies.setdefault(name, value)
        # The bundled ytmusicapi browser authenticator requires this cookie.
        sapisid = cookies.get("__Secure-3PAPISID")
        if not sapisid:
            continue
        origin = "https://music.youtube.com"
        digest = hashlib.sha1(f"{now} {sapisid} {origin}".encode()).hexdigest()
        from ytmusicapi.helpers import initialize_headers
        return {**initialize_headers(), "origin": origin, "x-goog-authuser": "0",
                "authorization": f"SAPISIDHASH {now}_{digest}",
                "cookie": "; ".join(f"{name}={value}" for name, value in cookies.items())}
    raise ValueError("No YouTube login found in a Firefox-family browser. Sign in using Firefox, Zen, LibreWolf, Waterfox or Floorp, close the browser, then retry.")

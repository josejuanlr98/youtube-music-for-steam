import decky
import json
import os
import random
import asyncio
import shutil
import signal
import subprocess
import logging
import threading
import time
import re
import base64
import urllib.parse
import urllib.request

_PY_MODULES = os.path.join(decky.DECKY_PLUGIN_DIR, "py_modules")
BROWSER_AUTH_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "browser.json")
SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
CAST_SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "cast-settings.json")
logger = logging.getLogger("YouTubeMusic")


# Integrated Cast Receiver backend
PLUGIN_DIR = os.path.dirname(os.path.realpath(__file__))
NODE_BIN_SRC = os.path.join(PLUGIN_DIR, "bin", "node")
YTDLP_BIN_SRC = os.path.join(PLUGIN_DIR, "bin", "yt-dlp")
SERVER_JS = os.path.join(PLUGIN_DIR, "backend", "out", "server.cjs")
RUNTIME_DIR = "/tmp/youtube-music-cast-receiver"
NODE_BIN = os.path.join(RUNTIME_DIR, "node")
YTDLP_BIN = os.path.join(RUNTIME_DIR, "yt-dlp")


def _stage_runtime_binaries():
    os.makedirs(RUNTIME_DIR, exist_ok=True)
    for src, dst in ((NODE_BIN_SRC, NODE_BIN), (YTDLP_BIN_SRC, YTDLP_BIN)):
        if not os.path.exists(src):
            continue
        try:
            shutil.copy2(src, dst)
        except OSError as e:
            logger.warning(f"Could not refresh {dst}: {e}; using existing copy")
        try:
            os.chmod(dst, 0o755)
        except OSError:
            pass


class Plugin:
    node_process = None
    authenticated = False
    ytmusic = None
    _auth_generation = 0

    # Queue / playback state
    queue = []
    queue_position = 0
    is_playing = False
    shuffle = False
    shuffle_order = []
    repeat = "NONE"         # NONE | ALL | ONE
    volume = 1.0
    cast_device_name = "SteamDeck"
    notification_settings = {"connections": True, "tracks": True, "connectionSound": False, "trackSound": False}

    async def get_artwork_data_url(self, url):
        """Return only small Google-hosted cover art for local color sampling."""
        try:
            parsed = urllib.parse.urlparse(str(url or ''))
            hostname = (parsed.hostname or '').lower()
            allowed = parsed.scheme == 'https' and (
                hostname.endswith('.googleusercontent.com') or hostname.endswith('.ggpht.com') or hostname.endswith('.ytimg.com'))
            if not allowed:
                return {}

            def fetch():
                request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(request, timeout=8) as response:
                    final = urllib.parse.urlparse(response.geturl())
                    final_host = (final.hostname or '').lower()
                    if final.scheme != 'https' or not (
                            final_host.endswith('.googleusercontent.com') or final_host.endswith('.ggpht.com') or final_host.endswith('.ytimg.com')):
                        return None
                    mime = (response.headers.get_content_type() or '').lower()
                    if mime not in ('image/jpeg', 'image/png', 'image/webp'):
                        return None
                    content = response.read(524289)
                    if len(content) > 524288:
                        return None
                    return f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"

            data_url = await asyncio.to_thread(fetch)
            return {"dataUrl": data_url} if data_url else {}
        except Exception as error:
            decky.logger.debug(f"Artwork palette fallback failed: {error}")
            return {}

    def _account_lock(self):
        if not hasattr(self, '_ytm_lock'):
            self._ytm_lock = threading.RLock()
        return self._ytm_lock

    async def _api_call(self, method, *args, **kwargs):
        # requests.Session and ytmusicapi's mutable headers must not race.
        client = self.ytmusic
        if client is None:
            raise RuntimeError('Not authenticated')
        # Full playlist continuations must not monopolize the interactive
        # account session. Give that one bulk request a separate HTTP session.
        from ytmusicapi import YTMusic
        bulk = method in ('get_playlist', 'get_liked_songs') and kwargs.get('limit', 1) is None
        if bulk and isinstance(client, YTMusic):
            with self._account_lock():
                headers = dict(client._auth_headers)
            def read_bulk():
                candidate = YTMusic(headers)
                try:
                    return getattr(candidate, method)(*args, **kwargs)
                finally:
                    candidate._session.close()
            return await asyncio.to_thread(read_bulk)
        def invoke():
            from requests.exceptions import ConnectionError, Timeout
            with self._account_lock():
                for attempt in range(2):
                    try:
                        return getattr(client, method)(*args, **kwargs)
                    except (ConnectionError, Timeout):
                        if attempt:
                            raise
        return await asyncio.to_thread(invoke)

    @staticmethod
    def _account_error(error):
        from requests.exceptions import ConnectionError, Timeout
        status = getattr(getattr(error, 'response', None), 'status_code', None)
        message = str(error).lower()
        http_status = re.search(r'http\s+(401|403)\b', message)
        if status is None and http_status:
            status = int(http_status.group(1))
        if status == 401 or any(term in message for term in ('sign in', 'login_required', 'unauthenticated')):
            return {'error': 'YouTube rejected this session. Update your browser headers in Settings.', 'authRequired': True}
        if isinstance(error, (ConnectionError, Timeout)):
            return {'error': 'Could not reach YouTube Music. Check your connection and retry.'}
        if isinstance(error, (KeyError, TypeError, IndexError)):
            return {'error': 'YouTube returned an unexpected response. Retry or refresh Library. Your saved session has been kept.'}
        if status == 403:
            return {'error': 'YouTube denied access to this item. Check that it is available for your account.'}
        return {'error': 'Could not load this item from YouTube Music. Please retry. Your saved session has been kept.'}

    # ── Authentication (browser cookies) ───────────────────────────

    def _try_init_ytmusic(self):
        """Initialize ytmusicapi using browser request headers (cookies)."""
        generation = self._auth_generation
        if os.path.exists(BROWSER_AUTH_FILE):
            try:
                from ytmusicapi import YTMusic
                candidate = YTMusic(BROWSER_AUTH_FILE)
                if generation == self._auth_generation:
                    self.ytmusic = candidate
                    self.authenticated = True
                return
            except Exception as e:
                decky.logger.warning(f'Could not initialize saved account: {type(e).__name__}')
        if generation == self._auth_generation:
            self.authenticated = False
            self.ytmusic = None

    def _load_settings(self):
        """Load persisted settings (volume, etc.) from disk."""
        if os.path.exists(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE, "r") as f:
                    data = json.load(f)
                self.volume = data.get("volume", 1.0)
                saved = data.get("notifications", {})
                self.notification_settings = {k: saved.get(k, v) if type(saved.get(k, v)) is bool else v
                                              for k, v in Plugin.notification_settings.items()}
            except Exception as e:
                decky.logger.error(f"Failed to load settings: {e}")

        if os.path.exists(CAST_SETTINGS_FILE):
            try:
                with open(CAST_SETTINGS_FILE, "r") as f:
                    data = json.load(f)
                name = str(data.get("device_name", "")).strip()
                if name:
                    self.cast_device_name = name[:50]
            except Exception as e:
                decky.logger.error(f"Failed to load Cast settings: {e}")

    def _save_settings(self):
        """Save persisted settings to disk."""
        os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
        with open(SETTINGS_FILE, "w") as f:
            json.dump({"volume": self.volume, "notifications": self.notification_settings}, f)

    async def get_notification_settings(self):
        return dict(self.notification_settings)

    async def set_notification_settings(self, settings):
        if not isinstance(settings, dict) or any(k not in Plugin.notification_settings or type(v) is not bool for k, v in settings.items()):
            return {"error": "Invalid notification settings"}
        previous = self.notification_settings
        self.notification_settings = {**previous, **settings}
        try:
            self._save_settings()
        except Exception:
            self.notification_settings = previous
            return {"error": "Could not save notification settings"}
        return dict(self.notification_settings)

    def _save_cast_settings(self):
        os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
        with open(CAST_SETTINGS_FILE, "w") as f:
            json.dump({"device_name": self.cast_device_name}, f)

    async def _main(self):
        decky.logger.info("YouTube Music plugin loaded")
        self._load_settings()
        await asyncio.to_thread(self._try_init_ytmusic)
        await self._start_cast_backend()

    async def _start_cast_backend(self):
        if not os.path.exists(SERVER_JS):
            decky.logger.error(f"Cast backend not found: {SERVER_JS}")
            return
        _stage_runtime_binaries()
        if not os.path.exists(NODE_BIN):
            decky.logger.error("Integrated Cast Receiver requires bin/node.")
            return
        env = {
            **os.environ,
            "NODE_ENV": "production",
            "YTCAST_YTDLP_PATH": YTDLP_BIN if os.path.exists(YTDLP_BIN) else YTDLP_BIN_SRC,
            "YTCAST_DEVICE_NAME": self.cast_device_name,
        }
        try:
            self.node_process = subprocess.Popen(
                [NODE_BIN, SERVER_JS],
                cwd=PLUGIN_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                start_new_session=True,
            )
            loop = asyncio.get_running_loop()

            def wait_for_ready():
                if self.node_process and self.node_process.stdout:
                    for line in iter(self.node_process.stdout.readline, b""):
                        decoded = line.decode("utf-8", errors="replace").strip()
                        decky.logger.info(f"[Cast] {decoded}")
                        if decoded == "READY":
                            return True
                return False

            try:
                ready = await asyncio.wait_for(
                    loop.run_in_executor(None, wait_for_ready), timeout=30.0
                )
            except asyncio.TimeoutError:
                decky.logger.error("Integrated Cast backend did not become ready within 30 seconds.")
                await self._stop_cast_backend()
                return

            if not ready:
                decky.logger.error("Integrated Cast backend exited before READY.")
                return

            async def log_stream(stream, level_fn):
                if stream:
                    while True:
                        line = await loop.run_in_executor(None, stream.readline)
                        if not line:
                            break
                        level_fn(f"[Cast] {line.decode('utf-8', errors='replace').strip()}")

            asyncio.ensure_future(log_stream(self.node_process.stdout, decky.logger.info))
            asyncio.ensure_future(log_stream(self.node_process.stderr, decky.logger.warning))
        except Exception as e:
            decky.logger.error(f"Failed to start integrated Cast backend: {e}")

    async def _stop_cast_backend(self):
        if not self.node_process:
            return
        pid = self.node_process.pid
        loop = asyncio.get_running_loop()
        try:
            pgid = os.getpgid(pid)
        except ProcessLookupError:
            self.node_process = None
            return
        try:
            os.killpg(pgid, signal.SIGTERM)
        except ProcessLookupError:
            self.node_process = None
            return
        try:
            await asyncio.wait_for(
                loop.run_in_executor(None, self.node_process.wait), timeout=2.0
            )
        except asyncio.TimeoutError:
            try:
                os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(
                    loop.run_in_executor(None, self.node_process.wait), timeout=3.0
                )
            except asyncio.TimeoutError:
                pass
        self.node_process = None

    async def hard_reset(self):
        """Restart the integrated Cast receiver and clear transient playback state."""
        try:
            await self.stop_all()
            await self._stop_cast_backend()
            await self._start_cast_backend()
            return {'success': True}
        except Exception as error:
            decky.logger.error(f"Hard reset failed: {error}")
            return {'success': False, 'error': 'Could not restart the Cast receiver.'}

    async def _unload(self):
        decky.logger.info("Stopping integrated YouTube Cast Receiver...")
        await self._stop_cast_backend()
        decky.logger.info("YouTube Music plugin unloaded")

    async def get_cast_device_name(self):
        return {"name": self.cast_device_name}

    async def set_cast_device_name(self, name):
        name = str(name or "").strip()
        if not name:
            return {"error": "Device name cannot be empty"}
        if len(name) > 50:
            return {"error": "Device name must be 50 characters or fewer"}
        self.cast_device_name = name
        self._save_cast_settings()
        # The backend reads this value only at startup. Restart it so the new
        # name is advertised immediately, without requiring a full Deck reboot.
        try:
            await self._stop_cast_backend()
            await self._start_cast_backend()
        except Exception as e:
            decky.logger.error(f"Failed to restart Cast backend after name change: {e}")
            return {"error": str(e)}
        return {"success": True, "name": self.cast_device_name}

    async def get_auth_state(self):
        """Return current browser-cookie authentication status."""
        if self.ytmusic is None and os.path.exists(BROWSER_AUTH_FILE):
            await asyncio.to_thread(self._try_init_ytmusic)
        return {"authenticated": self.authenticated}

    async def load_headers_from_file(self, file_path: str):
        """Read browser request headers from a text file on the Deck.
        Uses ytmusicapi.setup() to parse raw headers into browser.json.
        """
        self._auth_generation += 1
        generation = self._auth_generation
        try:
            if not os.path.exists(file_path):
                return {"error": f"File not found: {file_path}"}

            with open(file_path, "r", encoding="utf-8") as f:
                headers_raw = f.read()

            if not headers_raw.strip():
                return {"error": "File is empty"}

            from ytmusicapi import setup
            # Parse and validate before replacing a working account or its file.
            parsed = json.loads(setup(headers_raw=headers_raw))
            return await self._install_browser_auth(parsed, generation)
        except Exception as e:
            decky.logger.warning(f'Header validation failed: {type(e).__name__}')
            return {'error': 'Could not validate these headers. Check the file and connection, then retry. Your previous session has been kept.'}

    async def import_firefox_session(self):
        self._auth_generation += 1
        generation = self._auth_generation
        try:
            from ytm_firefox import read_firefox_headers
            user_home = getattr(decky, 'DECKY_USER_HOME', '/home/deck')
            parsed = await asyncio.to_thread(read_firefox_headers, user_home)
            return await self._install_browser_auth(parsed, generation)
        except ValueError as error:
            return {'error': str(error)}
        except Exception as error:
            decky.logger.warning(f'Firefox import failed: {type(error).__name__}')
            return {'error': 'Could not import Firefox. Close Firefox after signing in and retry. Your saved session has been kept.'}

    async def import_browser_session(self):
        self._auth_generation += 1
        generation = self._auth_generation
        user_home = getattr(decky, 'DECKY_USER_HOME', '/home/deck')
        try:
            from ytm_firefox import read_firefox_headers
            parsed = await asyncio.to_thread(read_firefox_headers, user_home)
            source = 'Firefox-family browser'
            result = await self._install_browser_auth(parsed, generation)
            if result.get('success'):
                result['browser'] = source
            return result
        except ValueError as error:
            return {'error': str(error)}
        except Exception as error:
            decky.logger.warning(f'Browser import failed: {type(error).__name__}')
            return {'error': 'Could not import a browser session. Close the browser after signing in and retry. Your saved session has been kept.'}

    async def _install_browser_auth(self, parsed, generation):
        try:
            from ytmusicapi import YTMusic
            from ytmusicapi.auth.types import AuthType
            def validate():
                candidate = YTMusic(parsed)
                if candidate.auth_type != AuthType.BROWSER:
                    raise ValueError('Browser authentication required')
                candidate.get_library_playlists(limit=1)
                return candidate
            candidate = await asyncio.to_thread(validate)
            if generation != self._auth_generation:
                return {'error': 'Account changed while validating. Please retry.'}
            os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
            temporary = BROWSER_AUTH_FILE + '.tmp'
            try:
                with open(temporary, 'w', encoding='utf-8') as output:
                    json.dump(parsed, output)
                os.chmod(temporary, 0o600)
                os.replace(temporary, BROWSER_AUTH_FILE)
            finally:
                if os.path.exists(temporary):
                    os.remove(temporary)
            self.ytmusic = candidate
            self._ratings = {}
            self._rating_checked = {}
            self.authenticated = True
            self._cached_playlists = None
            self._playlist_tracks_cache = {}
            self._playlist_preview_cache = {}
            return {'success': True}
        except Exception as e:
            decky.logger.warning(f'Header validation failed: {type(e).__name__}')
            return {'error': 'Could not validate these headers. Check the file and connection, then retry. Your previous session has been kept.'}

    async def sign_out(self):
        """Sign out — delete browser.json and reset all authentication state."""
        self._auth_generation += 1
        self._ratings = {}
        self._rating_checked = {}
        self.authenticated = False
        self.ytmusic = None
        self.queue = []
        self.queue_position = 0
        self.is_playing = False
        self.shuffle = False
        self.shuffle_order = []
        self.repeat = "NONE"
        self._cached_playlists = None
        if os.path.exists(BROWSER_AUTH_FILE):
            try:
                os.remove(BROWSER_AUTH_FILE)
            except OSError as e:
                decky.logger.warning(f"Could not remove browser auth file: {e}")
        decky.logger.info("Signed out")
        return {"success": True}

    # ── Streaming URL ──────────────────────────────────────────────

    def _get_streaming_url(self, video_id):
        """Fetch the best audio streaming URL using yt-dlp as a subprocess.
        Runs in a separate Python process to avoid Decky sandbox import issues."""
        import subprocess
        try:
            env = os.environ.copy()
            # Add our py_modules to PYTHONPATH so the subprocess can find yt-dlp
            env['PYTHONPATH'] = _PY_MODULES + ':' + env.get('PYTHONPATH', '')
            # Strip LD_LIBRARY_PATH to avoid Decky's bundled OpenSSL conflicting
            # with the system Python's ssl module (same fix as Deckify)
            env.pop('LD_LIBRARY_PATH', None)

            # Prefer the bundled/staged standalone yt-dlp. This keeps local
            # playback on the same current extractor as Cast playback and avoids
            # SteamOS Python environments carrying an obsolete yt-dlp module.
            ytdlp = YTDLP_BIN if os.path.exists(YTDLP_BIN) else None
            command = ([ytdlp] if ytdlp else ['python3', '-m', 'yt_dlp']) + [
                '--ignore-config', '--socket-timeout', '15', '--retries', '1',
                '--js-runtimes', 'node:' + (NODE_BIN if os.path.exists(NODE_BIN) else NODE_BIN_SRC),
                '--remote-components', 'ejs:github',
                '--print', 'urls',
                '-f', 'bestaudio[ext=m4a]/bestaudio',
                '--no-warnings',
                '-q',
                '--no-playlist',
                f'https://music.youtube.com/watch?v={video_id}',
            ]

            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                env=env,
                # Keep a single bad/blocked video from delaying playlist start
                # for nearly a minute before the next candidate is tried.
                timeout=25,
            )

            url = result.stdout.strip()
            if result.returncode != 0 or not url or not url.startswith('http'):
                decky.logger.warning(f"yt-dlp failed for {video_id}. rc={result.returncode} stderr: {result.stderr[-500:]}")
                return None
            decky.logger.info(f"Got streaming URL for {video_id}")
            return url
        except subprocess.TimeoutExpired:
            decky.logger.error(f"yt-dlp timed out for {video_id}")
            return None
        except Exception as e:
            decky.logger.error(f"Failed to get streaming URL for {video_id}: {e}")
            return None

    def _current_track_with_url(self, resolve_url=True):
        """Return current track metadata + fresh streaming URL."""
        if not self.queue or self.queue_position >= len(self.queue):
            return None

        track = self.queue[self.queue_position]
        url = self._get_streaming_url(track["videoId"]) if resolve_url else None

        return {
            "videoId": track["videoId"],
            "title": track.get("title", ""),
            "artist": track.get("artist", ""),
            "album": track.get("album", ""),
            "albumArt": track.get("albumArt", ""),
            "duration": track.get("duration", 0),
            "url": url,
            "queuePosition": self.queue_position,
            "queueLength": len(self.queue),
        }

    # ── Playback controls ──────────────────────────────────────────

    async def get_current_track(self):
        """Return current track with fresh streaming URL."""
        if not self.queue:
            return {'error': 'No track in queue'}
        return await self.jump_to_queue(self.queue_position)

    async def resume(self):
        self.is_playing = True
        return {"success": True}

    async def pause(self):
        self._pause_revision = getattr(self, '_pause_revision', 0) + 1
        self.is_playing = False
        return {"success": True}

    def _advance_queue(self, direction=1, resolve_url=True):
        if not self.queue:
            return None

        if self.repeat == "ONE":
            return self._current_track_with_url(resolve_url)

        if self.shuffle and self.shuffle_order:
            try:
                shuffle_idx = self.shuffle_order.index(self.queue_position)
            except ValueError:
                shuffle_idx = 0
            shuffle_idx += direction

            if shuffle_idx >= len(self.shuffle_order):
                if self.repeat == "ALL":
                    shuffle_idx = 0
                else:
                    self.is_playing = False
                    return None
            elif shuffle_idx < 0:
                if self.repeat == "ALL":
                    shuffle_idx = len(self.shuffle_order) - 1
                else:
                    shuffle_idx = 0

            self.queue_position = self.shuffle_order[shuffle_idx]
        else:
            self.queue_position += direction

            if self.queue_position >= len(self.queue):
                if self.repeat == "ALL":
                    self.queue_position = 0
                else:
                    self.queue_position = len(self.queue) - 1
                    self.is_playing = False
                    return None
            elif self.queue_position < 0:
                if self.repeat == "ALL":
                    self.queue_position = len(self.queue) - 1
                else:
                    self.queue_position = 0

        self.is_playing = True
        return self._current_track_with_url(resolve_url)

    async def _advance_async(self, direction):
        previous = self.queue_position
        playing = self.is_playing
        snapshot = self.queue
        result = self._advance_queue(direction, resolve_url=False)
        if result is None:
            return {'stopped': True}
        target = self.queue_position
        url = await asyncio.to_thread(self._get_streaming_url, result['videoId'])
        if self.queue is not snapshot or self.queue_position != target:
            return {'error': 'Playback changed while loading.'}
        if not url:
            self.queue_position = previous
            self.is_playing = playing
            return {'error': 'Could not load audio for this song. Please retry.'}
        return {**result, 'url': url}

    async def next_track(self):
        result = await self._advance_async(1)
        if result.get('error') == 'Could not load audio for this song. Please retry.':
            return await self.skip_unplayable()
        return result

    async def skip_unplayable(self, video_id=None):
        if not self.queue or (video_id and self.queue[self.queue_position]['videoId'] != video_id):
            return {'stopped': True}
        queue = self.queue
        pause_revision = getattr(self, '_pause_revision', 0)
        repeat = self.repeat
        self.repeat = 'NONE'
        try:
            for _ in range(min(5, len(queue))):
                track = self._advance_queue(1, resolve_url=False)
                if not track:
                    self.is_playing = False
                    return {'stopped': True}
                target = self.queue_position
                url = await asyncio.to_thread(self._get_streaming_url, track['videoId'])
                if self.queue is not queue or self.queue_position != target or pause_revision != getattr(self, '_pause_revision', 0):
                    return {'error': 'Playback changed while skipping.'}
                if url:
                    return {**track, 'url': url}
            self.is_playing = False
            return {'stopped': True, 'error': 'Several songs could not be played. Check your connection.'}
        finally:
            if self.queue is queue and self.repeat == 'NONE':
                self.repeat = repeat

    async def previous_track(self):
        return await self._advance_async(-1)

    async def track_ended(self):
        return await self.next_track()

    async def get_playback_state(self):
        track = None
        if self.queue and self.queue_position < len(self.queue):
            track = self.queue[self.queue_position]
        return {
            "is_playing": self.is_playing,
            "shuffle": self.shuffle,
            "repeat": self.repeat,
            "volume": self.volume,
            "queue_position": self.queue_position,
            "queue_length": len(self.queue),
            "current_track": track,
        }

    # ── Volume ─────────────────────────────────────────────────────

    async def set_volume(self, value):
        """Set volume. value is 0-100 from frontend."""
        import subprocess
        try:
            value = float(value)
        except (TypeError, ValueError):
            return {"error": f"Invalid volume value: {value!r}"}
        self.volume = max(0, min(100, value)) / 100.0  # store as 0.0-1.0

        # Try to set PulseAudio volume for CEF sink-inputs
        try:
            env = os.environ.copy()
            env.pop('LD_LIBRARY_PATH', None)

            result = subprocess.run(
                ["pactl", "list", "sink-inputs"],
                capture_output=True, text=True, env=env, timeout=5,
            )
            output = result.stdout

            # Parse sink-input indices for steamwebhelper
            current_index = None
            indices = []
            for line in output.split("\n"):
                line = line.strip()
                if line.startswith("Sink Input #"):
                    current_index = line.split("#")[1].strip()
                elif "application.name" in line and "steamwebhelper" in line.lower():
                    if current_index:
                        indices.append(current_index)

            # Set volume on all matching sink-inputs
            percentage = int(value)
            for idx in indices:
                subprocess.run(
                    ["pactl", "set-sink-input-volume", idx, f"{percentage}%"],
                    capture_output=True, env=env, timeout=5,
                )

            if not indices:
                decky.logger.debug("No steamwebhelper sink-inputs found for volume control")
        except Exception as e:
            decky.logger.warning(f"PulseAudio volume control failed (falling back to <audio> only): {e}")

        self._save_settings()
        return {"volume": value}

    async def get_volume(self):
        """Return current volume (0-100 for frontend)."""
        return {"volume": self.volume * 100}

    # ── Like / Dislike ──────────────────────────────────────────────

    async def rate_song(self, video_id, rating):
        if not self.ytmusic:
            return {"error": "Not authenticated"}
        try:
            if rating not in ('LIKE', 'DISLIKE', 'INDIFFERENT') or not video_id:
                return {"error": "Invalid rating"}
            client = self.ytmusic
            await self._api_call('rate_song', video_id, rating)
            if self.ytmusic is not client:
                return {"error": "Account changed. Please retry."}
            ratings = getattr(self, '_ratings', {})
            if len(ratings) >= 256 and video_id not in ratings:
                ratings.pop(next(iter(ratings)))
            ratings[video_id] = rating
            self._ratings = ratings
            getattr(self, '_rating_checked', {}).pop(video_id, None)
            # Update the cached likeStatus in the queue
            for t in self.queue:
                if t.get("videoId") == video_id:
                    t["likeStatus"] = rating
            return {"rating": rating}
        except Exception as e:
            decky.logger.error(f"Failed to rate song {video_id}: {e}")
            error_msg = str(e)
            if "Sign in" in error_msg or "sign in" in error_msg:
                return {"error": "Session expired. Please re-authenticate in Settings."}
            return {"error": error_msg}

    async def get_song_rating(self, video_id):
        if video_id in getattr(self, '_ratings', {}):
            return {"rating": self._ratings[video_id]}
        # Return cached likeStatus from queue data
        for t in self.queue:
            if t.get("videoId") == video_id:
                status = t.get("likeStatus")
                if status and status != "INDIFFERENT":
                    return {"rating": status}
                break
        # Cast songs are not in the local queue, so ask YouTube Music once per
        # song. Its watch endpoint cannot tell DISLIKE from INDIFFERENT, so only
        # LIKE is trusted; results (including "not liked") are cached.
        if not self.ytmusic or not isinstance(video_id, str) or not re.fullmatch(r'[\w-]{1,64}', video_id):
            return {"rating": "INDIFFERENT"}
        checked = getattr(self, '_rating_checked', None)
        if checked is None:
            checked = self._rating_checked = {}
        if video_id in checked:
            return {"rating": checked[video_id]}
        client = self.ytmusic
        try:
            watch = await self._api_call('get_watch_playlist', videoId=video_id, limit=1)
            if self.ytmusic is not client:
                return {"rating": "INDIFFERENT"}
            tracks = (watch or {}).get('tracks') or []
            match = next((x for x in tracks if x.get('videoId') == video_id), None)
            rating = 'LIKE' if match and match.get('likeStatus') == 'LIKE' else 'INDIFFERENT'
        except Exception as e:
            decky.logger.warning(f"Could not read rating for {video_id}: {type(e).__name__}")
            return {"rating": "INDIFFERENT"}
        if len(checked) >= 256:
            checked.pop(next(iter(checked)))
        checked[video_id] = rating
        return {"rating": getattr(self, '_ratings', {}).get(video_id, rating)}

    # ── Shuffle / Repeat ───────────────────────────────────────────

    async def toggle_shuffle(self):
        self.shuffle = not self.shuffle
        if self.shuffle and self.queue:
            self.shuffle_order = list(range(len(self.queue)))
            random.shuffle(self.shuffle_order)
            if self.queue_position in self.shuffle_order:
                self.shuffle_order.remove(self.queue_position)
                self.shuffle_order.insert(0, self.queue_position)
        else:
            self.shuffle_order = []
        return {"shuffle": self.shuffle}

    async def toggle_repeat(self):
        cycle = {"NONE": "ALL", "ALL": "ONE", "ONE": "NONE"}
        self.repeat = cycle.get(self.repeat, "NONE")
        return {"repeat": self.repeat}

    # ── Queue management ─────────────────────────────────────────────

    async def sync_cast_queue(self, tracks, position=-1):
        """Mirror the receiver queue into the Decky queue model.

        Cast is authoritative while a phone is connected. Keeping this mirror
        lets the normal Queue tab, ratings, and playback state refer to the same
        list instead of maintaining two unrelated queues.
        """
        try:
            self.queue = [dict(t) for t in (tracks or []) if t.get("videoId")]
            self.queue_position = max(0, min(int(position), len(self.queue) - 1)) if self.queue else 0
            self.is_playing = bool(self.queue) and self.is_playing
            self.shuffle_order = []
            return {"success": True, "queue_length": len(self.queue)}
        except Exception as e:
            decky.logger.error(f"Failed to sync Cast queue: {e}")
            return {"error": str(e)}

    async def get_queue(self):
        return {
            'loading': getattr(self, '_queue_loading', None) is self.queue,
            'loadError': getattr(self, '_queue_load_error', ''),
            "tracks": self.queue,
            "position": self.queue_position,
            "shuffle": self.shuffle, "shuffleOrder": list(self.shuffle_order), "repeat": self.repeat,
        }

    async def edit_queue(self, index, action, expected_ids):
        # Reject stale UI selections, including duplicate songs at different positions.
        if expected_ids != [t.get("videoId") for t in self.queue]:
            return {"error": "Queue changed. Please try again."}
        if type(index) is not int or not 0 <= index < len(self.queue):
            return {"error": "Invalid queue position"}
        current = self.queue_position
        if action == "next":
            if index == current:
                return {"error": "This song is already playing"}
            target = current if index < current else current + 1
        elif action in ("up", "down"):
            target = index + (-1 if action == "up" else 1)
        else:
            return {"error": "Invalid queue action"}
        if not 0 <= target < len(self.queue):
            return {"error": "Already at the edge of the queue"}
        order = list(range(len(self.queue)))
        order.insert(target, order.pop(index))
        self.queue = [self.queue[i] for i in order]
        self.queue_position = order.index(current)
        if self.shuffle:
            old_shuffle = self.shuffle_order or list(range(len(order)))
            self.shuffle_order = [order.index(i) for i in old_shuffle]
            if action == "next":
                self.shuffle_order.remove(target)
                self.shuffle_order.insert(self.shuffle_order.index(self.queue_position) + 1, target)
        # Play next must also take precedence over Repeat One.
        if action == "next" and self.repeat == "ONE":
            self.repeat = "NONE"
        return {"success": True, "tracks": self.queue, "position": self.queue_position, "repeat": self.repeat}

    async def remove_from_queue(self, index, expected_ids=None):
        if expected_ids is not None and expected_ids != [t.get('videoId') for t in self.queue]:
            return {'error': 'Queue changed. Please try again.'}
        if type(index) is not int:
            return {'error': 'Invalid index'}
        if self.is_playing and index == self.queue_position:
            return {'error': 'Skip this song before removing it.'}
        if index < 0 or index >= len(self.queue):
            return {"error": "Invalid index"}

        self.queue.pop(index)

        if index < self.queue_position:
            self.queue_position -= 1
        elif index == self.queue_position:
            if self.queue_position >= len(self.queue):
                self.queue_position = max(0, len(self.queue) - 1)

        if self.shuffle and self.queue:
            self.shuffle_order = list(range(len(self.queue)))
            random.shuffle(self.shuffle_order)
            if self.queue_position in self.shuffle_order:
                self.shuffle_order.remove(self.queue_position)
                self.shuffle_order.insert(0, self.queue_position)

        return {"success": True, "queue_length": len(self.queue)}

    async def jump_to_queue(self, index, expected_ids=None):
        if expected_ids is not None and expected_ids != [t.get('videoId') for t in self.queue]:
            return {'error': 'Queue changed. Please try again.'}
        if type(index) is not int or not 0 <= index < len(self.queue):
            return {'error': 'Invalid index'}
        snapshot = self.queue
        track = snapshot[index]
        url = await asyncio.to_thread(self._get_streaming_url, track['videoId'])
        if snapshot is not self.queue or index >= len(self.queue) or self.queue[index] is not track:
            return {'error': 'Queue changed. Please try again.'}
        if not url:
            return {'error': 'Could not load audio. Your current song has been kept.'}
        self.queue_position = index
        return {**track, 'url': url, 'queuePosition': index, 'queueLength': len(self.queue)}

    # ── Library ─────────────────────────────────────────────────────

    _cached_playlists = None

    async def get_library_playlists(self, refresh=False):
        if not self.ytmusic:
            return {"error": "Not authenticated"}
        if refresh:
            self._playlist_tracks_cache = {}
            self._playlist_preview_cache = {}
            self._playlist_start_urls = {}
        if self._cached_playlists and not refresh:
            return {"playlists": self._cached_playlists}
        try:
            client = self.ytmusic
            playlists = await self._api_call('get_library_playlists', limit=None)
            result = []
            # Liked Songs first
            result.append({
                "playlistId": "LM",
                "title": "Liked Songs",
                "count": None,
                "thumbnail": None,
            })
            for p in playlists:
                pid = p.get("playlistId", "")
                if pid == "LM":
                    continue
                thumbnails = p.get("thumbnails", [])
                thumb = thumbnails[0]["url"] if thumbnails else None
                result.append({
                    "playlistId": pid,
                    "title": p.get("title", "Unknown Playlist"),
                    "count": p.get("count"),
                    "thumbnail": thumb,
                })
            if self.ytmusic is not client:
                return {'error': 'Account changed. Please reload Library.'}
            self._cached_playlists = result
            return {"playlists": result}
        except Exception as e:
            decky.logger.error(f"Failed to get library playlists: {e}")
            return self._account_error(e)

    # ── Search ─────────────────────────────────────────────────────

    async def search_songs(self, query):
        if not self.ytmusic:
            return {"error": "Not authenticated"}
        try:
            if not isinstance(query, str) or not query.strip():
                return {'results': []}
            results = await self._api_call('search', query.strip()[:200], filter='songs', limit=20)
            songs = []
            for r in results:
                thumbnails = r.get("thumbnails", [])
                album_art = thumbnails[-1]["url"] if thumbnails else ""
                artists = r.get("artists", [])
                artist_name = ", ".join(a.get("name", "") for a in artists) if artists else ""
                songs.append({
                    "videoId": r.get("videoId", ""),
                    "title": r.get("title", "Unknown"),
                    "artist": artist_name,
                    "albumArt": album_art,
                    "duration": r.get("duration", ""),
                })
            return {"results": [s for s in songs if s["videoId"]]}
        except Exception as e:
            decky.logger.error(f"Search failed: {e}")
            return self._account_error(e)

    async def queue_song_append(self, metadata):
        return await self.queue_song_next(metadata, append=True)

    async def queue_song_next(self, metadata, append=False):
        if not self.ytmusic:
            return {"error": "Not authenticated"}
        if not isinstance(metadata, dict) or not metadata.get('videoId'):
            return {"error": "No song selected"}
        duration = 0
        try:
            for part in str(metadata.get('duration') or '0').split(':'):
                duration = duration * 60 + int(part)
        except ValueError:
            duration = 0
        track = {key: str(metadata.get(key) or '') for key in ('videoId', 'title', 'artist', 'albumArt')}
        track.update(album='', duration=duration, likeStatus='INDIFFERENT')
        if not self.queue:
            self.queue_position = 0
            self.shuffle_order = []
        index = len(self.queue) if append else self.queue_position + 1 if self.queue else 0
        self.queue.insert(index, track)
        if self.shuffle:
            order = [i + 1 if i >= index else i for i in self.shuffle_order]
            if not order:
                order = [i for i in range(len(self.queue)) if i != index]
            slot = len(order) if append else order.index(self.queue_position) + 1 if self.queue_position in order else 0
            order.insert(slot, index)
            self.shuffle_order = order
        if self.repeat == 'ONE' and not append:
            self.repeat = 'NONE'
        return {"success": True}

    async def play_song(self, video_id, metadata=None):
        """Play the selected video directly; radio is a separate operation."""
        if not self.ytmusic:
            return {"error": "Not authenticated"}
        if not isinstance(video_id, str) or not video_id.strip():
            return {"error": "No song selected"}
        metadata = metadata if isinstance(metadata, dict) else {}
        duration = 0
        try:
            for part in str(metadata.get("duration") or "0").split(":"):
                duration = duration * 60 + int(part)
        except (ValueError, TypeError):
            duration = 0
        track = {
            "videoId": video_id,
            "title": metadata.get("title") or "Unknown",
            "artist": metadata.get("artist") or "",
            "album": "",
            "albumArt": metadata.get("albumArt") or "",
            "duration": duration,
            "likeStatus": "INDIFFERENT",
        }
        try:
            original_queue = self.queue
            snapshot = list(self.queue)
            client = self.ytmusic
            url = await asyncio.to_thread(self._get_streaming_url, video_id)
            if self.queue is not original_queue or self.queue != snapshot or client is not self.ytmusic:
                return {'error': 'Playback changed. Please select the song again.'}
            if not url:
                return {"error": "YouTube did not provide an audio stream for this song. Please try again in a moment."}
            self.queue = [track]
            self.queue_position = 0
            self.shuffle_order = [0] if self.shuffle else []
            self.is_playing = True
            return {**track, "url": url, "queuePosition": 0, "queueLength": 1}
        except Exception as e:
            decky.logger.error(f"Failed to play song {video_id}: {e}")
            return {"error": "Could not load audio for this song. Please try again."}

    async def play_song_radio(self, video_id):
        """Build a radio queue for a song.

        YouTube/ytmusicapi occasionally changes the Mix response and older
        ytmusicapi versions can raise KeyError("endpoint"). Treat that as a
        recoverable radio failure: fall back to the selected song instead of
        crashing the Decky command.
        """
        if not self.ytmusic:
            return {"error": "Not authenticated"}
        try:
            self.is_playing = False
            tracks = []
            radio_error = None
            try:
                watch = self.ytmusic.get_watch_playlist(videoId=video_id, radio=True)
                tracks = watch.get("tracks", []) or []
            except Exception as e:
                radio_error = str(e)
                if "endpoint" not in radio_error.lower():
                    raise
                decky.logger.warning(f"Radio endpoint is unavailable for {video_id}; falling back to single-track playback")

            # If radio failed because YouTube changed the endpoint shape, fetch
            # the selected song directly. This preserves playback even when Mix
            # generation is temporarily broken.
            # Always have a metadata fallback for the exact search result.
            if not tracks or not any(t.get("videoId") == video_id for t in tracks if isinstance(t, dict)):
                try:
                    details = self.ytmusic.get_song(video_id).get("videoDetails", {})
                    song = {
                        "videoId": details.get("videoId") or video_id,
                        "title": details.get("title", "Unknown"),
                        "uploader": details.get("author", ""),
                        "thumbnails": (details.get("thumbnail") or {}).get("thumbnails", []),
                        "duration_seconds": int(details.get("lengthSeconds") or 0),
                    }
                except Exception as e:
                    decky.logger.warning(f"Direct get_song failed for {video_id}: {e}")
                    song = None
                if song:
                    if tracks:
                        tracks = [song] + [t for t in tracks if t.get("videoId") != video_id]
                    else:
                        tracks = [song]

            if not tracks:
                return {"error": "Could not load this song. YouTube's radio endpoint is currently unavailable." if radio_error else "No playable tracks found"}

            queue = []
            for t in tracks:
                thumbnails = t.get("thumbnail", []) or t.get("thumbnails", [])
                album_art = thumbnails[-1].get("url", "") if thumbnails else ""
                artists = t.get("artists", []) or []
                artist_name = ", ".join(a.get("name", "") for a in artists) if artists else t.get("uploader", "")
                album = t.get("album") or {}
                album_name = album.get("name", "") if isinstance(album, dict) else ""
                duration_seconds = t.get("duration_seconds", 0) or 0
                duration_str = t.get("length", "") or t.get("duration", "0:00")
                if not duration_seconds and isinstance(duration_str, str):
                    try:
                        parts = duration_str.split(":")
                        if len(parts) == 2: duration_seconds = int(parts[0]) * 60 + int(parts[1])
                        elif len(parts) == 3: duration_seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                    except (ValueError, TypeError):
                        duration_seconds = 0
                queue.append({
                    "videoId": t.get("videoId", "") or t.get("videoId", ""),
                    "title": t.get("title", "Unknown"),
                    "artist": artist_name,
                    "album": album_name,
                    "albumArt": album_art,
                    "duration": duration_seconds,
                    "likeStatus": t.get("likeStatus", "INDIFFERENT"),
                })

            self.queue = [t for t in queue if t["videoId"]]
            if not self.queue:
                return {"error": "No playable tracks found"}

            # Selected song first whenever radio returned a larger queue.
            for i, t in enumerate(self.queue):
                if t["videoId"] == video_id:
                    if i != 0: self.queue.insert(0, self.queue.pop(i))
                    break

            self.queue_position = 0
            self.shuffle_order = list(range(len(self.queue))) if self.shuffle else []
            if self.shuffle_order:
                random.shuffle(self.shuffle_order)
                self.shuffle_order.remove(0)
                self.shuffle_order.insert(0, 0)

            result = self._current_track_with_url()
            if result is None or not result.get("url"):
                return {"error": "YouTube did not provide an audio stream for this song. Please try again in a moment."}
            self.is_playing = True
            return result
        except Exception as e:
            decky.logger.error(f"Failed to start song radio for {video_id}: {e}")
            msg = str(e)
            if "endpoint" in msg.lower():
                return {"error": "YouTube changed its radio response. The selected song could not be queued automatically; try again after updating the plugin."}
            if "Sign in" in msg or "sign in" in msg:
                return {"error": "Session expired. Please re-authenticate with fresh browser headers in Settings."}
            return {"error": msg}

    async def get_lyrics(self, video_id, metadata=None):
        if not isinstance(video_id, str) or not video_id.strip():
            return {"error": "No song selected"}
        from ytm_lyrics import LyricsResolver
        if not hasattr(self, '_lyrics_resolver'):
            self._lyrics_resolver = LyricsResolver()
        # Network calls run off Decky's event loop, on an isolated anonymous client.
        return await asyncio.to_thread(self._lyrics_resolver.resolve, video_id, metadata)

    async def translate_lyrics(self, lyrics, target):
        from ytm_translation import translate_lyrics
        return await asyncio.to_thread(translate_lyrics, lyrics, target)

    async def stop_all(self):
        self._queue_load_error = ''
        self.queue = []
        self.queue_position = 0
        self.shuffle_order = []
        self.is_playing = False
        return {"success": True}

    # ── Playlist loading ─────────────────────────────────────────────

    @staticmethod
    def _playlist_track(t):
        if not isinstance(t, dict) or not t.get('videoId') or t.get('isAvailable') is False:
            return None
        thumbs = t.get('thumbnails') or []
        artists = t.get('artists') or []
        album = t.get('album') or {}
        duration = t.get('duration_seconds') or 0
        if not duration:
            try:
                for part in str(t.get('duration') or '0').split(':'):
                    duration = duration * 60 + int(part)
            except (ValueError, TypeError):
                duration = 0
        return {'videoId': t['videoId'], 'title': t.get('title') or 'Unknown',
                'artist': ', '.join(a.get('name') or '' for a in artists if isinstance(a, dict)),
                'album': album.get('name', '') if isinstance(album, dict) else '',
                'albumArt': thumbs[-1].get('url', '') if thumbs else '',
                'duration': duration, 'likeStatus': t.get('likeStatus') or 'INDIFFERENT'}

    async def get_playlist_tracks(self, playlist_id, limit=None):
        if not self.ytmusic:
            return {'error': 'Not authenticated'}
        if not isinstance(playlist_id, str) or not playlist_id.strip():
            return {'error': 'No playlist selected'}
        client = self.ytmusic
        try:
            # A short, account-scoped cache avoids downloading every continuation
            # again when the same large playlist is played or appended repeatedly.
            cache = getattr(self, '_playlist_tracks_cache', {})
            cached = cache.get(playlist_id)
            if cached and cached[0] is client and time.monotonic() - cached[1] < 120:
                return {'tracks': [dict(track) for track in cached[2]]}
            previews = getattr(self, '_playlist_preview_cache', {})
            preview = previews.get(playlist_id)
            if limit == 0 and preview and preview[0] is client and time.monotonic() - preview[1] < 120:
                return {'tracks': [dict(track) for track in preview[2]]}
            data = await (self._api_call('get_liked_songs', limit=limit) if playlist_id == 'LM'
                          else self._api_call('get_playlist', playlist_id, limit=limit))
            if self.ytmusic is not client:
                return {'error': 'Account changed. Please reload Library.'}
            tracks = [track for item in (data.get('tracks') or []) if (track := self._playlist_track(item))]
            if not tracks:
                return {'error': 'This playlist has no available songs.'}
            cache = {key: value for key, value in cache.items()
                     if value[0] is client and time.monotonic() - value[1] < 120}
            while len(cache) >= 3:
                cache.pop(next(iter(cache)))
            if limit is None:
                cache[playlist_id] = (client, time.monotonic(), [dict(track) for track in tracks])
            self._playlist_tracks_cache = cache
            if limit == 0:
                previews = {key:value for key,value in previews.items() if value[0] is client and time.monotonic() - value[1] < 120}
                while len(previews) >= 6:
                    previews.pop(next(iter(previews)))
                previews[playlist_id] = (client, time.monotonic(), [dict(track) for track in tracks])
                self._playlist_preview_cache = previews
            return {'tracks': tracks}
        except Exception as e:
            decky.logger.warning(f'Playlist load failed: {type(e).__name__}')
            return self._account_error(e)

    async def append_playlist(self, playlist_id):
        data = await self.get_playlist_tracks(playlist_id)
        if 'error' in data:
            return data
        tracks = data['tracks']
        old_length = len(self.queue)
        self.queue.extend(tracks)
        if old_length == 0:
            self.queue_position = 0
            self.shuffle_order = []
        if self.shuffle:
            additions = list(range(old_length, len(self.queue)))
            random.shuffle(additions)
            self.shuffle_order = (self.shuffle_order or list(range(old_length))) + additions
        return {'success': True, 'added': len(tracks)}

    async def start_playlist(self, playlist_id, shuffle=False):
        return await self.load_playlist(playlist_id, shuffle, initial=True)

    async def complete_playlist(self, playlist_id, initial_ids, shuffle=False):
        if not isinstance(initial_ids, list) or sorted(initial_ids) != sorted(t['videoId'] for t in self.queue):
            return {'error': 'Playback changed.'}
        queue, client = self.queue, self.ytmusic
        self._queue_loading = queue
        self._queue_load_error = ''
        try:
            data = await self.get_playlist_tracks(playlist_id)
            if self.queue is not queue or self.ytmusic is not client:
                return {'error': 'Playback changed.'}
            if data.get('error'):
                self._queue_load_error = data['error']
                return data
            tracks = data['tracks']
            if [t['videoId'] for t in tracks[:len(initial_ids)]] != initial_ids:
                self._queue_load_error = 'Playlist changed on YouTube. Replay it to reload all tracks.'
                return {'error': self._queue_load_error}
            rest = tracks[len(initial_ids):]
            if shuffle:
                random.shuffle(rest)
            start = len(queue)
            queue.extend(rest)
            if self.shuffle:
                self.shuffle_order.extend(range(start, len(queue)))
            return {'success': True, 'added': len(rest)}
        finally:
            if getattr(self, '_queue_loading', None) is queue:
                self._queue_loading = None

    async def queue_playlist_next(self, playlist_id):
        queue, client = self.queue, self.ytmusic
        data = await self.get_playlist_tracks(playlist_id)
        if data.get('error'):
            return data
        if self.queue is not queue or self.ytmusic is not client:
            return {'error': 'Playback changed.'}
        tracks = data['tracks']
        index = self.queue_position + 1 if queue else 0
        queue[index:index] = tracks
        if self.shuffle:
            order = [i + len(tracks) if i >= index else i for i in self.shuffle_order]
            slot = order.index(self.queue_position) + 1 if self.queue_position in order else 0
            order[slot:slot] = range(index, index + len(tracks))
            self.shuffle_order = order
        if self.repeat == 'ONE':
            self.repeat = 'NONE'
        return {'success': True, 'added': len(tracks)}

    async def load_playlist(self, playlist_id, shuffle=False, initial=False):
        original_queue = self.queue
        snapshot = list(self.queue)
        client = self.ytmusic
        # ytmusicapi parses the first page before applying this limit to
        # continuations. Zero returns that page without an extra network round trip.
        data = await self.get_playlist_tracks(playlist_id, limit=0 if initial else None)
        if 'error' in data:
            return data
        tracks = data['tracks']
        initial_ids = [t['videoId'] for t in tracks]
        if shuffle:
            random.shuffle(tracks)
        # Resolve before committing. Failed extraction never destroys the old queue.
        start_index = 0
        url = None
        # Playlists frequently begin with unavailable/kids/region-blocked
        # uploads. Probe a wider window, but keep the bound predictable.
        candidate_limit = min(20, len(tracks))
        failed_ids = []
        starts = getattr(self, '_playlist_start_urls', {})
        for start_index in range(candidate_limit):
            video_id = tracks[start_index]['videoId']
            cached_start = starts.get(video_id)
            url = (cached_start[2] if cached_start and cached_start[0] is client and time.monotonic() - cached_start[1] < 60
                   else await asyncio.to_thread(self._get_streaming_url, video_id))
            if self.queue is not original_queue or self.queue != snapshot or self.ytmusic is not client:
                return {'error': 'Playback changed while loading.'}
            if url:
                starts = {key:value for key,value in starts.items() if value[0] is client and time.monotonic() - value[1] < 60}
                if len(starts) >= 12:
                    starts.pop(next(iter(starts)))
                starts[video_id] = (client, time.monotonic(), url)
                self._playlist_start_urls = starts
                break
            failed_ids.append(tracks[start_index]['videoId'])
        if not url:
            decky.logger.warning(f"No playable track found in first {candidate_limit} playlist candidates: {failed_ids}")
            return {'error': 'Could not find a playable song near the start of this playlist. The current queue was kept. Try another song or Shuffle.'}
        if self.queue is not original_queue or self.queue != snapshot or self.ytmusic is not client:
            return {'error': 'Playback changed while loading. Please try the playlist again.'}
        self.queue = tracks
        self.queue_position = start_index
        self._queue_load_error = ''
        self.shuffle = bool(shuffle)
        self.shuffle_order = list(range(len(tracks))) if shuffle else []
        self.is_playing = True
        return {**tracks[start_index], 'url': url, 'queuePosition': start_index, 'queueLength': len(tracks),
                'initialIds': initial_ids if initial else None}

    async def restore_local_queue(self, snapshot):
        # Cast disconnection broadcasts an empty queue; restore the already prepared local selection.
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get('tracks'), list):
            return {'error': 'Invalid queue'}
        tracks = snapshot['tracks']
        position = snapshot.get('position', 0)
        if not tracks or type(position) is not int or not 0 <= position < len(tracks):
            return {'error': 'Invalid queue position'}
        if not all(isinstance(t, dict) and t.get('videoId') for t in tracks):
            return {'error': 'Invalid song'}
        self.queue = tracks
        self.queue_position = position
        self.shuffle = bool(snapshot.get('shuffle'))
        order = snapshot.get('shuffleOrder') or []
        self.shuffle_order = order if sorted(order) == list(range(len(tracks))) else list(range(len(tracks))) if self.shuffle else []
        self.repeat = snapshot.get('repeat') if snapshot.get('repeat') in ('NONE', 'ALL', 'ONE') else 'NONE'
        return {'success': True}

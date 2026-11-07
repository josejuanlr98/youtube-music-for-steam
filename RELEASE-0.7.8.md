# YouTube Music for Steam 0.7.8

This update introduces a **Material 3 Expressive** aesthetic overhaul, fixes session & header import reliability (GitHub Issue #3), eliminates poor-connection track-switch regressions, and significantly accelerates lyrics loading, playlist opening, cover crossfades, and Cast device discovery.

## Material 3 Expressive Aesthetic Overhaul

- **Expressive Shape & Tonal Surface System**: Upgraded cards, player surfaces, category pills, transport controls, and dialogs with Material 3 Expressive geometry (`14px`–`22px` squircle containers and `999px` pill actions) paired with dynamic tonal surface colors derived from the active cover artwork palette.
- **Standardized Expressive Motion**: Unified transitions around the Material 3 Expressive standard curve (`cubic-bezier(0.2, 0, 0, 1)`) and refined typography hierarchy across the Quick Access player, Library, Queue, and Fullscreen Lyrics views.

## Playback, Lyrics & Performance Optimizations

- **Poor-Connection Track Changes Fixed**: Replaced `yt-cast-receiver`'s slow network `DefaultPlaylistRequestHandler` (which previously made up to 5 sequential HTTP requests per track change and left stale queue pointers when requests timed out) with a `0 ms` local-queue neighbour resolver. Switching tracks on slow or unstable Wi-Fi now immediately silences the previous stream, increments the playback generation guard, and advances cleanly without replaying the previous song.
- **Instant Lyrics Loading**: Cached thread-local anonymous `YTMusic` instances across worker requests, removed the initial request throttle delay, tightened plain-lyrics fallback timing, and prefetched the actively playing song's lyrics as soon as a track starts playing so opening the Lyrics tab or Fullscreen Lyrics is immediate.
- **Snappier Cover Crossfades**: Accelerated cover artwork crossfades from `420 ms` to `180 ms cubic-bezier(0.2, 0, 0, 1)` (`200 ms` layer retirement) and backdrop crossfades to `240 ms`.
- **Fullscreen Progress Bar Continuity**: Preserved the previous track's artwork palette while the next cover decodes and keyed `.ytm-fullscreen-progress` by `track.videoId` so switching songs in Fullscreen Lyrics never flashes neutral grey or animates backward to `0%`.
- **Faster Playlist Opening**: Pre-warmed the top playlists on Library load and prefetched playlist tracks on controller focus (`onRowFocus`), while marking single-page playlists with filtered unavailable items as complete on the initial preview read.
- **Zero-Flash Volume Slider**: Persisted the volume level in `localStorage` (`ytm-volume-v1`) and synchronized `audioManager` before the first render so the Quick Access volume slider never flashes `100%` when opening the plugin tab.
- **Faster Cast Discovery & Handoff**: Preserved healthy advertising Cast receiver sessions across the 1.5-second boot check instead of tearing down and restarting SSDP/DIAL advertisement.

## Session Persistence & Header Import Fix (Issue #3)

- **Resilient `ytmusicapi` Library & Cookie Parsing**: Patched `get_library_contents` to handle missing `tabs` gracefully, made `get_visitor_id` offline-safe, and hardened `sapisid_from_cookie` with regex extraction before `SimpleCookie` so cookies containing quotes or brackets never break `__Secure-3PAPISID` parsing.
- **Zero-Blocking Pooled API Calls**: Injected `X-Goog-Visitor-Id` on pooled `YTMusic` instances in `_api_call` so `read_bulk()` never triggers a blocking GET to `https://music.youtube.com` per worker thread.
- **Expanded Firefox / Zen / LibreWolf & Header Import Support**: Added WAL-safe SQLite copy fallback when the browser is open, Zen Browser single-workspace container fallback (`userContextId`), Flatpak paths for LibreWolf/Waterfox/Floorp, and multi-format `yt-music-headers.txt` normalization (`Copy as cURL`, `Copy as fetch`, JSON `browser.json`, Netscape `cookies.txt`, HTTP/2 pseudo-headers, and bare `Cookie:` strings).

## Validation

- 26 frontend regression suites, 137 Python tests, and backend TypeScript checks.
- Production frontend (`dist/index.js`) and bundled backend (`bin/server.js`) builds.
- Runtime (`youtube-music-for-steam-0.7.8.zip`) and source (`youtube-music-for-steam-0.7.8-source.zip`) archives verified with SHA-256 checksums (`SHA256SUMS-0.7.8.txt`).

## Installation

Download **youtube-music-for-steam-0.7.8.zip** and install it through **Decky -> Developer Options -> Install from ZIP**. Restart Decky if needed.

The **youtube-music-for-steam-0.7.8-source.zip** archive is for developers, with editable sources nested under `project/`. Do not install the source ZIP or GitHub's automatic source archives in Decky. Checksums for both release ZIPs are provided in **SHA256SUMS-0.7.8.txt**.

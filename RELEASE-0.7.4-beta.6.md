# 0.7.4-beta.6 — audio engine repair on the GitHub baseline

Based on GitHub v0.7.3 plus beta.5's requested Settings-style Cast startup restart.
No Hy-MT2 or later queue/watchdog redesigns are included.

## Audio runtime

- Replace bundled Node 20.18.3 with official Node 22.23.3, verified against the
  official SHA256 manifest. Current yt-dlp/EJS requires Node 22 or newer.
- yt-dlp 2026.08.19 remains the latest official stable release checked on
  2026-10-12. Verify its release SHA256 during builds.
- Upgrade ytmusicapi from 1.11.5 to 1.12.3 for upstream playlist, search and parser
  fixes, adapting the optional watch-tab compatibility patch to its new parser.
- Direct and Cast extraction use the imported YouTube session when present.
  Cookies are stored only in private temporary Netscape jars scoped to
  `.youtube.com`, removed on completion, timeout or error. Guest Cast still works
  anonymously; credentials are not put in command arguments or diagnostic logs.

## Automatic updates and errors

Python owns one background update check for the shared direct/Cast extractor.
It checks official stable releases daily, with a one-hour retry delay after a
failed check. Updates persist in Decky settings across receiver restarts and
device reboots. Downloads must pass the release SHA256 check, version inspection
and a runtime compatibility probe before atomic replacement. A failed update
keeps the previous extractor. Build/runtime staging never downgrades an updated
extractor. Node and the catalogue dependency stay pinned to tested releases.

Restore an inline playback error in Player and report direct-play errors through
the existing action UI. Distinguish HTTP 429, browser verification, authentication,
HTTP 403, timeouts, incompatible runtime and an explicitly unavailable song.
A global provider failure stops extraction after one candidate rather than
probing every song in the playlist or skipping the phone's queue.

## Validation and limits

104 Python tests, 20 frontend regression suites, backend tests, TypeScript checks,
production builds and the real yt-dlp Node provider offline probe are covered.
Installer validation checks actual Linux executables, release digests, packaged
dependency version, source/runtime consistency and absence of local session files.

The anonymous live test of Rosalía's DESPECHÁ (`Y2ESxHKuSOk`) returned HTTP 429 from
the current network even with the supported runtime. It did not return an audio
URL. The imported session is covered with synthetic credentials; real signed-in
playback, device reboot and phone timeline synchronization still need testing on
Steam Deck. This release does not claim to bypass YouTube restrictions.

Sources: https://github.com/yt-dlp/yt-dlp/wiki/EJS,
https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19,
https://github.com/sigma67/ytmusicapi/releases/tag/1.12.3.

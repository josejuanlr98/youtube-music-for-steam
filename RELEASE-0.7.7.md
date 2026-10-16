# YouTube Music for Steam 0.7.7

This update polishes animations throughout the listening experience and supports Steam's new native screensaver, so it does not cover the lyrics while you read in fullscreen. It promotes the tested 0.7.7-beta.3 implementation.

## Steam screensaver compatibility

- Fullscreen lyrics temporarily disable Steam's native screensaver for **both battery and AC power**.
- Leaving fullscreen restores **each timer to its exact previous value**. An already-disabled timer stays disabled, and manual timer changes made during the session are preserved.
- Plugin unloading restores the timers too. A small recovery journal allows the next plugin initialization to restore settings after an interrupted session.
- This uses Steam's actual client settings rather than simulated mouse movement or X11 screensaver commands. Browser wake lock and suspend protection remain supplemental safeguards.

Verified with the October 2026 stable Steam client on Steam Deck: the native screensaver remained inactive while fullscreen protection was held, and the original battery and AC timers returned after release. Other Steam client versions may expose different settings.

## Smoother animations and navigation

- New cover art is loaded and decoded before a 420 ms crossfade. Stale loads are discarded, and the previous image is removed after the transition.
- Original and translated lyric lines share their highlight animation. New transcripts fade in together over 280 ms without restarting the fade on each progress or translation update.
- Song changes no longer briefly highlight the first line from stale state. Stopping playback immediately clears the previous cover's background colors and ambient motion.
- Back navigation uses a short exit animation and waits for Steam's destination view before reopening Quick Access. Nested artists, albums and playlists retain their category, page, scroll position and focus.
- Reduced-motion preferences disable the entry fades and related motion.

## Faster, more resilient lyrics

YouTube and LRCLIB lookups can run in parallel on a bounded worker pool without waiting for a slower losing request. Readers share in-flight work and successful cached results. Incomplete Cast metadata is enriched before matching external lyrics; plain lyrics can appear while synchronized timing is still pending, and late timed results upgrade the cache.

Recording matching remains strict, including artist, title and duration checks. Temporary errors are not cached as successful results, and translation Retry remains available. Prefetching runs only while a reader is open and does not translate unheard queue items. Actual loading time depends on the track, provider and connection.

## Validation

- 25 frontend regression suites, 130 Python tests and 56 backend tests.
- Frontend and backend TypeScript checks, production builds and compiled frontend entry evaluation.
- Runtime/source archive consistency, source-map contents, ZIP integrity, executable Linux binaries and SHA-256 checksums.
- During beta review, live Steam Deck checks covered native screensaver suppression/restoration, Back navigation, provider lookup and artwork crossfades. The user confirmed the final beta.3 behavior before this stable release.

The audio engine and translation providers are unchanged from the reviewed 0.7.6 release. This update retains Google Translate's no-key endpoint with MyMemory/Apertium fallbacks; it does not add Hy-MT2 or require a translation API key.

## Installation

Download **youtube-music-for-steam-0.7.7.zip** and install it through **Decky -> Developer Options -> Install from ZIP**. Restart Decky if needed.

The **youtube-music-for-steam-0.7.7-source.zip** archive is for developers, with editable sources nested under `project/`. Do not install the source ZIP or GitHub's automatic source archives in Decky. Checksums for both release ZIPs are provided in **SHA256SUMS-0.7.7.txt**.

# YouTube Music for Steam 0.7.5 — Near-instant prepared track transitions

A meticulous optimization pass across Python, Node.js and the Steam/CEF interface, developed with assistance from **Gemini 4 Argon**. This update prepares upcoming songs before they are needed and removes duplicated extraction work, making transitions **almost instantaneous when the next stream is already prefetched**. Next/Previous also responds immediately in the interface instead of appearing to do nothing while audio loads.

## Why switching songs feels faster

- **Prepare the next song early.** Local playback starts prefetching as soon as audio begins. After three seconds it requests a second upcoming song, helping with consecutive skips. Cast starts preparing its next song after one second of playback.
- **Reuse prepared audio URLs.** Local and Cast paths cache upcoming extraction results for up to ten minutes. Local lookahead follows the queue, shuffle and repeat settings. Errors invalidate the affected entry so recovery can request a fresh stream.
- **Share work already in progress.** Pressing Next while prefetch is running joins the existing extraction rather than launching a second yt-dlp process for the same song.
- **Give immediate feedback.** Next/Previous pauses the previous audio, resets the displayed progress and highlights the pressed control. Local playback previews the target title, artist and artwork while resolving its stream. Generation checks prevent a superseded UI response from replacing a later selection.
- **Keep useful connections and caches.** Catalogue requests reuse HTTP Keep-Alive sessions, lyric requests reuse their session, and yt-dlp receives a persistent XDG cache directory.

Near-instant transitions describe the prepared/cache-hit path. An unprepared song, expired URL, slow network or YouTube restriction can still require extraction and media buffering. We are not publishing a universal sub-50-ms timing benchmark.

## Less repeated background work

- An unchanged Node executable is not copied again on every receiver start. Changed binaries are staged without loading the entire executable into Python memory, and staging runs off the event loop.
- Volume/system-audio work runs off the Python event loop and reuses known steamwebhelper sink-input indices. Radio calls also use the asynchronous API wrapper.
- Catalogue HTTP sessions are retained for reuse, with up to four idle sessions kept in the pool; sign-out/unload clears them.
- Network detection checks an in-memory interface signature and reuses the known result when unchanged, avoiding repeated nmcli launches in that state. Sender-identity work skips inactive receiver/session states.
- Artwork sampling is limited to three concurrent jobs. Palette persistence uses a 400-ms debounce instead of repeatedly serializing the cache while scrolling.
- Fine lyric-clock callbacks skip reader updates while playback is paused or the reader document is hidden. This is reduced work, not a claim of zero timers or zero CPU use.

## Resilience and the final visual correction

- Selected yt-dlp signature/format failures can retry with the alternate `tv,ios,mweb` client profile.
- Radio/Mix handles additional schema-parser exceptions and can fall back to the selected song.
- Cast receives its datastore location from Decky's settings directory, retaining the legacy path as a fallback.
- The existing maintenance loop checks whether the Cast child process exited and can restart it. This check follows that loop's hourly cadence; it is not a continuous instant-restart watchdog.
- **Find a song in Library now stays neutral.** When Player has no artist to display, its helper text no longer inherits the previous cover's color. Actual artist names retain the artwork color.

The working 0.7.4 audio runtime/session handling, verified stable extractor updater, requested Cast startup reset, free optional lyric translation, controller navigation and Steamcord-compatible notifications are retained. The optimization pass does not promise that future YouTube changes need no maintenance.

## Validation and downloads

Based on the supplied all-phases source build, with the requested empty-state color correction and 0.7.5 release metadata/documentation. Checks cover **110 Python tests**, **56 backend tests**, **20 frontend regression suites**, frontend/backend TypeScript checks, production builds, the actual yt-dlp Node-provider smoke probe, and installer content/digest/executable-permission verification. The automated prefetch test uses simulated audio/RPC responses; it is not a physical playback latency measurement.

Install **youtube-music-for-steam-0.7.5.zip** through Decky Developer Options and restart Decky or SteamOS to load the new build. The `-source.zip` asset is for developers. **SHA256SUMS-0.7.5.txt** lists both archive hashes.

Optimization assistance: **Gemini 4 Argon**. Compilation, verification, final helper-text color fix and publication: Codex-assisted work for the project maintainer. Existing upstream/license credits remain in the README.

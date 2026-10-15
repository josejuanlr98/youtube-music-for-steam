# YouTube Music for Steam 0.7.6 — Refined Player, fullscreen lyrics and Google translation

This release builds on the supplied Gemini-assisted 0.7.6 code and the prepared track transitions from 0.7.5. It refreshes the Player and fullscreen lyric reader, adds Google Translate as the first optional translation path, and includes the new Steam Deck screenshots.

## Player and fullscreen lyrics

- A compact Player with a Cast device badge, refreshed controls and Music wordmark.
- Fullscreen progress and elapsed/total time beneath the cover, larger artwork, a darker animated cover palette, and matching light colors for artist, Cast details and translations.
- Artwork preloading and revised sampling reduce repeated loading and improve cover-derived colors. Cached palettes can be used immediately.
- Timed and untimed lyric readers resume following three seconds after manual browsing. Untimed reading still pauses five seconds at the end before looping.
- Lyric lookup can normalize video/soundtrack title suffixes and Topic artist names, retry temporary failures, and search LRCLIB when exact lookup does not return usable lyrics. Matching artist and duration checks help avoid synchronizing the wrong recording.

## Optional Google translation

Google Translate's no-key GTX endpoint is now attempted first. MyMemory and Apertium remain fallbacks for missing lines. The feature stays **off by default**, follows the selected translation language, and sends lyric text without imported YouTube cookies or account data.

During release review we corrected a cache bug: a song translated entirely by Google was not written into the persistent cache. Successful translations now persist regardless of which provider completed them. Repeated verses are reused; blank lines and original/translated alignment are preserved. Failed stanza alignment retries individual lines. HTTP responses are closed, Google 429/503 responses trigger a cooldown, and providers share the request time budget. Partial failures keep original lyrics and provide a Retry control.

This endpoint is a best-effort integration, not an authenticated Google Cloud Translation subscription or a locally installed neural model. Service availability, limits and translation accuracy can change. In the live release probe Google returned HTTP 429 from the test network; the fallback path completed the two-line test. Automated tests independently cover the Google success, persistence, line-alignment, cooldown and malformed-response paths. No unlimited-free-use claim is made.

## Playback, loading and startup

- Retain early next-track prefetch and reuse of in-flight audio extraction from 0.7.5.
- Start playlist preview work before navigation, keep bounded collection caches longer and return to Quick Access sooner.
- Preserve display progress through track changes and avoid late preview metadata overwriting an already loaded song.
- Persist the staged Node runtime and refresh network identity through NetworkManager.
- A deferred Cast startup restart now checks the receiver before running, so a connected or playing phone is not interrupted by that recovery path.
- The empty Player helper stays neutral instead of inheriting the previous song's artwork color.

## Install the correct ZIP

Install **youtube-music-for-steam-0.7.6.zip** from Decky Developer Options. The normal installer contains the compiled frontend/backend and Linux runtime.

**Do not install the -source.zip or GitHub's automatic source archives in Decky.** The source-only download now places the editable repository in `project/` beneath its root and contains a source-only notice. This prevents Decky's local ZIP installer from recognizing it as a second uncompiled plugin.

If an older source ZIP was installed previously, remove its duplicate folder from Decky's plugins directory. On the inspected Steam Deck, startup loaded the working 0.7.5 and then replaced it with a 0.7.4 source directory lacking `dist/index.js`, causing HTTP 404 and “Failed to fetch dynamically imported module.” Removing that duplicate restored HTTP 200. This was a separate installation issue, rather than a compatibility fix claimed for every Steam update. No user account settings need to be deleted.

The release includes installer and developer source downloads plus **SHA256SUMS-0.7.6.txt**. Production builds, frontend/backend TypeScript checks, 119 Python tests, 56 backend tests and 20 frontend regression suites passed locally, together with the actual yt-dlp Node-provider smoke check and archive/source-map/digest/executable-permission verification. These checks do not replace testing every phone, network, Steam build or recording in use.

## New screenshots

![Player receiving a Cast session](https://raw.githubusercontent.com/josejuanlr98/youtube-music-for-steam/v0.7.6/screenshots/player-casting-076.jpg)

![Fullscreen lyrics with progress](https://raw.githubusercontent.com/josejuanlr98/youtube-music-for-steam/v0.7.6/screenshots/lyrics-fullscreen-076.jpg)

![Translated fullscreen lyrics](https://raw.githubusercontent.com/josejuanlr98/youtube-music-for-steam/v0.7.6/screenshots/lyrics-translated-076.jpg)

Development assistance: Gemini; release review, regression fixes, compilation and packaging: Codex-assisted work for the maintainer. Existing upstream and license credits remain in the README.

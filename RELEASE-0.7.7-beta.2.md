# YouTube Music for Steam 0.7.7-beta.2

This beta polishes the supplied Gemini revision's cover transitions, lyric following and loading, especially when Cast initially sends incomplete metadata.

## Changes

New covers are downloaded and decoded before being shown. The previous decoded image remains underneath a 420 ms opacity fade and is removed after the transition. Stale downloads cannot overwrite a later selection, failed large images can fall back to the original thumbnail, and the image controller is disposed with its reader. The background also fades between palettes; reduced-motion settings reveal the new palette immediately instead of leaving an opaque old overlay behind.

Lyric originals and their translations continue to share one highlight transform. The highlight uses a 340 ms transition, short gaps between vocal lines no longer briefly shrink and regrow the highlight, and explicit blank instrumental cues remain inactive. Scrolling retains fractional internal positions instead of feeding rounded device pixels back into every animation step. Layout changes re-center smoothly after the initial placement.

The backend races anonymous YouTube lyrics and LRCLIB when useful metadata is available. It returns the first valid synchronized result without waiting for the slower worker. A reusable four-worker pool, in-flight request sharing, bounded caches and provider-local HTTP sessions prevent duplicate reads and avoid sharing a mutable session between threads. Canonical watch metadata can fill a Cast track's missing title, artist and duration. If plain lyrics arrive first, they can be displayed while a late timing result upgrades the cache.

The frontend listens for metadata changes on the same video ID, rejects stale responses after rapid song changes, shares compact/fullscreen requests and prefetches current/next lyrics only while a reader is mounted. It does not translate unheard queue items. Transient errors are retried and do not poison the success cache. The existing translation provider and Retry button are retained.

The supplied revision's per-call executor context waited for both providers before returning. Its relaxed 25-second LRCLIB match could attach the wrong recording's timing, and its new unused stream-prefetch RPC used unquoted dictionary keys that would fail at runtime. Those approaches are not shipped. This beta keeps strict matching and returns text without invented timing when a music-video counterpart's clock cannot be verified.

The native fullscreen screensaver settings and their restoration from beta.1 are retained. Existing playlist loading/pagination, yt-dlp, audio extraction and Cast transport are unchanged. No dependency upgrade or audio-engine rewrite is included.

## Validation

- Frontend TypeScript and Rollup build pass. The generated ESM entry evaluates with Decky/React globals.
- 24 frontend suites, 130 Python tests and 56 backend tests pass. New coverage checks provider races, shared reads, missing Cast metadata, progressive timing, strict recording matching, decoded-image promotion, fallback, rapid skips and cleanup.
- On the user's Steam Deck/network, BOOMPALA loaded 60 synchronized LRCLIB lines in approximately 600 ms. A fresh lookup with Cast-style incomplete metadata loaded 76 native YouTube/LyricFind lines in approximately 862 ms. Subsequent cache lookups measured below 1 ms. These are individual observations, not guarantees for every song or service condition.
- The new decoded-image controller and matching fade markup/CSS were exercised inside Steam's fullscreen document. Measured opacity progressed from 0 through approximately 0.27 and 0.87 to 1; the previous layer was removed afterward. The compiled React component was not installed over the running plugin during these tests.
- The shipped Linux audio binaries retain the reviewed hashes and executable modes. The actual bundled yt-dlp JavaScript provider passes its offline Node runtime smoke test.

The installable is `youtube-music-for-steam-0.7.7-beta.2.zip`. The `-source.zip` is a developer archive and deliberately nests its editable project to prevent duplicate-plugin installation.

Matching references: [LRCLIB API](https://lrclib.net/docs), [ytmusicapi lyrics API](https://ytmusicapi.readthedocs.io/en/latest/reference/api/ytmusicapi.mixins.html).

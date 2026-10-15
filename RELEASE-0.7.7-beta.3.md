# YouTube Music for Steam 0.7.7-beta.3

This beta fixes two fullscreen lyric presentation issues from beta.2.

When playback stops, the backdrop immediately uses the neutral palette, removes any previous-song color overlay and stops ambient motion. The normal behavior of holding the last palette while a new song's cover is being sampled is preserved.

The active lyric now belongs to both a video ID and its exact timed transcript. A stale transcript cannot be attached to the next song's audio clock. The follower settles its initial cue in React's layout phase before painting, so cached lyrics do not briefly inherit row zero or the previous song's highlight.

Each newly available transcript fades in over 280 ms. Originals and translations stay inside the same fade and highlight group. Progress updates, normal cue changes and arriving translations do not restart the entry fade. Reduced-motion preferences disable the fade.

Validation: all 25 frontend suites pass, including regressions for an idle backdrop before effects run, clearing pending color layers, a cached track change before painting, stale follower rejection, per-track fade identity and reduced motion. TypeScript and the Rollup build pass. Audio extraction, Cast transport, translation providers and Python/backend behavior are unchanged.

Install `youtube-music-for-steam-0.7.7-beta.3.zip`. The source archive is for development only. Copying the installer to the Deck does not replace the running installation.

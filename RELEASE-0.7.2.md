# YouTube Music for Steam 0.7.2

Rapid navigation through playlist, artist, album, Search and Library rows now clears the previous highlight immediately. The visual selection has a single owner per Steam document, so delayed native focus or stale Steam focus classes cannot leave a glow on earlier songs. Row focus animations and extra focus-ring overlays are disabled.

Pressing B to leave Settings closes the page once and returns to the YouTube Music Player panel, including when the panel remounts.

**Install:** download `youtube-music-for-steam-0.7.2.zip` and use Decky > Developer Options > Install from ZIP. The `-source.zip` contains code and tests for review, including Claude.

Validation: production TypeScript, both builds and regression suites. Browser checks at 1280x720 and 1280x800 simulate 200 rapid focus transfers while leaving stale Steam classes and native focus in place; only the current row remains highlighted. Navigation tests cover duplicate B input and restoring the plugin after Settings. These are simulated controller/navigation checks, not a physical Steam Deck test.

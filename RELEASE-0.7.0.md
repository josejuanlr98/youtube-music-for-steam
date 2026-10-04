# YouTube Music for Steam 0.7.0

Explore your saved playlists, albums, artists and songs from Library and Search. Open artist discographies or album track lists, play or shuffle collections, and add individual songs or complete collections to the queue.

New collection windows focus **Play**. Going Back restores the parent category, page, scroll position and selected item: artist → Albums → album → B returns to Albums and the album you opened. Search starts with its input focused, inherits Library's category before the first search and preserves subsequent searches. Queue has upper and lower pagination; lower Next/Previous returns to the matching upper control without jumping back to the bottom when navigating down.

Refresh displays a fresh first-page preview while the remaining Library loads in the background. Cached reads are shared and late responses from before a refresh cannot replace newer data. Artist and album rows offer Play/Shuffle; opened collections offer Play, Shuffle, Play next and Add all.

Fullscreen lyrics include cover-colored motion, synchronized highlighting and optional translations into a language chosen independently of the interface. Original and translated lines share highlighting and fading, and manual lyric scrolling returns to automatic following after five seconds. Translation is free and requires no API key, using MyMemory with Apertium fallback for supported pairs; external availability and quotas still apply. Original lyrics remain visible if translation is unavailable.

Cast retains a persistent discovery identity, guards stale playback events and validates local controls. The local HTTP/WebSocket API permits Steam/loopback browser origins, and oversized requests are rejected early. Cast-only use needs no account. Account import supports Firefox, Zen, LibreWolf, Waterfox and Floorp, with manual header import available for other browsers.

**Install:** download `youtube-music-for-steam-0.7.0.zip`, then use Decky → Developer Options → Install from ZIP. The `-source.zip` contains reviewable code and tests for developers/Claude, not the Decky installer. Seven new screenshots are in the README.

Validation: frontend/backend production TypeScript, both builds, 20 JavaScript regression suites, 48 backend Vitest tests and 88 Python tests. Headless browser fixtures exercise real components and saved-route remounts at 1280×720 and 1280×800, including artist/album, Search and Library Back navigation and initial Play focus. These fixtures simulate Steam navigation; they are not an additional physical SteamOS controller or phone-casting test.

This unofficial community project is not affiliated with Google, YouTube or Valve. AI tools assisted development and testing. **Feedback is especially welcome**, including reproduction steps, SteamOS/Decky versions and whether you were casting or playing directly. Try it while gaming or use fullscreen lyrics while games download, and share how it works on your setup.

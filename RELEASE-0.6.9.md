# YouTube Music for Steam 0.6.9

This release adds an open playlist view: browse tracks, play or queue individual songs, or act on the full playlist. It also improves Steam Deck controller navigation, queue paging, artwork-based colors, fullscreen lyrics, and translations. The interface supports seven languages. Lyrics can optionally be translated into a language you choose separately from the interface language.

Manual song selections from Search, Library, open playlists, and the local queue stay quiet; automatic track changes still use Steam notifications. The translation reader now reports when the external free translation provider reaches its daily quota, avoids repeated requests, and keeps the original lyrics visible. **Translation still depends on MyMemory's availability and daily limit.**

Account import supports Firefox, Zen, LibreWolf, Waterfox, and Floorp on the SteamOS device; manual request-header import remains available. Cast works without an account. The refreshed screenshots in the README show the player, Cast, playlist detail, language settings, and lyrics.

**Install:** download `youtube-music-for-steam-0.6.9.zip` and use Decky → Developer Options → Install from ZIP. The `-source.zip` file is for developers, not Decky installation.

This is an unofficial community project for Steam Deck and other SteamOS systems with Decky Loader. Steam Deck is the tested platform; Steam Machine compatibility reports and feedback are welcome. AI tools assisted development and testing; the maintainer reviewed the changes.

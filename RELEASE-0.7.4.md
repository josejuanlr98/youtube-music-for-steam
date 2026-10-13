# YouTube Music for Steam 0.7.4

Audio playback can recover from the Loading/no-audio and repeated-skipping failures in affected installations. This release combines a compatible extractor runtime, the imported YouTube session for audio requests, persistent automatic extractor updates and a Cast startup reset. Playback was confirmed working on Steam Deck after testing beta.6.

## What fixed playback

**The runtime was incompatible.** The old ZIP included Node 20.18.3. Current yt-dlp uses a JavaScript component to process YouTube challenges, and that component requires Node 22 or newer. This release ships official **Node 22.23.3**, verified against the official release checksum. yt-dlp **2026.08.19** was already the latest stable release when checked on October 12, 2026; changing yt-dlp alone would not fix the unsupported runtime.

**Audio extraction was anonymous even after importing an account.** Previously, the imported browser session authenticated Library and Search, but was not passed to the audio extractor. Direct and Cast extraction now use that session when available. Cookies are supplied through private temporary Netscape jars scoped to `.youtube.com`; the raw cookies never appear in command arguments or logs, and are not sent to media CDNs, translation providers or GitHub. Temporary jars are removed after completion, timeout or error. Guest Cast remains available anonymously.

**Catalogue parsing also needed an update.** ytmusicapi moves from 1.11.5 to **1.12.3**, including upstream playlist, search and parser fixes. The optional lyrics/related-tab compatibility patch has been adapted to its new parser.

## Staying up to date

One background updater now serves both direct and Cast playback. It checks official stable yt-dlp releases daily and can retry failed checks after one hour. An update must pass release SHA256 verification, version inspection and a JavaScript runtime compatibility probe before atomic replacement. If anything fails, the installed extractor remains available.

The extractor is stored in Decky settings, so updates survive device reboots and receiver restarts. Startup does not overwrite a newer extractor with the older copy in the plugin ZIP. This replaces the previous silent Cast-only update attempt that could be undone on restart. Node and ytmusicapi stay pinned to tested versions delivered through plugin updates.

## Cast startup and clearer errors

When Decky loads the plugin, including after reboot, it performs the existing Settings receiver restart once. Opening the panel again does not restart Cast.

Player now shows actionable extraction errors: HTTP 429, browser verification, authentication, HTTP 403, timeouts and runtime failures. Provider-wide failures stop further extraction attempts instead of skipping through the phone queue or probing many playlist songs. Explicitly unavailable songs can still be skipped.

## Installing

Download **youtube-music-for-steam-0.7.4.zip** and install it through Decky Developer Options. Restart SteamOS once after upgrading from an affected version. If YouTube requests a fresh session, sign into YouTube Music in a supported Firefox-family browser on the SteamOS device, close the browser, and import cookies in **Settings → Account**.

The `-source.zip` asset is for developers; it is not the Decky installer. `SHA256SUMS-0.7.4.txt` includes hashes for both archives.

## Validation

The release uses the playback implementation verified in beta.6, with release metadata and documentation updated for 0.7.4. Checks passed: **104 Python tests**, **55 backend tests**, **20 frontend regression suites**, frontend/backend TypeScript checks, production builds, the actual yt-dlp Node provider smoke test, installer digests/permissions, and imports from the extracted installer. Runtime files are compared with the tested beta.6 installer.

Playback working on the test device does not guarantee acceptance of every YouTube request. An anonymous development-network test returned HTTP 429 even with the compatible runtime. The plugin reports these restrictions rather than claiming to bypass them.

Technical references: [yt-dlp/EJS runtime requirements](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [yt-dlp 2026.08.19](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19), [ytmusicapi 1.12.3](https://github.com/sigma67/ytmusicapi/releases/tag/1.12.3).

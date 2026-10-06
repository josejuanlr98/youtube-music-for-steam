# YouTube Music for Steam 0.7.3

The volume and playback-progress slider thumbs now use the same light cover color as artist names, the translation badge and translated lyrics. Separate handles and Steam builds that draw the thumb as a track pseudo-element are both supported; the filled track keeps its primary cover color.

Notifications now respect Steamcord's shared compatible routing instead of bypassing its safe renderer. Song and artist text remain readable, with a YouTube Music prefix to identify the source. Steamcord's safe-mode appearance, sound policy and streamer settings apply. Normal Decky notifications retain their existing appearance when Steamcord is inactive. Manual song selection and fullscreen/panel notification suppression remain intact.

The notification sound guard also recovers when Steamcord replaces Steam's sound function, and unloading leaves other plugins' sound routing intact.

**Install:** download `youtube-music-for-steam-0.7.3.zip` and use Decky > Developer Options > Install from ZIP. The `-source.zip` contains the code and regression tests for review, including Claude. This release replaces the withdrawn 0.7.2 publication and includes its focus and Settings Back fixes.

Validation: production TypeScript, both builds and regression suites. Browser fixtures at 1280x720 and 1280x800 check matching slider colors across cover palettes and focused states. The actual notification module from the provided Steamcord 1.40.3 archive was exercised with simulated Steam APIs in both plugin load orders, safe/native modes and streamer mode. These checks are not a physical Steam Deck notification test.

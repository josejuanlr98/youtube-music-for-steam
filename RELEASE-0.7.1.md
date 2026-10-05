# YouTube Music for Steam 0.7.1

Untimed fullscreen lyrics now stay where you scroll for five seconds after your last input, then continue reading from that position without jumping back. At the bottom, they wait five seconds and repeat. Pausing playback stops reading; timed lyrics retain their five-second return to the current sung line.

Artist names and Cast text/icons share the soft cover color used by translated lyrics and the translation badge, in Player and lyric views.

**Install:** download `youtube-music-for-steam-0.7.1.zip` and use Decky > Developer Options > Install from ZIP. The `-source.zip` contains code and tests for review, including Claude.

Validation: frontend/backend production TypeScript, both builds and the full regression suite. Deterministic component tests exercise timed/untimed local and Cast lyric scrolling, repeated controller/wheel input, translation arrival and cleanup. These tests simulate playback and controller input; they are not a physical Steam Deck/phone test.

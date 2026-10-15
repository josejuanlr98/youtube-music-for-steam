# YouTube Music for Steam 0.7.7-beta.1

This beta fixes fullscreen lyrics being covered by Steam's new native screensaver and coordinates B navigation with Steam's actual route lifecycle.

## Screensaver protection

The October 2026 screensaver is implemented inside Steam. X11 `xset`, DPMS, synthetic browser mouse events and guessed store methods do not control it. The two settings verified on the Steam Deck are:

- `system_idle_screensaver_battery_sec`
- `system_idle_screensaver_ac_sec`

The plugin obtains each value and its protobuf-aware setter from Steam's `settingsStore.GetClientSetting`. It sets both timers to zero only while fullscreen lyrics is mounted, then restores their individual original values. A timer already disabled remains disabled. Changing a timer yourself to another duration takes precedence over restoration.

Writes and restoration are serialized to handle leaving fullscreen before an asynchronous native update completes. Multiple fullscreen leases share one snapshot. Partial entry failures roll back already-applied changes. A bounded localStorage recovery record stores only the two owned numeric values before the writes; plugin initialization restores any interrupted session. Restoration errors retain the remaining recovery record for another attempt. No backup folders or files are created on the Deck.

Browser screen wake lock and Steam's suspend blocker remain supplemental protections. No separate temporary native screensaver-inhibit method was exposed by the inspected Steam client build, so this beta uses the native settings rather than claiming that an unsupported inhibit call works. The Steam store is an internal interface: unsupported clients fail safely without altering unknown settings.

## Navigation

- B uses one short exit animation and captures the main Steam window's History before focus changes.
- History POP completion, route unmount and destination painting precede reopening Decky's Quick Access panel.
- Nested albums/artists return one level and preserve the existing saved filter, page, scroll and cursor logic.
- Returning after playback or leaving Settings unwinds only the plugin's own routes. Repeated B, unrelated Steam shortcuts and failed navigation cannot issue duplicate returns.
- Reduced-motion preferences skip the exit animation. A bounded compatibility path remains for older Steam clients without the inspected History interface.
- Heavy root entrance animations are replaced by a brief content entrance. The artwork-ready gate is retained to avoid an incomplete palette on reopening.

## Validation

- Frontend TypeScript check and Rollup build pass; the built ESM entry evaluates with loader globals.
- 22 frontend test suites pass, including 13 native-power scenarios and 8 route-transition scenarios.
- 119 Python tests and 56 backend tests pass; backend TypeScript passes.
- On the user's Steam Deck, both timers changed from 60 seconds to zero through the real native setters. After more than 80 seconds the native screensaver was still inactive. Both original 60-second values were subsequently restored and the recovery record was removed.
- The navigation service was exercised against the real Steam window: fullscreen lyrics returned to `/library/home` and reopened Quick Access. Smoothness across every artist/album/settings route still needs normal controller use of the installed beta; the navigation tests cover those route patterns.

Audio extraction, translation providers, Cast startup and dependency versions retain the reviewed 0.7.6 implementation. This change does not claim new live playback or translation validation. The attached Gemini ZIP was used to review the failed screensaver approach and navigation edits; speculative power changes were replaced instead of installed.

Install `youtube-music-for-steam-0.7.7-beta.1.zip` through Decky. The `-source.zip` is for development only and deliberately nests the editable project to prevent accidental duplicate-plugin installation.

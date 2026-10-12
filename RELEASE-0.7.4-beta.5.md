# 0.7.4-beta.5 — GitHub baseline with automatic Cast restart

Based exclusively on GitHub v0.7.3, commit fe18d0752954fc6fd7a92b4d3f55faa961fb922b.

After the initial Cast backend startup finishes, plugin startup calls the existing
Settings `hard_reset()` function once. This performs the same playback reset,
receiver stop and receiver start as the Settings button. It runs when Decky loads
the plugin, including after a device reboot, not when reopening the panel.

The installer retains every byte from the published v0.7.3 release except
`main.py` and the version/package metadata in `package.json`. UI, playback,
translation, dependencies, extraction and Cast backend remain the published version.

Validation: startup ordering, existing Settings reset, state cleanup and failure
logging regression tests. Device reboot and phone timeline synchronization still
require testing on Steam Deck.

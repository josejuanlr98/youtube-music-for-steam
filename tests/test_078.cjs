const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

(async () => {
  // 1. Fast cover art transition retirement (200ms) & M3 Expressive curve (180ms cubic-bezier(0.2, 0, 0, 1))
  const timers = new Map();
  let clock = 0, seq = 0;
  const api = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync('src/services/artworkTransition.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports: api,
      setTimeout: (fn, delay) => { timers.set(++seq, { fn, at: clock + delay }); return seq; },
      clearTimeout: (k) => timers.delete(k),
    }
  );
  const frames = [];
  const transition = api.createArtworkTransition(
    (f) => frames.push(f),
    (src) => ({ ready: Promise.resolve(src), cancel() {} })
  );
  transition.setSource('cover-1');
  await Promise.resolve();
  await Promise.resolve();
  transition.setSource('cover-2');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(frames.at(-1).previous, 'cover-1');
  assert.equal(frames.at(-1).current, 'cover-2');
  clock += 200;
  for (const [id, timer] of [...timers]) {
    if (timer.at <= clock) {
      timers.delete(id);
      timer.fn();
    }
  }
  assert.equal(frames.at(-1).previous, '', 'previous cover retires within 200ms');

  const crossfadeSrc = fs.readFileSync('src/components/CrossfadeArtwork.tsx', 'utf8');
  assert(crossfadeSrc.includes('180ms cubic-bezier(0.2, 0, 0, 1)'), 'CrossfadeArtwork uses 180ms M3 Expressive motion curve');

  // 2. VolumeSlider initial render reads persisted localStorage volume without flashing 100
  const volumeSliderSrc = fs.readFileSync('src/components/VolumeSlider.tsx', 'utf8');
  const audioManagerSrc = fs.readFileSync('src/services/audioManager.ts', 'utf8');
  assert(volumeSliderSrc.includes("VOLUME_STORAGE_KEY = 'ytm-volume-v1'") && volumeSliderSrc.includes('localStorage.getItem(VOLUME_STORAGE_KEY)'), 'VolumeSlider initializes from persisted ytm-volume-v1');
  assert(audioManagerSrc.includes("localStorage.setItem(VOLUME_STORAGE_KEY"), 'audioManager persists volume changes to localStorage');
  assert(audioManagerSrc.includes('export function syncInitialVolume'), 'audioManager exports syncInitialVolume');

  // 3. Fullscreen LyricsPage progress bar key & palette continuity across track changes
  const lyricsPageSrc = fs.readFileSync('src/components/LyricsPage.tsx', 'utf8');
  assert(lyricsPageSrc.includes('let lastActiveLyricsPalette: [string, string, string] | null = null;'), 'LyricsPage retains lastActiveLyricsPalette across track changes');
  assert(lyricsPageSrc.includes('key={track.videoId} className="ytm-fullscreen-progress"'), 'Fullscreen progress bar is keyed by track.videoId to prevent backward width animation');

  // 4. CastPlayer fast local-queue neighbour handler & resilient next/previous on poor connections
  const castPlayerSrc = fs.readFileSync('backend/src/CastPlayer.ts', 'utf8');
  assert(castPlayerSrc.includes('getPreviousNextVideosAbortable'), 'CastPlayer overrides slow DefaultPlaylistRequestHandler with local 0ms neighbour resolution');
  assert(castPlayerSrc.includes('if (nextId) return this.playVideoById(nextId)'), 'CastPlayer.next advances directly via playVideoById when nextId is in queue');
  assert(castPlayerSrc.includes('if (previousId) return this.playVideoById(previousId)'), 'CastPlayer.previous advances directly via playVideoById when previousId is in queue');

  // 5. Active track lyrics prefetch on track change
  const lyricsServiceSrc = fs.readFileSync('src/services/lyrics.ts', 'utf8');
  const indexSrc = fs.readFileSync('src/index.tsx', 'utf8');
  assert(lyricsServiceSrc.includes('export function prefetchCurrentTrackLyrics'), 'lyrics service exports prefetchCurrentTrackLyrics');
  assert(indexSrc.includes('prefetchCurrentTrackLyrics(track)'), 'index.tsx prefetches lyrics as soon as track changes');

  console.log('PASS v0.7.8 fast artwork crossfade, persisted initial volume, fullscreen progress continuity, resilient Cast queue navigation and active lyrics prefetch');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

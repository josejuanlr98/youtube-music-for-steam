const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(name, modules, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => {
    if (name in modules) return modules[name];
    throw Error(`Unexpected import: ${name}`);
  }, console, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, ...globals });
  return exports;
}

async function audioTests() {
  let failCast = false;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const requests = [], calls = [];
  const audio = { style: {}, src: 'old', pause() { this.paused = true; }, load() {}, removeAttribute() { this.src = ''; }, addEventListener() {}, removeEventListener() {} };
  const api = load('src/services/audioManager.ts', { '@decky/api': { call: async name => { calls.push(name); return { success:true }; } } }, {
    document: { getElementById: () => audio }, WebSocket: class { static OPEN = 1; },
    fetch: async (url) => { requests.push(url); await pending; return { ok:true, json: async () => ({ ok:!failCast }) }; },
  });
  api.initAudio();
  const stop = api.stopAllPlayback();
  assert.equal(api.stopAllPlayback(), stop);
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
  assert(calls.includes('stop_all'));
  assert(requests.some(url => url.endsWith('/api/cast/disconnect')));
  finish();
  await stop;
  assert.equal(api.getCurrentTrack(), null);
  assert.equal(api.getQueue().tracks.length, 0);
  assert.equal(api.getIsCastConnected(), false);
  console.log('PASS Stop silences immediately, clears both queues and unlinks even without a Cast UI flag');
  console.log('PASS repeated Stop clicks share the same operation');
  failCast = true;
  await assert.rejects(api.stopAllPlayback(), /unlinking failed/);
  assert.equal(audio.src, '');
  failCast = false;
  await api.stopAllPlayback();
  console.log('PASS unlink failure is reported and Stop can be retried');
}

async function castTests() {
  const events = [], timers = [];
  let finish;
  let extract = () => new Promise(resolve => { finish = resolve; });
  const { CastPlayer } = load('backend/src/CastPlayer.ts', {
    'node:crypto': require('node:crypto'),
    'yt-cast-receiver': { Player: class {}, Constants:{} },
    './ytdlp.js': { extractAudioInfo: () => extract() },
  }, { setTimeout: fn => { timers.push(fn); } });
  const player = new CastPlayer({ ytdlpPath:'unused', wsManager:{ broadcast:(event, data) => events.push({ event, data }) }, dataStore:{ get:async () => null } });
  const result = player.doPlay({ id:'song' }, 0);
  player.clearOnDisconnect();
  finish({ videoId:'song', title:'Song', duration:100 });
  assert.equal(await result, false);
  assert.equal(events.filter(e => e.event === 'track').length, 0);
  assert.equal(player.isCurrentlyPlaying(), false);
  console.log('PASS pending Cast extraction cannot resume after unlink');
  extract = async () => ({ videoId:'song', title:'Song', duration:100 });
  player.activePlayRequest = player.playRequest;
  assert.equal(await player.doPlay({ id:'song' }, 0), true);
  player.clearOnDisconnect();
  timers.forEach(fn => fn());
  assert.equal(events.filter(e => e.event === 'track').length, 0);
  console.log('PASS deferred Cast track broadcast is cancelled after unlink');
}

async function cacheTests() {
  let calls = 0;
  const { loadLyrics, clearLyricsCache } = load('src/services/lyrics.ts', { '@decky/api': { call:async () => { calls++; return { lyrics:'Test' }; } } });
  await loadLyrics('a'); await loadLyrics('a');
  assert.equal(calls, 1);
  for (let i = 0; i < 6; i++) await loadLyrics(String(i));
  await loadLyrics('a');
  assert.equal(calls, 8);
  clearLyricsCache(); await loadLyrics('a');
  assert.equal(calls, 9);
  console.log('PASS lyrics cache reuses requests, is bounded to six tracks and clears on unload');
}

function lyricsTests() {
  let scroll = { scrollTop:0, clientHeight:500, scrollBy(options) { assert.equal(options.behavior, 'smooth'); this.scrollTop += options.top; } };
  let back = 0, refs = 0;
  const jsx = (type, props) => ({ type, props });
  const elements = load('src/components/LyricsPage.tsx', {
    'react/jsx-runtime': { jsx, jsxs:jsx },
    'react': { useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useRef:() => ({ current:refs++ === 0 ? scroll : null }) },
    '@decky/ui': { DialogButton:'button', Focusable:'div', GamepadButton:{ DIR_UP:9, DIR_DOWN:10, BUMPER_LEFT:5, BUMPER_RIGHT:6 }, Navigation:{ NavigateBack() { back++; }, OpenQuickAccessMenu() {} }, QuickAccessTab:{ Decky:1 } },
    'react-icons/fa': { FaArrowLeft:'i', FaChevronUp:'i', FaChevronDown:'i', FaMusic:'i', FaExpand:'i' },
    '../services/audioManager': { getIsCastConnected:()=>false, getCastSenderName:()=>null, addCastConnectionListener:()=>()=>{}, getCurrentTrack:() => ({ videoId:'test', title:'Test', artist:'Artist' }), addTrackChangeListener:() => () => {}, addProgressListener:() => () => {}, getProgress:() => ({ position:0 }) },
    '../theme': { themeCss: '' },
    '../services/lyrics': { loadLyrics:async () => ({ lyrics:'Test' }) },
    '../services/focus': { focusLyricsReader:() => () => {} },
    'react-icons/md':{}, 'react-icons/si': { SiYoutubemusic:'icon' },
    '../services/lyricsScroll': {}, '../services/syncedLyrics': {},
    '../services/notifications': {},
    '../services/i18n': { useI18n:() => ({ t:key => ({'lyrics.region':'Song lyrics','lyrics.loading':'Loading lyrics…','lyrics.title':'Lyrics','lyrics.fullscreen':'Fullscreen','common.retry':'Retry'}[key] || key) }) },
    '../services/artworkPalette': { useArtworkPalette:() => ['180,202,220','72,101,137','43,66,96'] },
    './ArtworkBackdrop': { ArtworkBackdrop:'backdrop' },
    './ThemeScope': { ThemeScope:'theme' },
    './OverflowText': { OverflowText:'overflow-text' },
    '../services/lyricsSource': { lyricsSource:s=>s },
  });
  const root = elements.LyricsPanel({ onBack: () => { back++; } });
  const event = button => ({ detail:{ button }, preventDefault() {}, stopPropagation() {} });
  const walk = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
  const nodes = walk(root);
  const reader = nodes.find(node => node.props['aria-label'] === 'Song lyrics');
  reader.props.onGamepadDirection(event(10)); assert.equal(scroll.scrollTop, 64);
  reader.props.onGamepadDirection(event(9)); assert.equal(scroll.scrollTop, 0);
  root.props.onButtonDown(event(6)); assert.equal(scroll.scrollTop, 0);
  root.props.onButtonDown(event(5)); assert.equal(scroll.scrollTop, 0);
  root.props.onCancelButton(event(2)); assert.equal(back, 1);
  assert.equal(nodes.some(node => node.type === 'button' && JSON.stringify(node.props.children).includes('Page down')), false);
  assert.equal(nodes.some(node => node.props?.style?.textAlign === 'center' && ['L1','R1','Up','Down'].every(label => JSON.stringify(node.props.children).includes(label))), false);
  console.log('PASS compact lyrics controls work without the removed bumper hint');
}

function focusTests() {
  const frames = new Map(); let nextId = 0, nativeCalls = 0, fallbackCalls = 0;
  const view = { requestAnimationFrame(fn) { frames.set(++nextId, fn); return nextId; }, cancelAnimationFrame(id) { frames.delete(id); } };
  const element = { ownerDocument:{ defaultView:view }, isConnected:true, focus() { fallbackCalls++; } };
  let trees = [];
  const { focusLyricsReader } = load('src/services/focus.ts', { '@decky/ui': { getGamepadNavigationTrees:() => trees } });
  const tick = () => { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(); };
  const cancel = focusLyricsReader(element);
  tick(); assert.equal(frames.size, 1, 'wait for native registration');
  trees = [{ Root:{ m_rgChildren:[{ Element:element, BTakeFocus() { nativeCalls++; return true; } }] } }];
  tick(); assert.equal(nativeCalls, 1); assert.equal(frames.size, 0); assert.equal(fallbackCalls, 0);
  cancel();
  const stop = focusLyricsReader(element); stop(); assert.equal(frames.size, 0, 'unmount cancels pending focus');
  trees = []; focusLyricsReader(element);
  for (let i = 0; i < 30; i++) tick();
  assert.equal(frames.size, 0); assert.equal(fallbackCalls, 1, 'fallback is bounded');
  console.log('PASS lyrics native focus waits for registration, stops on success and cleans up on exit');
}

(async () => { await audioTests(); await castTests(); await cacheTests(); lyricsTests(); focusTests(); })().catch(error => { console.error(error); process.exitCode = 1; });

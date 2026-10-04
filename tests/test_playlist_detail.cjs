const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const playlistPageSource = fs.readFileSync('src/components/PlaylistPage.tsx', 'utf8');
assert.match(playlistPageSource, /onCancel=\{cancelBack\}/, 'B/cancel must return from playlist detail');
assert.match(playlistPageSource, /requestLibraryReturn\(\)/, 'return restores Library state');
assert.match(playlistPageSource, /suppressPlaybackNotification\(song\.videoId\)/, 'manual song picks suppress only their playback toast');

function load(file, modules = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, require:name => modules[name] || {}, ...globals });
  return exports;
}

const events = [];
const navigation = load('src/services/playlistNavigation.ts', {}, {
  window:{ dispatchEvent:event => events.push(event.type) }, Event:class { constructor(type) { this.type = type; } }, CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
});
navigation.selectPlaylist({ playlistId:'summer', title:'Summer', count:80, thumbnail:null, libraryScrollTop:420 });
assert.equal(navigation.selectedPlaylist().playlistId, 'summer');
navigation.requestLibraryReturn();
assert.equal(navigation.libraryReturnPending(), true);
assert.equal(events[0], navigation.LIBRARY_RETURN_EVENT);
assert.equal(navigation.consumeLibraryReturn().libraryScrollTop, 420);
assert.equal(navigation.consumeLibraryReturn(), null, 'return position is consumed once');
navigation.selectPlaylist({ playlistId:'winter', title:'Winter', count:12, thumbnail:null, libraryScrollTop:0 });
assert.equal(navigation.libraryReturnPending(), false, 'opening another playlist clears the old return request');
navigation.requestLibraryTabReturn();
assert.equal(navigation.libraryReturnPending(),true,'catalogue return survives a panel remount');
assert.equal(navigation.consumeLibraryReturn(),null,'catalogue return never restores an unrelated playlist');
navigation.consumeLibraryTabReturn();
assert.equal(navigation.libraryReturnPending(),false,'the mounted tab consumes only its catalogue return');

(async () => {
  const calls = [], casts = [], played = [];
  let castConnected = false;
  const actions = load('src/services/playlistActions.ts', {
    '@decky/api':{ call:async (name, ...args) => {
      calls.push([name, ...args]);
      if (name === 'start_playlist') return { videoId:'song', url:'stream', initialIds:['song'] };
      if (name === 'get_playlist_tracks') return { tracks:[{ videoId:'song' }] };
      return { added:3 };
    } },
    './audioManager':{
      getIsCastConnected:()=>castConnected,
      castRequest:async (...args) => { casts.push(args); return { added:1 }; },
      playTrack:async track => played.push(track),
    },
  });
  assert.equal((await actions.performPlaylistAction('summer', 'next')).added, 3);
  assert(calls.some(([name]) => name === 'queue_playlist_next'));
  assert.equal((await actions.performPlaylistAction('summer', 'shuffle')).started, true);
  assert.equal(played.length, 1);
  assert(calls.some(([name, id, shuffle]) => name === 'start_playlist' && id === 'summer' && shuffle === true));
  castConnected = true;
  assert.equal((await actions.performPlaylistAction('summer', 'append')).added, 1);
  assert.equal(casts[0][0], '/api/queue/append');
  assert.equal(casts[0][1].tracks[0].videoId, 'song');
  console.log('PASS playlist navigation restores Library and whole-list actions work locally and through Cast');
})().catch(error => { console.error(error); process.exitCode = 1; });

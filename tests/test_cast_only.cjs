const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
let state = { authenticated:false, authReady:true, track:{ videoId:'cast-song', title:'Song', artist:'Artist' }, castConnected:true, castNetwork:{ trusted:true }, repeat:'NONE' };
let effects = [], calls = [];
const jsx = (type, props) => ({ type, props });
const modules = {
  'react/jsx-runtime': { jsx, jsxs:jsx },
  'react': { useState:value => [typeof value === 'function' ? value() : value, () => {}], useEffect:fn => effects.push(fn), useRef:()=>({current:null}), useMemo:fn=>fn() },
  '@decky/api': { call:async name => { calls.push(name); return { rating:'LIKE', playlists:[] }; } },
  '@decky/ui': { DialogButton:'button', Focusable:'focusable', Navigation:{} },
  '../context/PlayerContext': { usePlayer:() => state },
  '../services/audioManager': {},
  '../services/playlistActions': { performPlaylistAction:async()=>({started:false,added:0,cast:false}) },
  '../services/playlistNavigation': { PLAYLIST_ROUTE:'/youtube-music-playlist', LIBRARY_RETURN_EVENT:'ytm-return-library', selectPlaylist(){}, consumeLibraryReturn:()=>null, libraryReturnPending:()=>false, selectedPlaylist:()=>null },
  './Section': { Section:'section' },
  './MediaRow': { MediaRow:'row', RowAction:'action' },
  './VolumeSlider': { VolumeSlider:'volume', PaddedSlider:'slider' },
  './LyricsPage': { LyricsPanel:'lyrics' },
  '../services/artworkPalette': { useArtworkPalette:() => ['180,202,220','72,101,137','43,66,96'], defaultAccent:'180, 202, 220' },
  '../services/uiPreferences': { getLastCoverAccent:() => '88,68,82' },
  '../services/i18n': { useI18n:() => ({ t:key => ({'player.lyrics':'Lyrics','common.previous':'Previous','player.play':'Play','player.pause':'Pause','common.next':'Next','player.like':'Like','player.dislike':'Dislike'}[key] || key) }) },
  './ArtworkBackdrop': { ArtworkBackdrop:'backdrop' },
  './ThemeScope': { ThemeScope:'theme' },
  './LibraryToolbar':{LibraryToolbar:'library-toolbar'},
  './CatalogList':{CatalogFilters:'filters'},
  './CatalogLibrary':{CatalogLibrary:'catalog-library'},
  '../services/catalog':{},
  '../services/browseState':require('./browse_fixture.cjs'),
  '../services/playlistData':{clearPlaylistData(){}},
  '../services/playlistLibrary':{cachedPlaylistLibrary:()=>undefined,loadPlaylistLibrary:async()=>{calls.push('get_library_playlists');return {playlists:[]};}},
  '../services/searchState':{openSearch(){}},
  './OverflowText': { OverflowText:'overflow-text' },
};
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components', file), 'utf8'), {
    compilerOptions:{ module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX }
  }).outputText, { exports, window:{addEventListener(){},removeEventListener(){}}, require:name => {
    if (name.startsWith('react-icons/')) return new Proxy({}, { get:(_, key) => key });
    assert(name in modules, name); return modules[name];
  } });
  return exports;
}
function flatten(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)];
}
const lyricColor={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/lyricColor.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:lyricColor});modules['../services/lyricColor']=lyricColor;
const { LibraryView } = load('LibraryView.tsx');
const { PlayerView } = load('PlayerView.tsx');
(async () => {
  const guestLibrary = LibraryView({});
  assert.equal(guestLibrary.type, 'div');
  for(const effect of effects)effect();
  assert.deepEqual(calls, [], 'guest library must not fetch account data');
  const guestPlayer = flatten(PlayerView());
  const detailColor=lyricColor.translationColor('72,101,137');
  for(const name of ['ytm-artist-name','ytm-cast-details'])assert.equal(guestPlayer.find(n=>n.props?.className?.includes(name)).props.style.color,detailColor);
  for (const effect of effects) effect();
  assert.deepEqual(calls, [], 'Cast-only player must not request song ratings');
  for (const action of ['Previous', 'Play', 'Next']) {
    assert.equal(guestPlayer.find(n => n.props?.onOKActionDescription === action).props.disabled, false);
  }
  for (const action of ['Like', 'Dislike']) {
    assert.equal(guestPlayer.find(n => n.props?.onOKActionDescription === action).props.disabled, true);
  }
  assert.equal(guestPlayer.find(n => (JSON.stringify(n.props?.children) || '').includes('Lyrics') && typeof n.props?.disabled === 'boolean').props.disabled, true);
  state = { ...state, authenticated:true, authReady:true };
  effects = []; calls = [];
  const accountLibrary = LibraryView({});
  const account = flatten(accountLibrary).find(n => typeof n.type === 'function');
  assert(account);
  account.type({});
  const accountPlayer = flatten(PlayerView());
  for (const effect of effects) effect();
  assert(calls.includes('get_library_playlists'));
  assert(calls.includes('get_song_rating'));
  assert.equal(accountPlayer.find(n => n.props?.onOKActionDescription === 'Like').props.disabled, false);
  console.log('PASS Cast-only access, account isolation, playback controls and sign-in transition');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,modules={},globals={}){
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    exports,require:name=>name==='../services/browseState'?(modules[name]||require('./browse_fixture.cjs')):name==='../services/pagination'?load('src/services/pagination.ts',{react:modules.react,'./focus':modules['../services/focus']||{focusLyricsReader:()=>()=>{}}},globals):name==='../services/lyricColor'?load('src/services/lyricColor.ts'):name==='../services/librarySort'?load('src/services/librarySort.ts',{},globals):modules[name]||{},console,setTimeout,clearTimeout,...globals,
  });
  return exports;
}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const jsx=(type,props)=>({type,props});
const walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];

async function cacheTests(){
  let response=deferred(),calls=[];
  const api={call:async(name,...args)=>{calls.push([name,...args]);return response.promise;}};
  const playlists=load('src/services/playlistData.ts',{'@decky/api':api});
  const a=playlists.loadPlaylistData('playlist',true),b=playlists.loadPlaylistData('playlist',true);
  assert.equal(calls.length,1);
  response.resolve({tracks:[{videoId:'first'}]});await Promise.all([a,b]);
  assert.equal(playlists.cachedPlaylistData('playlist').tracks[0].videoId,'first');
  response=deferred();const full=playlists.loadPlaylistData('playlist');
  response.resolve({tracks:[{videoId:'first'},{videoId:'second'}]});await full;
  assert.equal((await playlists.loadPlaylistData('playlist',true)).tracks.length,2);
  assert.equal(calls.length,2,'preview and complete data are reused immediately');
  response=deferred();const stale=playlists.loadPlaylistData('other');playlists.clearPlaylistData();
  response.resolve({tracks:[{videoId:'private'}]});assert((await stale).error);
  assert.equal(playlists.cachedPlaylistData('other'),undefined,'signout cannot repopulate account cache');

  calls=[];response=deferred();
  const catalog=load('src/services/catalog.ts',{'@decky/api':api});
  const searchA=catalog.searchCatalog('artist','albums'),searchB=catalog.searchCatalog('artist','albums');
  assert.equal(calls.length,1);assert.equal(calls[0][0],'search_catalog');
  response.resolve({entries:[{kind:'album',id:'album',title:'Album'}]});await Promise.all([searchA,searchB]);
  await catalog.searchCatalog('artist','albums');assert.equal(calls.length,1);
  response=deferred();const changed=catalog.loadLibraryCategory('songs');catalog.clearCatalogCache();
  response.resolve({entries:[]});assert((await changed).error);
  console.log('PASS catalogue and playlist caches coalesce reads, render cached data, and reject account races');
}
function readerTests(){
  let reduced=false,now=0,next=0;const frames=new Map();
  const element={scrollTop:0,scrollHeight:2000,clientHeight:500,ownerDocument:{defaultView:{
    requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),
    matchMedia:()=>({matches:reduced}),
  }}};
  const reader=load('src/services/readerScroll.ts').createReaderScroller(element);
  const tick=()=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn(now+=16);};
  reader.scroll(140);reader.scroll(140);
  tick();assert(element.scrollTop>0&&element.scrollTop<280);
  let count=0;while(frames.size&&count++<80)tick();
  assert.equal(element.scrollTop,280,'held stick input accumulates instead of restarting');
  reader.scroll(99999);count=0;while(frames.size&&count++<80)tick();
  assert.equal(element.scrollTop,1500,'scroll clamps to reader bounds');
  reader.scroll(-140);reader.dispose();assert.equal(frames.size,0,'unmount cancels frames');
  reduced=true;reader.scroll(-99999);assert.equal(element.scrollTop,0);assert.equal(frames.size,0);
  console.log('PASS lyric scrolling accelerates repeated input, clamps bounds and respects reduced motion');
}
function lyricPairTests(){
  let index=0,active=0;
  const timed=[{text:'Original first line',start:0,end:2},{text:'Original second line',start:2,end:4}];
  const modules={
    'react/jsx-runtime':{jsx,jsxs:jsx},
    react:{useState:value=>{const slot=index++;return [slot===3?{lyrics:timed.map(x=>x.text).join('\n'),timedLines:timed}:slot===4?['Primera traducción','Segunda traducción']:slot===8?false:slot===10?active:typeof value==='function'?value():value,()=>{}];},useRef:()=>({current:null}),useEffect(){}},
    '@decky/ui':{Focusable:'focusable',DialogButton:'button',Navigation:{},GamepadButton:{}},
    '../services/i18n':{useI18n:()=>({t:key=>key})},
    '../services/artworkPalette':{useArtworkPalette:()=>['100,100,100','90,90,90','80,80,80']},
    '../services/audioManager':{getCurrentTrack:()=>({videoId:'song',title:'Song'}),getIsPlaying:()=>true,getIsCastConnected:()=>false,getCastSenderName:()=>null},
    '../services/lyricsSource':{lyricsSource:()=>''},
  };
  const panel=load('src/components/LyricsPage.tsx',modules).LyricsPanel;
  for(active of [0,1]){
    index=0;
    const pairs=walk(panel({fullScreen:true})).filter(node=>node.props?.className==='ytm-lyric-pair');
    assert.equal(pairs.length,2);
    pairs.forEach((pair,i)=>{
      const contents=JSON.stringify(pair.props.children);
      assert(contents.includes(timed[i].text));assert(contents.includes(i===0?'Primera traducción':'Segunda traducción'));
      assert.equal(pair.props.style.opacity,i===active?1:.30);
      assert.equal(pair.props.style.transform,i===active?'scale(1.08)':'scale(0.9)');
      for(const child of walk(pair).slice(1))assert.equal(child.props?.style?.transform,undefined,'children must share their parent highlight transform');
    });
  }
  console.log('PASS original and translation share exactly one highlight transform and inactive opacity');
}
async function translationRequestTests(){
  let calls=0;const response=deferred();
  const lyrics=load('src/services/lyrics.ts',{'@decky/api':{call:async()=>{calls++;return response.promise;}}});
  const a=lyrics.loadTranslatedLyrics('Original','es'),b=lyrics.loadTranslatedLyrics('Original','es');
  response.resolve({translatedLines:['Traducción'],complete:true});await Promise.all([a,b]);
  assert.equal(calls,1);
  await lyrics.loadTranslatedLyrics('Original','es');assert.equal(calls,1);
  lyrics.clearLyricsCache();await lyrics.loadTranslatedLyrics('Original','es');assert.equal(calls,2);
  console.log('PASS compact and fullscreen translation share requests and cached results');
}
async function initialPlayerTests(){
  let initial,authResponse=Promise.resolve({authenticated:true});
  const state=load('src/context/PlayerContext.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},
    react:{createContext:()=>({Provider:'provider'}),useReducer:(_reducer,value)=>{initial=value;return [value,()=>{}];},useCallback:fn=>fn,useEffect(){}},
    '@decky/api':{call:async name=>name==='get_auth_state'?authResponse:{shuffle:true,repeat:'ALL',volume:.5}},
    '../services/audioManager':{getCurrentTrack:()=>({videoId:'playing',title:'Song'}),getIsPlaying:()=>true,getIsCastConnected:()=>false,getNetworkInfo:()=>({trusted:true}),getCastSenderName:()=>null,getProgress:()=>({position:50,duration:180})},
  });
  state.warmPlayerState();await new Promise(resolve=>setImmediate(resolve));
  state.PlayerProvider({children:null});
  assert.equal(initial.track.videoId,'playing');assert.equal(initial.isPlaying,true);
  assert.equal(initial.authReady,true);assert.equal(initial.authenticated,true);
  assert.equal(initial.position,50);assert.equal(initial.volume,50);assert.equal(initial.shuffle,true);
  const pending=deferred();authResponse=pending.promise;
  state.warmPlayerState();state.rememberAuthState(false);pending.resolve({authenticated:true});
  await new Promise(resolve=>setImmediate(resolve));state.PlayerProvider({children:null});
  assert.equal(initial.authenticated,false,'a late startup read must not reverse signout');
  console.log('PASS first player render restores audio, prepared account/preferences and rejects stale auth');
}
function catalogueNavigationTests(){
  const pages=[],focusRequests=[],scroll={scrollTop:400,closest:()=>null},timers=[],events=[];
  let slot=0,origin='library',backs=0,opens=0;
  const entries=Array.from({length:85},(_,i)=>({kind:'song',id:String(i),title:'Song'}));
  const module=load('src/components/CatalogPage.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},
    react:{useState:value=>{const index=slot++;return [typeof value==='function'?value():value,next=>{const output=typeof next==='function'?next(0):next;if(index===6)pages.push(output);if(index===7)focusRequests.push(output);}];},useEffect(){},useRef:value=>({current:value===null?scroll:value})},
    '@decky/ui':{Focusable:'focusable',DialogButton:'button',useParams:()=>({key:'1'}),GamepadButton:{TRIGGER_LEFT:7,TRIGGER_RIGHT:8},Navigation:{NavigateBack:()=>backs++,OpenQuickAccessMenu:()=>opens++},QuickAccessTab:{Decky:1}},
    '../services/catalog':{selectedCatalog:()=>({entry:{kind:'album',id:'album',title:'Album'},origin}),cachedCatalog:()=>({entries}),detailKey:()=>''},
    '../services/i18n':{useI18n:()=>({t:key=>key})},
    '../services/artworkPalette':{useArtworkAccent:()=> '100,100,100'},
    '../services/browseNavigation':{setBrowseDepth(){}},
    '../services/playlistNavigation':{requestLibraryTabReturn:()=>events.push({detail:{preserveCategory:true}})},
  },{window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},setTimeout:fn=>timers.push(fn)});
  const event=button=>({detail:{button},preventDefault(){this.prevented=true;},stopPropagation(){}});
  const render=()=>{const page=module.CatalogPage();return page.type(page.props);};
  slot=0;const root=render(),next=event(8);
  root.props.onButtonDown(next);
  assert.equal(next.prevented,true);assert.deepEqual(pages,[1]);assert.deepEqual(focusRequests,[1]);assert.equal(scroll.scrollTop,0);
  root.props.onCancelButton(event(2));root.props.onCancelButton(event(2));
  assert.equal(backs,1,'B returns exactly once');timers.shift()();
  assert.equal(opens,1);assert.equal(events[0].detail.preserveCategory,true,'returning from album keeps the Library filter');
  origin='route';slot=0;render().props.onCancelButton(event(2));
  assert.equal(backs,2);assert.equal(timers.length,0,'nested artist/album navigation returns to its parent route');
  console.log('PASS catalogue triggers reset scroll/focus and B restores the correct parent and Library filter');
}
(async()=>{await cacheTests();readerTests();lyricPairTests();await translationRequestTests();await initialPlayerTests();catalogueNavigationTests();})().catch(error=>{console.error(error);process.exitCode=1;});

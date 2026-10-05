const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,modules={},globals={}){
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='../services/browseState'?(modules[name]||require('./browse_fixture.cjs')):name==='../services/pagination'?load('src/services/pagination.ts',{react:modules.react,'./focus':modules['../services/focus']||{focusLyricsReader:()=>()=>{}}},globals):modules[name]||{},console,...globals});
  return exports;
}
const jsx=(type,props)=>({type,props}),walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
function navigationTests(){
  const events=[],timers=[];let backs=0,opens=0;
  const state=load('src/services/playlistNavigation.ts',{}, {window:{dispatchEvent:event=>events.push(event)},Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
  const browse=load('src/services/browseNavigation.ts',{
    '@decky/ui':{Navigation:{NavigateBack:()=>backs++,OpenQuickAccessMenu:()=>opens++},QuickAccessTab:{Decky:999}},'./playlistNavigation':state,
  },{setTimeout:fn=>timers.push(fn)});
  state.requestLibraryReturn();browse.setBrowseDepth(2);
  assert.equal(browse.nextBrowseDepth('route'),3);assert.equal(browse.nextBrowseDepth('library'),1);
  browse.returnBrowseToPlayer(3);browse.returnBrowseToPlayer(3);
  assert.equal(backs,1);assert.equal(opens,0);assert.equal(state.libraryReturnPending(),false);
  assert.equal(state.consumePlayerReturn(),true,'Player intent survives a QAM remount');
  timers.shift()();assert.equal(backs,2);assert.equal(opens,0);
  timers.shift()();assert.equal(backs,3);timers.shift()();
  assert.equal(opens,1,'nested pages finish closing before QAM opens');
  assert.equal(state.consumePlayerReturn(),true,'intent is repeated after asynchronous navigation');
  assert.equal(state.consumePlayerReturn(),false);
  state.requestPlayerReturn();
  browse.setBrowseDepth(1);browse.returnBrowseToLibrary();browse.returnBrowseToLibrary();
  assert.equal(backs,4,'Search B closes one route even when delivered twice');
  assert.equal(opens,1,'Library QAM reopens only after the route closes');
  assert.equal(state.consumePlayerReturn(),false,'returning to Library clears an old Player intent');
  assert.equal(state.libraryReturnPending(),true);
  assert.equal(events.at(-1).detail.preserveCategory,true,'Search B keeps the category that launched it');
  timers.shift()();assert.equal(opens,2);assert.equal(state.libraryReturnPending(),true,'Library intent survives QAM remount');
  console.log('PASS nested playback unwinds only plugin pages and restores Player across remounts');
}
async function actionTests(){
  for(const component of ['CatalogPage','PlaylistPage'])for(const mode of ['play','next','append']){
    const returned=[],queued=[],actions=[];
    const track={videoId:'song',title:'Song',url:'https://audio.test/song'};
    const modules={
      'react/jsx-runtime':{jsx,jsxs:jsx},react:{useState:value=>[typeof value==='function'?value():value,next=>queued.push(next)],useRef:value=>({current:value}),useEffect(){}},
      '@decky/api':{call:async(method)=>{actions.push(method);return {...track,success:true};}},
      '@decky/ui':{Focusable:'root',DialogButton:'button',Navigation:{},GamepadButton:{},useParams:()=>({key:'album'})},
      '../services/browseNavigation':{returnBrowseToPlayer:depth=>returned.push(depth)},
      '../services/i18n':{useI18n:()=>({t:key=>key})},'../services/artworkPalette':{useArtworkAccent:()=> '80,100,120'},
      '../services/catalog':{selectedCatalog:()=>({entry:{kind:'album',id:'album'},origin:'route',returnDepth:3}),cachedCatalog:()=>({entries:[{kind:'song',id:'song',track}]}),detailKey:()=>'',actCatalogSong:async(_,mode)=>actions.push(mode)},
      '../services/playlistNavigation':{selectedPlaylist:()=>({playlistId:'playlist',title:'Playlist',returnDepth:3})},
      '../services/playlistData':{cachedPlaylistData:()=>({tracks:[track]})},
      '../services/audioManager':{getIsCastConnected:()=>false,playTrack:async()=>actions.push('started')},
      '../services/notifications':{suppressPlaybackNotification(){}},
      './CatalogList':{CatalogList:'catalog-list'},'./MediaRow':{MediaRow:'song-row',RowAction:'row-action'},
    };
    const api=load(`src/components/${component}.tsx`,modules);
    let tree=api[component]();if(component==='CatalogPage')tree=tree.type(tree.props);
    if(component==='CatalogPage')await walk(tree).find(node=>node.type==='catalog-list').props.onSong({kind:'song',id:'song',track},mode);
    else{
      const row=walk(tree).find(node=>node.type==='song-row');
      if(mode==='play')await row.props.onPlay();
      else await walk(row.props.actions).filter(node=>node.type==='row-action')[mode==='next'?0:1].props.onClick();
    }
    // JSX callbacks intentionally launch asynchronous actions without blocking input.
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(returned,mode==='play'?[3]:[],`${component}: only playback closes the page`);
    assert(actions.length>0);
  }
  console.log('PASS playlist and album song actions close on Play and remain open on Play next/Add to queue');
}
function toolbarAndSortTests(){
  const storage=new Map(),globals={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
  const sort=load('src/services/librarySort.ts',{},globals);
  const items=[{title:'Zebra',id:'z'},{title:'Album 10',id:'10'},{title:'album 2',id:'2'}];
  assert.deepEqual(Array.from(sort.sortCatalog(items,1),x=>x.id),['2','10','z']);
  assert.deepEqual(Array.from(sort.sortCatalog(items,2),x=>x.id),['z','10','2']);
  assert.deepEqual(items.map(x=>x.id),['z','10','2'],'alphabetical sorting never mutates cached source order');
  sort.saveCatalogSort('albums',2);assert.equal(sort.savedCatalogSort('albums'),2);assert.equal(sort.savedCatalogSort('artists'),0);
  storage.set('ytm-library-sort-songs','3');assert.equal(sort.savedCatalogSort('songs'),0,'custom order is playlist-only');
  const toolbar=load('src/components/LibraryToolbar.tsx',{react:{useState:value=>[value,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx},'@decky/ui':{Focusable:'focusable'},'./CatalogList':{CatalogFilters:'filter'},'./MediaRow':{RowAction:'action'},'../services/i18n':{useI18n:()=>({t:key=>key})}});
  for(const category of ['playlists','albums','songs','artists']){
    const called=[];
    const tree=toolbar.LibraryToolbar({category,sort:1,onSort:()=>called.push('sort'),onRefresh:()=>called.push('refresh')});
    const bar=walk(tree).find(node=>node.props?.className==='ytm-library-toolbar');
    assert.equal(walk(bar).find(node=>node.type==='filter').props.value,category);
    const buttons=walk(bar).filter(node=>node.type==='action');assert.equal(buttons.length,2);
    buttons.forEach(node=>node.props.onClick());assert.deepEqual(called,['sort','refresh']);
    assert(JSON.stringify(tree).includes(`library.${category}Title`));
  }
  const color=load('src/services/lyricColor.ts');
  assert.equal(color.translationColor('255,0,0'),'rgb(239, 179, 179)');
  assert.equal(color.translationColor('0,0,255'),'rgb(179, 179, 239)');
  assert.equal(color.translationColor('0,0,0'),'rgb(209, 209, 209)');
  assert.equal(color.translationColor('255,255,255'),'rgb(209, 209, 209)','monochrome covers remain neutral and distinct from original white');
  assert.equal(color.translationColor('invalid'),'rgb(198, 210, 223)');
  console.log('PASS shared Library tools, independent natural sort, immutable caches and legible cover pastels that retain hue without becoming white');
}
function sortFocusTests(){
  let focus=0,mode=0;
  const toolbar=load('src/components/LibraryToolbar.tsx',{
    react:{useState:()=>[focus,next=>focus=next(focus)]},'react/jsx-runtime':{jsx,jsxs:jsx},'@decky/ui':{Focusable:'focusable'},
    './CatalogList':{CatalogFilters:'filter'},'./MediaRow':{RowAction:'action'},'../services/i18n':{useI18n:()=>({t:key=>key})},
  });
  const button=()=>walk(toolbar.LibraryToolbar({category:'playlists',sort:mode,onSort:()=>mode=(mode+1)%4,onRefresh(){}})).find(node=>node.type==='action');
  for(let count=1;count<=5;count++){
    button().props.onClick();
    assert.equal(button().props.focusRequest,count,'each sort action requests focus back on the same Sort control');
    assert.equal(mode,count%4);
  }
  console.log('PASS repeated Sort actions retain the cursor while cycling all ordering options');
}
function translationIconTests(){
  let enabled=true,stateIndex=0,timed=true,loading=false,inLyrics=true;
  const react={useState:value=>{
    const slot=stateIndex++;
    if(!inLyrics)return [typeof value==='function'?value():value,()=>{}];
    const result={lyrics:'Original verse',timedLines:timed?[{text:'Original verse',startMs:0}]:undefined};
    return [slot===3?result:slot===4?['Verso traducido']:slot===6?loading:slot===8?false:slot===10?0:typeof value==='function'?value():value,()=>{}];
  },useRef:value=>({current:value}),useEffect(){}};
  const modules={
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'@decky/ui':{Focusable:'focusable',DialogButton:'button',SidebarNavigation:'sidebar'},
    'react-icons/md':{MdTranslate:'translation-svg',MdCastConnected:'cast-svg'},
    '../services/i18n':{useI18n:()=>({t:key=>key,language:'en',translateLyrics:enabled}),languageOptions:[{id:'en',name:'English'}]},
    '../services/audioManager':{getCurrentTrack:()=>({videoId:'song',title:'Song',artist:'Artist'}),getIsPlaying:()=>true,getIsCastConnected:()=>true,getCastSenderName:()=> 'Phone'},
    '../services/artworkPalette':{useArtworkPalette:()=>['220,60,70','40,90,180','50,60,70']},'../services/lyricsSource':{lyricsSource:()=> 'TestSource'},
    '../services/lyricColor':load('src/services/lyricColor.ts'),
  };
  const panel=load('src/components/LyricsPage.tsx',modules).LyricsPanel;
  for(enabled of [true,false])for(const fullScreen of [true,false])for(timed of [true,false])for(loading of [true,false]){
    stateIndex=0;
    const tree=panel({fullScreen});
    const detailColor=modules['../services/lyricColor'].translationColor('40,90,180');
    assert.equal(walk(tree).find(node=>node.props?.className?.includes('ytm-artist-name')).props.style.color,detailColor);
    if(fullScreen)assert.equal(walk(tree).find(node=>node.props?.className?.includes('ytm-cast-details')).props.style.color,detailColor);
    const icons=walk(tree).filter(node=>node.type==='translation-svg');
    assert.equal(icons.length,enabled?1:0,'lyric badge follows the setting, independently of translation loading');
    if(enabled){
      const cover=walk(tree).find(node=>node.props?.className==='ytm-cover-column');
      const children=[cover.props.children].flat(Infinity).filter(Boolean);
      const sourceIndex=children.findIndex(node=>node.props?.className==='ytm-lyrics-source');
      const status=children[sourceIndex+1];
      assert.equal(status.props.className,'ytm-translation-status','translation status belongs directly below Source');
      assert.equal(walk(status).filter(node=>node.type==='translation-svg').length,1,'the only translation badge is beneath Source, never beside the YouTube logo');
      const indicator=walk(status).find(node=>node.props?.role==='img');
      assert.equal(indicator.props['aria-label'],'language.translate');
      const color=modules['../services/lyricColor'].translationColor('40,90,180');
      assert.equal(indicator.props.style.color,color,'badge uses a light secondary cover color');
      assert.notEqual(color,'rgb(220,60,70)','YouTube Music retains the primary cover color');
      assert.equal(walk(status).filter(node=>node.props?.role==='status').length,loading?1:0,'loading text shares the badge location');
      const translation=walk(tree).find(node=>node.props?.className==='ytm-translation-reveal');
      const translationParent=walk(tree).find(node=>node.props?.children===translation);
      assert.equal(translationParent.props.style.color,color,'timed and plain translated lyrics match the badge exactly');
      assert.equal(walk(tree).filter(node=>node.props?.children==='lyrics.translating').length,loading?1:0);
    }
  }
  stateIndex=0;inLyrics=false;
  const settings=load('src/components/SettingsPage.tsx',modules).SettingsPage();
  const language=settings.props.pages.find(page=>page.route.endsWith('/language')).content;
  const toggle=walk(language.type(language.props)).find(node=>node.props?.label==='language.translate');
  assert.equal(toggle.props.icon.type,'translation-svg','Settings uses the same SVG as both lyric views');
  console.log('PASS translation SVG is shared with Settings, accessible, placed below Source and color-matched to timed and plain translations in both readers');
  const dictionary=load('src/services/i18n.ts',{}, {localStorage:{getItem:()=> 'en'},navigator:{language:'en'}});
  for(const category of ['playlists','albums','songs','artists'])assert.equal(dictionary.translate(`library.${category}Title`),`Your saved ${category}`);
  console.log('PASS saved-library headings identify the user collection explicitly');
}
(async()=>{navigationTests();await actionTests();toolbarAndSortTests();sortFocusTests();translationIconTests();})().catch(error=>{console.error(error);process.exitCode=1;});

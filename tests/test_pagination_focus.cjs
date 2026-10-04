const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const jsx=(type,props,key)=>({type,props,key}),walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
function load(file,modules={}){
  const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='../services/browseState'?(modules[name]||require('./browse_fixture.cjs')):name==='../services/pagination'?load('src/services/pagination.ts',{react:modules.react,'./focus':modules['../services/focus']||{focusLyricsReader:()=>()=>{}}}):modules[name]||{},console,setTimeout,clearTimeout});return exports;
}
function harness(modules={}){
  const slots=[],focused=[],scroll={scrollTop:500};let cursor=0,dirty=true,queued=[],renderFn,tree;
  const react={
    useState:initial=>{const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const value=typeof next==='function'?next(slots[i].value):next;if(value!==slots[i].value){slots[i].value=value;dirty=true;}}];},
    useRef:initial=>{const i=cursor++;slots[i]??={current:initial};return slots[i];},
    useEffect:(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){slots[i]={deps,cleanup:old?.cleanup};queued.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},
    useMemo:(fn,deps)=>{const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>v!==old.deps[n]))slots[i]={deps,value:fn()};return slots[i].value;},
  };
  const all={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@decky/ui':{Focusable:'focusable',DialogButton:'button',TextField:'input',Navigation:{},GamepadButton:{TRIGGER_LEFT:7,TRIGGER_RIGHT:8},useParams:()=>({key:'artist'})},
    '../services/i18n':{useI18n:()=>({t:key=>key})},'../services/artworkPalette':{useArtworkAccent:()=> '100,100,100'},
    '../services/focus':{focusLyricsReader:node=>{assert(node,'focus must target a mounted button');focused.push(node);return()=>{};}},
    './CatalogList':{CatalogList:'list',CatalogFilters:'filters'},'./LibraryToolbar':{LibraryToolbar:'toolbar'},'./MediaRow':{MediaRow:'row',RowAction:'action'},...modules};
  return{focused,scroll,load:file=>load(file,all),setRender:fn=>renderFn=fn,get tree(){return tree;},async pump(){for(let n=0;n<12;n++){while(dirty){dirty=false;cursor=0;tree=renderFn();for(const node of walk(tree))if(node.props?.ref){node.props.ref.current??={scrollTop:500,closest:()=>scroll};node.props.ref.current.label=node.props.children;}const batch=queued;queued=[];batch.forEach(fn=>fn());}await new Promise(resolve=>setImmediate(resolve));}},dispose(){slots.forEach(slot=>slot.cleanup?.());}};
}
const entries=Array.from({length:90},(_,i)=>({kind:'song',id:String(i),title:'Song '+i,track:{videoId:String(i)}}));
const tracks=entries.map(e=>({videoId:e.id,title:e.title}));
const buttons=(tree,name)=>walk(tree).filter(n=>n.type==='button'&&n.props.children==='common.'+name);
const firstFocus=tree=>walk(tree).find(n=>n.type==='list'||n.type==='row'&&n.props.title!=='library.search').props.focusRequest;
const trigger=(tree,button)=>tree.props.onButtonDown({detail:{button,is_repeat:false},preventDefault(){},stopPropagation(){}});
async function pagingTests(){
  for(const kind of ['CatalogLibrary','CatalogPage','PlaylistPage','QueueView']){
    const cache={entries,hasMore:false,limit:200},playlist={playlistId:'playlist',title:'Playlist',count:90};
    const view=harness({'../services/catalog':{cachedLibraryCategory:()=>cache,loadLibraryCategory:async()=>cache,sortCatalog:items=>items,
      selectedCatalog:()=>({entry:{kind:'artist',id:'artist',title:'Artist'}}),cachedCatalog:()=>cache,detailKey:()=>'',loadCatalogDetail:async()=>cache},
      '../services/librarySort':{savedCatalogSort:()=>0,sortCatalog:items=>items},
      '../services/playlistData':{cachedPlaylistData:()=>({tracks,complete:true}),loadPlaylistData:async()=>({tracks,complete:true})},
      '../services/playlistNavigation':{selectedPlaylist:()=>playlist},
      '../services/browseNavigation':{setBrowseDepth(){}},
      '../context/PlayerContext':{usePlayer:()=>({castConnected:true})},
      '../services/audioManager':{getQueue:()=>({tracks,position:0}),getIsCastConnected:()=>true,castRequest:async()=>({}),
        addQueueListener:()=>()=>{},addTrackChangeListener:()=>()=>{},addCastConnectionListener:()=>()=>{}},
    });
    const module=view.load('src/components/'+kind+'.tsx');
    view.setRender(()=>kind==='CatalogPage'?(()=>{const item=module.CatalogPage();return item.type(item.props);})():kind==='CatalogLibrary'?module.CatalogLibrary({category:'songs'}):module[kind]());await view.pump();
    const before=firstFocus(view.tree);
    const next=buttons(view.tree,'next');assert(next.length);
    // Use the bottom control when present, as in the reported failure.
    next.at(-1).props.onClick();await view.pump();
    const top=buttons(view.tree,'next')[0];assert.equal(view.focused.at(-1),top.props.ref.current,kind+' focuses upper Next');
    assert.equal(firstFocus(view.tree),0,kind+' never competes with a first-row focus request');
    const reader=walk(view.tree).find(n=>n.props?.className==='ytm-playlist-tracks');
    if(reader)assert.equal(reader.props.ref.current.scrollTop,0);else assert.equal(view.scroll.scrollTop,0);
    buttons(view.tree,'next')[0].props.onClick();await view.pump();
    assert.equal(buttons(view.tree,'next')[0].props['aria-disabled'],true);
    assert.equal(buttons(view.tree,'next')[0].props.disabled,false,'last-page control stays focusable');
    assert.equal(buttons(view.tree,'next').length,2,'Queue also has bottom page controls');
    const container=walk(view.tree).find(n=>['ytm-playlist-tracks','ytm-search-results'].includes(n.props?.className));
    if(container)assert.equal(container.type,'div','scroll container must not remember the bottom control as its preferred navigation child');
    const count=view.focused.length;buttons(view.tree,'next')[0].props.onClick();await view.pump();assert.equal(view.focused.length,count,'end-of-list Next is a no-op');
    trigger(view.tree,7);await view.pump();assert(firstFocus(view.tree)>before,'triggers retain first-row focus');
    buttons(view.tree,'previous').at(-1).props.onClick();await view.pump();
    assert.equal(view.focused.at(-1),buttons(view.tree,'previous')[0].props.ref.current,'bottom Previous returns to upper Previous');
    assert.equal(firstFocus(view.tree),0);assert.equal(buttons(view.tree,'previous')[0].props['aria-disabled'],true,'first-page Previous retains focus');
    view.dispose();
  }
  console.log('PASS bottom/top Next focus and scroll in Library, playlist, artist/album detail and Queue, including last page and triggers');
}
async function searchTests(){
  const navigation=[],state=load('src/services/searchState.ts',{'@decky/ui':{Navigation:{CloseSideMenus(){},Navigate:route=>navigation.push(route)}}});
  for(const category of ['artists','albums','songs','playlists']){
    state.clearSearchState();state.openSearch(category);
    assert.equal(state.getSearchState().filter,category);
  }
  state.clearSearchState();state.openSearch('artists');
  const requests=[],backs=[],view=harness({'../services/searchState':state,'../services/browseNavigation':{setBrowseDepth(){},returnBrowseToLibrary:depth=>backs.push(depth)},
    '../services/catalog':{searchCatalog:async(query,filter)=>{requests.push([query,filter]);return{entries};}}});
  const search=view.load('src/components/SearchPage.tsx');view.setRender(()=>search.SearchPage());await view.pump();
  assert.equal(walk(view.tree).find(n=>n.type==='filters').props.value,'artists');
  assert.equal(walk(view.tree).find(n=>n.type==='filters').props.focusRequest,undefined,'selection never steals focus from the input');
  assert.equal(walk(view.tree).find(n=>n.type==='input').props.focusOnMount,true,'Search opens ready to type');
  walk(view.tree).find(n=>n.type==='input').props.onChange({target:{value:'artist name'}});await view.pump();
  walk(view.tree).find(n=>n.type==='input').props.onKeyDown({key:'Enter',preventDefault(){}});await view.pump();
  assert.deepEqual(requests,[['artist name','artists']]);
  buttons(view.tree,'next').at(-1).props.onClick();await view.pump();
  assert.equal(view.focused.at(-1),buttons(view.tree,'next')[0].props.ref.current);
  assert.equal(walk(view.tree).find(n=>n.props?.className==='ytm-search-results').props.ref.current.scrollTop,0);
  assert.equal(walk(view.tree).find(n=>n.type==='list').props.entries[0].id,'40');
  const cancelEvent=()=>({prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});
  const event=cancelEvent();view.tree.props.onCancelButton(event);view.tree.props.onCancel(cancelEvent());
  assert(event.prevented&&event.stopped);assert.deepEqual(backs,[1],'B unwinds exactly once and requests the plugin Library tab');view.dispose();
  state.openSearch('albums');assert.equal(state.getSearchState().filter,'artists');assert.equal(state.getSearchState().query,'artist name');assert.equal(state.getSearchState().page,1);
  const reopen=harness({'../services/searchState':state,'../services/browseNavigation':{setBrowseDepth(){}}});
  const reloaded=reopen.load('src/components/SearchPage.tsx');reopen.setRender(()=>reloaded.SearchPage());await reopen.pump();
  assert.equal(walk(reopen.tree).find(n=>n.type==='list').props.entries[0].id,'40');assert.equal(walk(reopen.tree).find(n=>n.type==='input').props.focusOnMount,true);reopen.dispose();
  // Verify the actual category strip targets the chosen category, not Songs.
  const strip=harness();const filters=strip.load('src/components/CatalogList.tsx');strip.setRender(()=>filters.CatalogFilters({value:'artists',onChange(){},focusRequest:1}));await strip.pump();
  const selected=walk(strip.tree).find(n=>n.type==='button'&&n.props['aria-pressed']);assert.equal(strip.focused.at(-1),selected.props.ref.current);strip.dispose();
  console.log('PASS Search inherits categories, focuses the input, preserves results/page and B returns to plugin Library exactly once');
}
function renamedScrollTest(){
  let fallback=0;
  const view={getComputedStyle:element=>({overflowY:element.overflow})};
  const scroller={scrollTop:600,overflow:'auto',parentElement:null};
  const root={scrollTop:0,overflow:'visible',parentElement:scroller,ownerDocument:{defaultView:view},closest:()=>{fallback++;throw Error('Private Steam class must not be required');}};
  const api=load('src/services/pagination.ts');api.resetPaginationScroll(root);assert.equal(scroller.scrollTop,0);assert.equal(fallback,0);
  console.log('PASS pagination resets a renamed Steam scroll container using computed overflow');
}
(async()=>{await pagingTests();await searchTests();renamedScrollTest();})().catch(error=>{console.error(error);process.exitCode=1;});

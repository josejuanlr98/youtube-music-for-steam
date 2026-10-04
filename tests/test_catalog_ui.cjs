const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,modules={},globals={}){
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='../services/browseState'?(modules[name]||require('./browse_fixture.cjs')):name==='../services/pagination'?load('src/services/pagination.ts',{react:modules.react,'./focus':modules['../services/focus']||{focusLyricsReader:()=>()=>{}}},globals):name==='../services/lyricColor'?load('src/services/lyricColor.ts'):name==='../services/librarySort'?load('src/services/librarySort.ts',{},globals):modules[name]||{},console,setTimeout,clearTimeout,...globals});
  return exports;
}
const jsx=(type,props,key)=>({type,props,key});
const walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const entries=(count)=>Array.from({length:count},(_,i)=>({kind:'song',id:String(i),title:'Song '+i}));
async function collectionTests(){
  const calls=[],actions=[];
  const service=load('src/services/catalog.ts',{
    '@decky/api':{call:async(name,...args)=>{calls.push([name,...args]);return{playlistId:'PLartist',entries:[]};}},
    './playlistActions':{performPlaylistAction:async(id,mode)=>{actions.push([id,mode]);return{started:mode==='play'||mode==='shuffle'};}},
  });
  await service.actCatalogCollection({kind:'album',id:'album',playlistId:'PLalbum'},'shuffle');
  assert.equal(calls.length,0,'library album pointer avoids detail request');
  await service.actCatalogCollection({kind:'artist',id:'artist'},'play');
  await service.actCatalogCollection({kind:'artist',id:'artist'},'append');
  await service.actCatalogCollection({kind:'playlist',id:'playlist'},'next');
  assert.equal(calls.length,1,'artist collection metadata is shared and reused');
  assert.deepEqual(actions,[['PLalbum','shuffle'],['PLartist','play'],['PLartist','append'],['playlist','next']]);
  assert.deepEqual(calls[0],['get_catalog_detail','artist','artist','all']);
  console.log('PASS collection actions share the playlist pipeline and resolve cached artist metadata');
}
function rowsAndFiltersTests(){
  const modules={
    'react/jsx-runtime':{jsx,jsxs:jsx},react:{useState:value=>[value,()=>{}],useRef:initial=>({current:initial}),useEffect(){}},
    '@decky/ui':{Focusable:'focusable',DialogButton:'button'},
    './MediaRow':{MediaRow:'row',RowAction:'action'},
    '../services/i18n':{useI18n:()=>({t:key=>key})},
  };
  const components=load('src/components/CatalogList.tsx',modules),actions=[];
  const list=components.CatalogList({entries:[{kind:'album',id:'album'},{kind:'artist',id:'artist'},{kind:'playlist',id:'playlist'}],onOpen:()=>{},onSong:()=>{},onCollection:(item,mode)=>actions.push([item.id,mode])});
  const rows=walk(list).filter(node=>node.type==='row');
  assert.equal(rows.length,3);
  for(const row of rows){
    const buttons=walk(row.props.actions).filter(node=>node.type==='action');
    assert.equal(buttons.length,2);
    buttons.forEach(button=>button.props.onClick());
  }
  assert.deepEqual(actions,[['album','play'],['album','shuffle'],['artist','play'],['artist','shuffle'],['playlist','play'],['playlist','shuffle']]);
  assert.equal(rows[1].props.imageFit,'contain');
  const filters=walk(components.CatalogFilters({value:'songs',onChange:()=>{},artist:true})).filter(node=>node.type==='button');
  assert.deepEqual(filters.map(node=>node.props.children),['catalog.songs','catalog.albums','catalog.singles','catalog.relatedArtists']);
  const search=walk(components.CatalogFilters({value:'songs',onChange:()=>{}})).filter(node=>node.type==='button');
  assert(!search.some(node=>node.props.children==='catalog.all'));
  console.log('PASS album/artist/playlist row actions, square framing and explicit filters');
}
function artistPageTests(){
  let key='first',slots=[];
  const module=load('src/components/CatalogPage.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},
    react:{useState:value=>{const initial=typeof value==='function'?value():value;slots.push(initial);return[initial,()=>{}];},useRef:value=>({current:value}),useEffect(){}},
    '@decky/ui':{Focusable:'focusable',DialogButton:'button',useParams:()=>({key}),Navigation:{},GamepadButton:{}},
    '../services/catalog':{selectedCatalog:()=>({entry:{kind:'artist',id:key,title:key,image:'square-thumbnail'}}),cachedCatalog:()=>({image:'wide-banner',entries:[],playlistId:'PLartist'}),detailKey:()=>''},
    '../services/artworkPalette':{useArtworkAccent:()=> '100,100,100'},
    '../services/i18n':{useI18n:()=>({t:key=>key})},
  });
  const first=module.CatalogPage();
  const tree=first.type(first.props);
  assert.equal(walk(tree).find(node=>node.props?.artist).props.value,'songs');
  assert.equal(walk(tree).find(node=>node.type==='img').props.src,'square-thumbnail','artist hero keeps thumbnail rather than swapping to wide banner');
  const controls=walk(tree).find(node=>node.props?.className==='ytm-playlist-actions');
  assert.equal(walk(controls).filter(node=>node.type==='button').length,4);
  key='second';const second=module.CatalogPage();
  assert.notEqual(second.key,first.key,'each opened artist remounts with its own Songs filter and focus');
  slots=[];assert.equal(walk(second.type(second.props)).find(node=>node.props?.artist).props.value,'songs');
  console.log('PASS artist opening resets Songs and keeps image framing and all four hero actions');
}
function hooks(){
  const slots=[];let cursor=0,dirty=true,queued=[],tree,renderFn;
  const react={
    useState:initial=>{const index=cursor++;slots[index]??={value:typeof initial==='function'?initial():initial};return[slots[index].value,next=>{const value=typeof next==='function'?next(slots[index].value):next;if(value!==slots[index].value){slots[index].value=value;dirty=true;}}];},
    useRef:initial=>{const index=cursor++;slots[index]??={current:initial};return slots[index];},
    useEffect:(fn,deps)=>{const index=cursor++,previous=slots[index];if(!previous||!deps||deps.some((v,i)=>v!==previous.deps[i])){slots[index]={deps,cleanup:previous?.cleanup};queued.push(()=>{slots[index].cleanup?.();slots[index].cleanup=fn();});}},
    useMemo:(fn,deps)=>{const index=cursor++,previous=slots[index];if(!previous||deps.some((v,i)=>v!==previous.deps[i]))slots[index]={deps,value:fn()};return slots[index].value;},
  };
  return{react,setRender:fn=>renderFn=fn,get tree(){return tree;},async pump(){for(let i=0;i<15;i++){while(dirty){dirty=false;cursor=0;tree=renderFn();for(const node of walk(tree))if(node.props?.ref&&node.type==='focusable')node.props.ref.current={closest:()=>scroll};const batch=queued;queued=[];batch.forEach(fn=>fn());}await new Promise(resolve=>setImmediate(resolve));}},dispose(){slots.forEach(slot=>slot.cleanup?.());}};
}
const scroll={scrollTop:400};
async function progressiveTests(){
  const view=hooks(),preview=deferred(),expanded=deferred(),more=deferred(),requests=[];
  let cached;
  const module=load('src/components/CatalogLibrary.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},react:view.react,
    '@decky/ui':{Focusable:'focusable',DialogButton:'button',GamepadButton:{TRIGGER_LEFT:7,TRIGGER_RIGHT:8},Navigation:{}},
    './CatalogList':{CatalogList:'list'},'./MediaRow':{MediaRow:'row'},
    '../services/focus':{focusLyricsReader:()=>()=>{}},
    '../services/i18n':{useI18n:()=>({t:key=>key})},
    '../services/catalog':{cachedLibraryCategory:()=>cached,loadLibraryCategory:async(category,limit)=>{requests.push(limit);const value=await (limit===0?preview:limit===200?expanded:more).promise;cached=value;return value;}},
  });
  view.setRender(()=>module.CatalogLibrary({category:'songs'}));await view.pump();
  assert.deepEqual(requests,[0]);
  preview.resolve({entries:entries(25),limit:0,hasMore:true});await view.pump();
  const list=()=>walk(view.tree).find(node=>node.type==='list');
  const next=()=>walk(view.tree).find(node=>node.type==='button'&&node.props.children==='common.next');
  assert.equal(list().props.entries.length,25,'first songs render while rest is still loading');
  assert.deepEqual(requests,[0,200]);
  const before=list().props.focusRequest;
  next().props.onClick();await view.pump();
  assert.equal(list().props.focusRequest,before,'pending Next never focuses the old first song');
  expanded.resolve({entries:entries(200),limit:200,hasMore:true});await view.pump();
  assert.equal(list().props.entries[0].id,'40');assert.equal(scroll.scrollTop,0);
  assert.equal(list().props.focusRequest,0,'Next preserves button focus rather than focusing a song');
  for(let i=0;i<3;i++){next().props.onClick();await view.pump();}
  assert.equal(list().props.entries[0].id,'160');
  scroll.scrollTop=400;next().props.onClick();await view.pump();
  assert.deepEqual(requests,[0,200,400]);
  more.resolve({entries:entries(230),limit:400,hasMore:false});await view.pump();
  assert.equal(list().props.entries[0].id,'200');assert.equal(scroll.scrollTop,0);
  assert.equal(next().props['aria-disabled'],true,'last-page Next remains focusable and cannot advance');
  assert(!JSON.stringify(view.tree).includes('catalog.more'),'Load more is replaced by pagination');
  view.dispose();
  console.log('PASS native preview, background loading and deferred Next reset page/focus without losing visible results');
}
async function globalSortTests(){
  const view=hooks(),rest=deferred(),complete=deferred(),requests=[];
  const cache={entries:[{kind:'album',id:'z',title:'Zebra'},{kind:'album',id:'b',title:'Bravo'}],hasMore:true,limit:0};
  const module=load('src/components/CatalogLibrary.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},react:view.react,
    '@decky/ui':{Focusable:'focusable',DialogButton:'button',Navigation:{},GamepadButton:{}},
    './CatalogList':{CatalogList:'list'},'./LibraryToolbar':{LibraryToolbar:'toolbar'},'./MediaRow':{MediaRow:'row'},
    '../services/i18n':{useI18n:()=>({t:key=>key})},
    '../services/catalog':{cachedLibraryCategory:()=>cache,loadLibraryCategory:async(_,limit)=>{requests.push(limit);return (limit===null?complete:rest).promise;}},
  });
  view.setRender(()=>module.CatalogLibrary({category:'albums',categoryFocusRequest:7}));await view.pump();
  const toolbar=()=>walk(view.tree).find(node=>node.type==='toolbar');
  assert.equal(toolbar().props.categoryFocusRequest,7,'category handoff survives catalogue mounting');
  toolbar().props.onSort();await view.pump();assert.deepEqual(requests,[200,null],'alphabetical sorting requests all continuation pages');
  const all=[...cache.entries,{kind:'album',id:'a',title:'Alpha'}];
  complete.resolve({entries:all,hasMore:false,limit:null});await view.pump();
  const list=()=>walk(view.tree).find(node=>node.type==='list');
  assert.deepEqual(Array.from(list().props.entries,x=>x.id),['a','b','z']);
  assert.deepEqual(all.map(x=>x.id),['z','b','a']);assert.equal(scroll.scrollTop,0);
  assert.equal(list().props.focusRequest,0,'sorting never requests focus on a result row');
  toolbar().props.onSort();await view.pump();assert.deepEqual(Array.from(list().props.entries,x=>x.id),['z','b','a']);
  assert(!walk(view.tree).some(node=>node.props?.className==='ytm-catalog-library-actions'),'no duplicate bottom refresh');
  rest.resolve({entries:cache.entries,limit:200,hasMore:true});await view.pump();
  assert.equal(list().props.entries.length,3,'late preview must not replace the complete sorted collection');
  view.dispose();console.log('PASS all-category sorting loads the complete catalogue, resets focus and rejects stale previews');
}
(async()=>{await collectionTests();rowsAndFiltersTests();artistPageTests();await progressiveTests();await globalSortTests();})().catch(error=>{console.error(error);process.exitCode=1;});

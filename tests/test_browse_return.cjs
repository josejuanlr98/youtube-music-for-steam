const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,modules={},globals={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>modules[name]||{},console,...globals});return exports;
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function playlistCache(){
 let response=deferred(),calls=[];
 const library=load('src/services/playlistLibrary.ts',{'@decky/api':{call:(...args)=>{calls.push(args);return response.promise;}}});
 const a=library.loadPlaylistLibrary(true),b=library.loadPlaylistLibrary(true);
 assert.equal(calls.length,1);assert.deepEqual(calls[0],['get_library_playlists',false,0]);
 response.resolve({playlists:[{playlistId:'first'}],hasMore:true});await Promise.all([a,b]);
 response=deferred();const full=library.loadPlaylistLibrary();response.resolve({playlists:[{playlistId:'first'},{playlistId:'second'}],hasMore:false});await full;
 assert.equal((await library.loadPlaylistLibrary(true)).playlists.length,2);
 assert.equal(calls.length,2,'cached full Library avoids both preview and continuation on return');
 response=deferred();const old=library.loadPlaylistLibrary(true,true);const oldResponse=response;
 response=deferred();const fresh=library.loadPlaylistLibrary(true,true);
 oldResponse.resolve({playlists:[{playlistId:'stale'}],hasMore:true});assert((await old).error);
 response.resolve({playlists:[{playlistId:'fresh'}],hasMore:true});await fresh;
 assert.equal(library.cachedPlaylistLibrary().playlists[0].playlistId,'fresh');
 response=deferred();const account=library.loadPlaylistLibrary();library.clearPlaylistLibrary();response.resolve({playlists:[{playlistId:'private'}]});assert((await account).error);assert.equal(library.cachedPlaylistLibrary(),undefined);
 console.log('PASS progressive playlist Library, deduplication, refresh races and account isolation');
}
function returnState(){
 const events=[],timers=[],frames=new Map(),effects=[];let frame=0,currentFocus;
 const view={getComputedStyle:node=>({overflowY:node.overflow||'',visibility:node.hidden?'hidden':'visible'}),requestAnimationFrame:fn=>{frames.set(++frame,fn);return frame;},cancelAnimationFrame:id=>frames.delete(id)};
 const row={dataset:{ytmFocusId:'entry:album:album_45'}};
 const scroll={scrollTop:450,overflow:'auto',ownerDocument:{defaultView:view},parentElement:null};
 const root={isConnected:true,ownerDocument:{defaultView:view,activeElement:null},contains:()=>false,querySelector:()=>null,querySelectorAll:()=>[row]};
 const react={useState:v=>[v,()=>{}],useRef:v=>({current:v}),useEffect:fn=>effects.push(fn)};
 const api=load('src/services/browseState.ts',{react,'./focus':{focusLyricsReader:(node,done)=>{currentFocus=node;scroll.scrollTop=900;done?.();return()=>{};}}},{setTimeout:fn=>timers.push(fn),window:{addEventListener(){},removeEventListener(){},dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
 const browse=api.useBrowseReturn('catalog:artist',{current:root},{current:scroll});effects.splice(0).forEach(fn=>fn());
 browse.capture({filter:'albums',page:1},'entry:album:album_45');
 api.requestBrowseReturn('catalog:artist');scroll.scrollTop=0;
 const remembered=api.savedBrowseState('catalog:artist');assert.equal(remembered.filter,'albums');assert.equal(remembered.page,1);assert.equal(remembered.returning,true);
 api.useBrowseReturn('catalog:artist',{current:root},{current:scroll});effects.splice(0).forEach(fn=>fn());
 for(const[id,fn]of frames){frames.delete(id);fn();}
 assert.equal(currentFocus,row);assert.equal(scroll.scrollTop,450,'restore after focus neutralizes Steam auto-scroll');assert.equal(api.savedBrowseState('catalog:artist').returning,false);
 for(let i=0;i<60;i++)api.useBrowseReturn('catalog:'+i,{current:root},{current:scroll}).capture({page:i},'row');
 assert.equal(api.savedBrowseState('catalog:artist'),undefined,'navigation state remains bounded');
 api.requestBrowseReturn('catalog:59');api.clearBrowseState();timers.forEach(fn=>fn());assert.equal(events.length,0,'account changes cancel delayed navigation events');
 const play={};currentFocus=null;api.useBrowseReturn('catalog:new',{current:root},undefined,{current:play});effects.splice(0).forEach(fn=>fn());assert.equal(currentFocus,play,'a new collection focuses Play');
 console.log('PASS saved filter/page/scroll/cursor, fresh Play focus and bounded account-safe navigation memory');
}
(async()=>{await playlistCache();returnState();})().catch(error=>{console.error(error);process.exitCode=1;});

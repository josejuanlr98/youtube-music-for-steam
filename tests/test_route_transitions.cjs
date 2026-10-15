const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture(paths,options={}){
 let position=paths.length-1,pops=0,opens=0,requests=0,cancels=0,frames=0,animation;
 const listeners=new Set();
 const history={location:{pathname:paths[position],key:String(position)},listen:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},goBack(){pops++;if(options.timeout)return;setTimeout(()=>{position=Math.max(0,position-1);history.location={pathname:paths[position],key:String(position)};for(const fn of [...listeners])fn(history.location,'POP')},1)}};
 const nav={NavigateBack(){throw Error('must use captured main-window history')},OpenQuickAccessMenu(){opens++}};
 const result={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/browseNavigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:result,require:name=>name==='@decky/ui'?{Navigation:nav,QuickAccessTab:{Decky:999},Router:{WindowStore:{GamepadUIMainWindowInstance:{History:history}}}}:{requestPlayerReturn:()=>requests++,requestLibraryTabReturn:()=>requests++},setTimeout,clearTimeout,console});
 const root={isConnected:true,ownerDocument:{defaultView:{matchMedia:()=>({matches:!!options.reduced}),requestAnimationFrame:fn=>{frames++;setImmediate(fn)}}},animate:()=>{animation={finished:new Promise(resolve=>setTimeout(resolve,5)),cancel:()=>cancels++};return animation}};
 return {api:result,root,history,listeners,get pops(){return pops},get opens(){return opens},get requests(){return requests},get cancels(){return cancels},get frames(){return frames},get animated(){return !!animation},external(path){history.location={pathname:path};for(const fn of [...listeners])fn(history.location,'PUSH')}};
}
(async()=>{
 {
 const f=fixture(['/library','/youtube-music-search','/youtube-music-browse/1','/youtube-music-browse/2']);
 const returned=f.api.returnBrowseToPlayer(3,f.root);f.api.returnBrowseToPlayer(3,f.root);assert.equal(f.pops,0,'exit animation precedes navigation');await returned;
 assert.equal(f.pops,3);assert.equal(f.opens,1);assert.equal(f.history.location.pathname,'/library');assert.equal(f.requests,2);assert.equal(f.cancels,1);assert.equal(f.listeners.size,0);assert.equal(f.frames,2,'QAM waits for destination painting');
 }
 {
 const f=fixture(['/library','/youtube-music-settings/auth','/youtube-music-settings/cast','/youtube-music-settings/language']);await f.api.returnBrowseToPlayer(1,f.root);assert.equal(f.pops,3,'Settings sidebar history is completely unwound');assert.equal(f.opens,1);
 }
 {
 const f=fixture(['/library','/youtube-music-browse/artist','/youtube-music-browse/album']);await f.api.backFromBrowse(f.root);assert.equal(f.pops,1);assert.equal(f.opens,0);assert.equal(f.history.location.pathname,'/youtube-music-browse/artist','nested B returns to the parent without opening QAM');
 }
 {
 const f=fixture(['/library','/youtube-music-playlist'],{reduced:true});await f.api.backFromBrowse(f.root,()=>{});assert.equal(f.opens,1);assert.equal(f.animated,false,'reduced-motion preference skips animation');
 }
 {
 const f=fixture(['/library','/youtube-music-lyrics']);const back=f.api.returnBrowseToPlayer(1,f.root);f.external('/downloads');await back;assert.equal(f.pops,0);assert.equal(f.opens,0,'Steam shortcuts during the fade must not pop or steal another screen');
 }
 {
 const f=fixture(['/library','/youtube-music-lyrics'],{timeout:true});await f.api.returnBrowseToPlayer(1,f.root);assert.equal(f.pops,1);assert.equal(f.opens,0,'failed navigation cannot open QAM over a route');assert.equal(f.listeners.size,0);assert.equal(f.cancels,1);
 }
 {
 const f=fixture(['/library','/youtube-music-lyrics'],{timeout:true});const back=f.api.returnBrowseToPlayer(1,f.root);await new Promise(r=>setTimeout(r,10));f.external('/downloads');await back;assert.equal(f.opens,0,'unrelated PUSH while waiting for POP does not count as our completion');assert.equal(f.listeners.size,0);
 }
 {
 const f=fixture(['/library','/youtube-music-lyrics']);let disconnected=0;
 f.root.ownerDocument.defaultView.MutationObserver=class{constructor(callback){this.callback=callback}observe(){setTimeout(()=>{assert.equal(f.opens,0,'menu must not cover the departing route');f.root.isConnected=false;this.callback()},20)}disconnect(){disconnected++}};
 await f.api.returnBrowseToPlayer(1,f.root);assert.equal(f.opens,1);assert.equal(disconnected,1,'route-unmount observer cleans up');
 }
 console.log('PASS 8 route-transition scenarios: exit before POP, destination paint before QAM, repeated B, nested history, Settings sidebar, reduced motion, timeout and Steam shortcut isolation');
})().catch(error=>{console.error(error);process.exitCode=1});

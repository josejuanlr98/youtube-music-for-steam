const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const jsx=(type,props,key)=>({type,props,key}),walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
function load(file,modules={},globals={}){
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='../services/browseState'?(modules[name]||require('./browse_fixture.cjs')):name==='../services/pagination'?load('src/services/pagination.ts',{react:modules.react,'./focus':modules['../services/focus']||{focusLyricsReader:()=>()=>{}}},globals):modules[name]||{},console,...globals});return exports;
}
function harness(modules={},globals={}){
 const slots=[],focused=[],scrolled=[];let cursor=0,dirty=true,queue=[],renderFn,tree;
 const react={
  useState:initial=>{const index=cursor++;slots[index]??={value:typeof initial==='function'?initial():initial};return[slots[index].value,next=>{const value=typeof next==='function'?next(slots[index].value):next;if(value!==slots[index].value){slots[index].value=value;dirty=true;}}];},
  useRef:initial=>{const index=cursor++;slots[index]??={current:initial};return slots[index];},
  useEffect:(fn,deps)=>{const index=cursor++,old=slots[index];if(!old||deps.some((value,i)=>value!==old.deps[i])){slots[index]={deps,cleanup:old?.cleanup};queue.push(()=>{slots[index].cleanup?.();slots[index].cleanup=fn();});}},
  useMemo:(fn,deps)=>{const index=cursor++,old=slots[index];if(!old||deps.some((value,i)=>value!==old.deps[i]))slots[index]={deps,value:fn()};return slots[index].value;},
 };
 const all={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@decky/ui':{Focusable:'focusable',DialogButton:'button',ButtonItem:'button',TextField:'input',SidebarNavigation:'sidebar',Navigation:{},GamepadButton:{}},
  '../services/i18n':{useI18n:()=>({t:key=>key})},'../services/focus':{focusLyricsReader:node=>{focused.push(node);return()=>{};}},...modules};
 return{focused,scrolled,load:file=>load(file,all,globals),setRender:fn=>{renderFn=fn;dirty=true;},get tree(){return tree;},
  async pump(){for(let n=0;n<12;n++){while(dirty){dirty=false;cursor=0;tree=renderFn();for(const node of walk(tree))if(node.props?.ref){node.props.ref.current??={closest:()=>({scrollTop:0}),scrollIntoView:options=>scrolled.push(options)};}const work=queue;queue=[];work.forEach(fn=>fn());}await new Promise(resolve=>setImmediate(resolve));}},
  dispose(){slots.forEach(slot=>slot.cleanup?.());}};
}
function preferenceTests(){
 const store=new Map(),listeners=new Map();let reads=0,blocked=false,changes=0;
 const localStorage={getItem:key=>{reads++;return store.get(key)||null;},setItem:(key,value)=>{if(blocked)throw Error('unavailable');store.set(key,value);}};
 const window={addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn),dispatchEvent:event=>{listeners.get(event.type)?.forEach(fn=>fn(event));}};
 class Event{constructor(type){this.type=type;}}
 const api=load('src/services/i18n.ts',{}, {localStorage,window,navigator:{language:'en'},Event,CustomEvent:Event});
 const stop=api.initI18nPreferences();window.addEventListener('ytm-language-changed',()=>changes++);
 for(let i=0;i<100;i++){api.translate('tabs.player');api.getLanguage();api.getResolvedLanguage();api.getTranslateLyricsEnabled();api.getTranslationLanguage();api.getResolvedTranslationLanguage();}
 assert.equal(reads,3,'hundreds of preference reads touch storage only once per key');
 api.setLanguage('es');api.setTranslateLyricsEnabled(true);api.setTranslationLanguage('fr');
 assert.equal(api.translate('tabs.player'),'Reproductor');assert.equal(api.getTranslateLyricsEnabled(),true);assert.equal(api.getResolvedTranslationLanguage(),'fr');assert.equal(reads,3);
 store.set('ytm-language-v1','de');window.dispatchEvent({type:'storage',key:'unrelated',storageArea:localStorage});assert.equal(api.getLanguage(),'es');
 window.dispatchEvent({type:'storage',key:'ytm-language-v1',storageArea:localStorage});assert.equal(api.getLanguage(),'de');assert.equal(changes,4,'external storage changes notify mounted readers');
 store.clear();window.dispatchEvent({type:'storage',key:null,storageArea:localStorage});assert.equal(api.getLanguage(),'system');assert.equal(api.getTranslateLyricsEnabled(),false);assert.equal(api.getTranslationLanguage(),'follow');
 blocked=true;api.setLanguage('ja');api.setTranslateLyricsEnabled(true);api.setTranslationLanguage('it');
 assert.equal(api.getLanguage(),'ja');assert.equal(api.getTranslateLyricsEnabled(),true);assert.equal(api.getResolvedTranslationLanguage(),'it','preferences still work for the session without writable storage');
 api.setTranslationLanguage('system');assert.equal(api.getTranslationLanguage(),'it','invalid translation-language values cannot poison the cache');
 stop();assert.equal(listeners.get('storage').size,0);assert.equal(listeners.get('languagechange').size,0);
 console.log('PASS preference caching avoids repeated storage reads, synchronizes other windows and cleans up');
}
async function categoryTests(){
 const view=harness();const filters=view.load('src/components/CatalogList.tsx');let value='playlists',request=0;
 view.setRender(()=>filters.CatalogFilters({value,onChange:next=>value=next,compact:true,library:true,focusRequest:request}));await view.pump();
 assert.equal(view.focused.length,0,'opening Library never forces focus into the selector');
 for(const category of ['artists','albums','songs','playlists']){
  walk(view.tree).find(node=>node.type==='button'&&node.props['aria-expanded']!==undefined).props.onClick();await view.pump();
  walk(view.tree).find(node=>node.type==='button'&&node.props.children==='catalog.'+category).props.onClick();await view.pump();
  assert.equal(value,category);assert.equal(walk(view.tree).filter(node=>node.type==='button').length,1);
  assert.equal(view.focused.at(-1),walk(view.tree).find(node=>node.type==='button').props.ref.current,'closing the menu restores the selector');
 }
 const remount=harness();const next=remount.load('src/components/CatalogList.tsx');
 remount.setRender(()=>next.CatalogFilters({value,onChange(){},compact:true,library:true,focusRequest:4}));await remount.pump();assert.equal(remount.focused.length,1,'new category component honors the parent focus handoff');
 view.dispose();remount.dispose();
 const parent=harness({'../context/PlayerContext':{usePlayer:()=>({authenticated:true,authReady:true})},'./CatalogLibrary':{CatalogLibrary:'catalog'},'./LibraryToolbar':{LibraryToolbar:'toolbar'}},{window:{addEventListener(){},removeEventListener(){}}});
 const library=parent.load('src/components/LibraryView.tsx');parent.setRender(()=>library.LibraryView({}));await parent.pump();
 for(const [index,category] of ['artists','albums','songs','playlists'].entries()){
  const content=walk(parent.tree).find(node=>node.props?.onCategoryChange);content.props.onCategoryChange(category);await parent.pump();
  const replacement=walk(parent.tree).find(node=>node.props?.onCategoryChange);
  assert.equal(replacement.props.categoryFocusRequest,index+1,'Library carries focus intent across category unmount/remount');
 }
 parent.dispose();console.log('PASS category selection returns controller focus to the selector, including across library remounts');
}
async function memoTests(){
 let sorts=0;const cache={entries:Array.from({length:5000},(_,index)=>({kind:'song',id:String(index),title:'Song '+index})),limit:null};
 const view=harness({'../services/librarySort':{savedCatalogSort:()=>1,saveCatalogSort(){},sortCatalog:(entries,sort)=>{sorts++;return sort===2?[...entries].reverse():entries;}},
  '../services/catalog':{cachedLibraryCategory:()=>cache,loadLibraryCategory:async()=>cache,actCatalogSong:async()=>{}},'./LibraryToolbar':{LibraryToolbar:'toolbar'},'./CatalogList':{CatalogList:'list'},'./MediaRow':{MediaRow:'row'}});
 const catalog=view.load('src/components/CatalogLibrary.tsx');view.setRender(()=>catalog.CatalogLibrary({category:'songs'}));await view.pump();assert.equal(sorts,1);
 const list=()=>walk(view.tree).find(node=>node.type==='list');list().props.onSong(cache.entries[0],'next');await view.pump();assert.equal(sorts,1,'pending and queued notices do not re-sort 5000 entries');
 walk(view.tree).find(node=>node.type==='button'&&node.props.children==='common.next').props.onClick();await view.pump();assert.equal(sorts,1,'pagination reuses the ordered catalogue');
 walk(view.tree).find(node=>node.type==='toolbar').props.onSort();await view.pump();assert.equal(sorts,2,'a new order recomputes exactly once');view.dispose();
 console.log('PASS memoized sorting reuses a 5000-song collection through pending state, notices and pagination');
}
async function restartNoticeTests(){
 let finish,calls=0;
 const view=harness({'@decky/api':{call:async name=>name==='get_cast_device_name'?{name:'Steam Deck'}:name==='hard_reset'?(calls++,await new Promise(resolve=>finish=resolve)):{}},
  '../services/audioManager':{apiGetNetwork:async()=>({name:'Home',trusted:true})}});
 const settings=view.load('src/components/SettingsPage.tsx').SettingsPage();const content=walk(settings).find(node=>node.props?.pages).props.pages.find(page=>page.route.endsWith('/cast')).content;
 view.setRender(()=>content.type(content.props));await view.pump();
 const restart=()=>walk(view.tree).find(node=>node.type==='button'&&node.props.children==='settings.restart');
 const first=restart().props.onClick(),second=restart().props.onClick();await view.pump();assert.equal(calls,1,'double click cannot start two backend resets');assert.equal(restart().props.disabled,true);
 const notice=()=>walk(view.tree).find(node=>node.props?.className==='ytm-cast-status');
 assert.equal(notice().props.children,'settings.restarting');assert(view.scrolled.length>0,'status is brought into the settings viewport');
 finish({success:true});await Promise.all([first,second]);await view.pump();assert.equal(notice().props.children,'settings.restarted');assert.equal(restart().props.disabled,false);
 const children=[view.tree.props.children].flat(Infinity).filter(Boolean);assert(children.indexOf(notice())<children.indexOf(restart()),'status is above the long settings form, not under the last button');
 const again=restart().props.onClick();finish({success:false,error:'Receiver unavailable'});await again;await view.pump();assert.equal(notice().props.children,'Receiver unavailable');assert.equal(restart().props.disabled,false);view.dispose();
 console.log('PASS restart notice stays inside the visible form, serializes repeated clicks and displays success/failure');
}
(async()=>{preferenceTests();await categoryTests();await memoTests();await restartNoticeTests();})().catch(error=>{console.error(error);process.exitCode=1;});

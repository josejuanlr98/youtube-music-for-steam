const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const jsx=(type,props)=>({type,props}),walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
function load(file,modules={},globals={}){
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>modules[name]||{},console,...globals});
  return exports;
}
async function readerTest(fullScreen,cast){
  let now=0,id=0,position=8,offset=0,translated;
  const frames=new Map(),timers=new Map(),intervals=new Map(),listeners=new Set();
  const clock={Date:{now:()=>now},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key),
    setInterval:(fn,delay)=>{intervals.set(++id,{fn,delay,at:now+delay});return id;},clearInterval:key=>intervals.delete(key)};
  const view={...clock,requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key),matchMedia:()=>({matches:false})};
  const doc={defaultView:view,visibilityState:'visible',addEventListener(){},removeEventListener(){}};
  const reader={get scrollTop(){return offset;},set scrollTop(value){offset=Math.round(value);},scrollHeight:1800,clientHeight:320,ownerDocument:doc,
    getBoundingClientRect:()=>({top:0}),scrollTo:({top})=>{offset=Math.round(top);},
    querySelector:selector=>({clientHeight:40,getBoundingClientRect:()=>({top:100+Number(selector.match(/\d+/)[0])*150-offset})})};
  const root={ownerDocument:doc};
  const slots=[];let cursor=0,dirty=true,queue=[],tree,component;
  const react={
    useState:initial=>{const index=cursor++;slots[index]??={value:typeof initial==='function'?initial():initial};return[slots[index].value,next=>{const value=typeof next==='function'?next(slots[index].value):next;if(value!==slots[index].value){slots[index].value=value;dirty=true;}}];},
    useRef:initial=>{const index=cursor++;slots[index]??={current:initial};return slots[index];},
    useEffect:(fn,deps)=>{const index=cursor++,old=slots[index];if(!old||deps.some((value,i)=>value!==old.deps[i])){slots[index]={deps,cleanup:old?.cleanup};queue.push(()=>{slots[index].cleanup?.();slots[index].cleanup=fn();});}},
  };
  const pump=async()=>{for(let n=0;n<10;n++){
    while(dirty){dirty=false;cursor=0;tree=component({fullScreen});
      for(const node of walk(tree))if(node.props?.ref)node.props.ref.current=node.props.className?.includes('ytm-reader')?reader:root;
      const work=queue;queue=[];work.forEach(fn=>fn());
    }
    await Promise.resolve();
  }};
  const globals={...clock,window:{...view,dispatchEvent(){}},document:doc,navigator:{}};
  const motion=load('src/services/readerScroll.ts',{},globals),synced=load('src/services/syncedLyrics.ts',{},globals);
  const lines=[{text:'One',start:0,end:6},{text:'Two',start:7,end:13},{text:'Three',start:14,end:20}];
  component=load('src/components/LyricsPage.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},react,
    '@decky/ui':{Focusable:'focusable',DialogButton:'button',Navigation:{},GamepadButton:{DIR_UP:9,DIR_DOWN:10}},
    '../services/readerScroll':motion,'../services/syncedLyrics':synced,
    '../services/lyricColor':load('src/services/lyricColor.ts'),
    '../services/audioManager':{getCurrentTrack:()=>({videoId:'song',title:'Song'}),getIsPlaying:()=>true,getIsCastConnected:()=>cast,getCastSenderName:()=>cast?'Phone':null,
      getProgress:()=>({position,duration:30}),getLivePlaybackPosition:()=>position,
      addProgressListener:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},addCastConnectionListener:()=>()=>{},addTrackChangeListener:()=>()=>{},addPlayStateListener:()=>()=>{}},
    '../services/lyrics':{loadLyrics:async()=>({lyrics:'One\nTwo\nThree',timedLines:lines}),loadTranslatedLyrics:()=>new Promise(resolve=>translated=resolve)},
    '../services/focus':{focusLyricsReader:()=>()=>{}},'../services/notifications':{suppressFullscreenNotifications:()=>()=>{}},
    '../services/i18n':{useI18n:()=>({t:key=>key,translateLyrics:true,resolvedTranslationLanguage:'es'})},
    '../services/artworkPalette':{useArtworkPalette:()=>['100,120,140','80,90,100','50,60,70']},'../services/lyricsSource':{lyricsSource:()=>''},
  },globals).LyricsPanel;
  const advance=async(ms)=>{let remaining=ms;while(remaining>0){const elapsed=Math.min(16,remaining);now+=elapsed;remaining-=elapsed;
    for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.fn();}
    for(const timer of [...intervals.values()])if(timer.at<=now){timer.at=now+timer.delay;timer.fn();}
    const batch=[...frames];frames.clear();batch.forEach(([,fn])=>fn(now));
    await pump();
  }};
  await pump();await advance(50);assert.equal(offset,110,'entry centers the current audio cue');
  const getReader=()=>walk(tree).find(node=>node.props?.className==='ytm-reader ytm-card');
  assert.equal(getReader().props.style.scrollBehavior,'auto','native smooth scrolling cannot fight the spring animation');
  getReader().props.onGamepadDirection({detail:{button:10},preventDefault(){},stopPropagation(){}});
  await advance(3000);assert.equal(offset,110+(fullScreen?140:80));
  position=16;
  getReader().props.onKeyDown({key:'PageDown',preventDefault(){}});
  await advance(2500);assert.equal(offset,110+(fullScreen?140:80)+240);
  translated({translatedLines:['Uno','Dos','Tres']});await pump();assert.equal(listeners.size,1,'translation arrival keeps the same follower');
  await advance(2499);assert.equal(offset,110+(fullScreen?140:80)+240,'stay at the manual position for five seconds after the last input');
  await advance(501);assert.equal(offset,260,'return to the line being sung now, not the earlier manual anchor');
  await advance(1000);assert.equal(offset,260,'no stale manual animation pulls the reader back');
  getReader().props.onWheel();reader.scrollTop=700;
  await advance(4000);getReader().props.onPointerMove({buttons:0});
  await advance(999);assert.equal(offset,700,'pointer hover does not renew the idle deadline');
  await advance(501);assert.equal(offset,260,'native wheel browsing returns to the live cue');
  getReader().props.onPointerDown();reader.scrollTop=800;
  await advance(4000);getReader().props.onPointerUp();
  await advance(4999);assert.equal(offset,800,'scrollbar release starts a fresh five-second deadline');
  await advance(501);assert.equal(offset,260);
  slots.forEach(slot=>slot.cleanup?.());assert.equal(frames.size,0);assert.equal(intervals.size,0);assert.equal(timers.size,0);
  console.log(`PASS ${fullScreen?'fullscreen':'tab'} ${cast?'Cast':'local'}: five-second follow returns after repeated input and translation, with pixel rounding`);
}
(async()=>{for(const fullScreen of [false,true])for(const cast of [false,true])await readerTest(fullScreen,cast);})().catch(error=>{console.error(error);process.exitCode=1;});

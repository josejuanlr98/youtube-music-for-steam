const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const jsx=(type,props,key)=>({type,props,key}),walk=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(walk)];
function load(file,modules,globals={}){const result={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:result,require:name=>modules[name]||{},console,...globals});return result}
function hooks(){
 const slots=[];let cursor=0,dirty=false,render,tree;const layout=new Map(),passive=new Map();
 const effect=(queue,fn,deps)=>{const index=cursor++,old=slots[index];if(!old||deps.some((value,i)=>value!==old.deps[i])){slots[index]={deps,cleanup:old?.cleanup};queue.set(index,()=>{slots[index].cleanup?.();slots[index].cleanup=fn()})}};
 const react={useState:initial=>{const index=cursor++;slots[index]??={value:typeof initial==='function'?initial():initial};return[slots[index].value,next=>{const value=typeof next==='function'?next(slots[index].value):next;if(value!==slots[index].value){slots[index].value=value;dirty=true}}]},useRef:initial=>{const index=cursor++;return slots[index]??={current:initial}},useEffect:(fn,deps)=>effect(passive,fn,deps),useLayoutEffect:(fn,deps)=>effect(layout,fn,deps)};
 return{react,paint(fn,attach=()=>{}){render=fn||render;let tries=0;do{assert(++tries<20,'layout must settle');dirty=false;cursor=0;tree=render();attach(tree);const work=[...layout.values()];layout.clear();work.forEach(fn=>fn())}while(dirty);return tree},flush(){const work=[...passive.values()];passive.clear();work.forEach(fn=>fn())},dispose(){slots.forEach(slot=>slot.cleanup?.())}};
}
const timers=new Map();let timer=0;const clock={setTimeout:fn=>{timers.set(++timer,fn);return timer},clearTimeout:id=>timers.delete(id)};
function backdrop(){
 const h=hooks(),neutral=['78, 108, 132','54, 74, 92','34, 47, 61'],red=['255, 0, 0','180, 0, 0','80, 0, 0'],blue=['0, 0, 255','0, 0, 180','0, 0, 80'];
 const {ArtworkBackdrop}=load('src/components/ArtworkBackdrop.tsx',{react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'../services/artworkPalette':{defaultPalette:neutral}},clock);
 let palette=red,idle=false;const render=()=>ArtworkBackdrop({palette,animated:true,idle});
 let tree=h.paint(render);h.flush();tree=h.paint();assert(tree.props.style.background.includes('255, 0, 0'));
 palette=neutral;tree=h.paint();assert(tree.props.style.background.includes('255, 0, 0'),'a still-playing song retains its palette while the next cover is sampled');h.flush();
 idle=true;tree=h.paint();assert(!JSON.stringify(tree).includes('255, 0, 0'),'Nothing playing clears the previous palette before effects run');assert(tree.props.style.background.includes(neutral[0]));assert(!walk(tree).some(node=>node.props?.className==='ytm-atmosphere-prev'),'idle cannot retain an old opaque layer');h.flush();assert.equal(timers.size,0,'Stop cancels a pending palette fade');
 idle=false;palette=blue;h.paint();h.flush();tree=h.paint();assert(tree.props.style.background.includes(blue[0]));assert(!JSON.stringify(tree).includes(red[0]),'restarting cannot resurrect the stopped song palette');h.dispose();assert.equal(timers.size,0);
 console.log('PASS idle background clears synchronously, cancels old layers and timers, and retains normal cover-loading transitions');
}
async function lyricEntry(){
 const h=hooks(),followed=[],progress=new Set();let trackListener,position=9;const intervals=new Map();let id=0;
 const view={setInterval:fn=>{intervals.set(++id,fn);return id},clearInterval:id=>intervals.delete(id)};
 const reader={scrollTop:0,ownerDocument:{defaultView:view}},root={ownerDocument:{visibilityState:'visible',defaultView:view}};
 const first=[{text:'Old first',start:0,end:20},{text:'Old second',start:20,end:40}],second=[{text:'New first',start:0,end:2},{text:'New second',start:2,end:30}];
 let track={videoId:'a',title:'A',artist:'Artist',duration:40};const results=new Map([['a',{lyrics:'Old first\nOld second',timedLines:first}],['b',{lyrics:'New first\nNew second',timedLines:second}]]);
 const panel=load('src/components/LyricsPage.tsx',{
  react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},'@decky/ui':{Focusable:'view',DialogButton:'button'},
  '../services/i18n':{useI18n:()=>({t:key=>key})},'../services/audioManager':{getCurrentTrack:()=>track,getIsPlaying:()=>true,getIsCastConnected:()=>true,getCastSenderName:()=>null,getProgress:()=>({position,duration:40}),getLivePlaybackPosition:()=>position,addTrackChangeListener:fn=>{trackListener=fn;return()=>{}},addPlayStateListener:()=>()=>{},addCastConnectionListener:()=>()=>{},addProgressListener:fn=>{progress.add(fn);return()=>progress.delete(fn)}},
  '../services/artworkPalette':{useArtworkPalette:()=>['1,2,3','4,5,6','7,8,9']},'../services/lyricColor':{translationColor:()=>''},'../services/lyricsSource':{lyricsSource:()=>''},'../services/focus':{focusLyricsReader:()=>()=>{}},
  '../services/readerScroll':{createReaderScroller:()=>({cancel(){},dispose(){},scrollTo(){}})},
  '../services/syncedLyrics':{followSyncedLyrics:(_el,lines,read,subscribe,onActive)=>{followed.push(lines);const update=()=>onActive(lines.findIndex(line=>read()>=line.start&&read()<line.end));update();const stop=subscribe(update);return{dispose:stop,pause(){}}}},
  '../services/lyrics':{retainLyricsReader:()=>()=>{},cachedLyrics:video=>results.get(video),loadLyrics:async video=>results.get(video)},
 },{...clock,window:view}).LyricsPanel;
 const attach=tree=>{for(const node of walk(tree))if(node.props?.ref)node.props.ref.current=node.props.className?.includes('ytm-reader')?reader:root};
 const paint=()=>h.paint(()=>panel({fullScreen:false}),attach);
 const settle=async()=>{let tree;for(let n=0;n<6;n++){tree=paint();h.flush();await Promise.resolve()}return paint()};
 let tree=await settle();assert.equal(followed.length,1);assert(walk(tree).find(node=>node.props?.className==='ytm-lyric-line ytm-lyric-active').props.children.props.children[0].props.children.includes('Old first'));
 track={...track,videoId:'b',title:'B'};trackListener(track);tree=paint();assert(!JSON.stringify(tree).includes('Old first'),'stale words are hidden immediately on a track change');assert.equal(followed.length,1,'the old transcript is never attached to the new song clock');
 h.flush();tree=paint();const active=walk(tree).filter(node=>node.props?.className==='ytm-lyric-line ytm-lyric-active');assert.equal(active.length,1);assert(JSON.stringify(active[0]).includes('New second'),'the first paint of a cached transcript highlights its actual cue, never row zero');assert.equal(followed.length,2);assert.strictEqual(followed[1],second);
 const enter=walk(tree).find(node=>node.props?.className==='ytm-lyrics-enter');assert.equal(enter.key,'b','each track owns one transcript fade');
 tree=await settle();assert.equal(walk(tree).find(node=>node.props?.className==='ytm-lyrics-enter').key,'b','ordinary updates do not restart the fade');
 track=null;trackListener(null);tree=paint();assert(!walk(tree).some(node=>node.props?.className?.includes('ytm-lyric-active')),'Stop removes the old highlight before passive cleanup');h.flush();paint();h.dispose();assert.equal(progress.size,0);assert.equal(intervals.size,0);
 console.log('PASS track-owned highlights settle before paint, stale followers cannot flash row zero, entry fades once and Stop clears lyrics');
}
(async()=>{backdrop();await lyricEntry();const css=load('src/theme.ts',{}).themeCss;assert.match(css,/@media \(prefers-reduced-motion:reduce\)[^\n]*ytm-lyrics-enter[^\n]*animation:none/);console.log('PASS lyric entry fade respects reduced motion')})().catch(error=>{console.error(error);process.exitCode=1});

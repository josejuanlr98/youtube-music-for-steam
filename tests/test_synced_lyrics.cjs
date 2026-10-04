const assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const api={}; let timer, delay, listener, unsubscribed=false, position=0, now=0;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/syncedLyrics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
 exports:api,Date:{now:()=>now},setTimeout:(fn,ms)=>{timer=fn;delay=ms;return 1},clearTimeout:()=>{timer=undefined}
});
const lines=[{text:'One',start:2,end:4},{text:'Two',start:6,end:8},{text:'',start:9,end:10}];
for (const [pos,active] of [[0,-1],[2,0],[3,0],[4,-1],[6,1],[9,-1],[1,-1]]) assert.equal(api.currentLyric(lines,pos).active,active);
const moves=[], active=[];
const el={scrollTop:0,clientHeight:200,getBoundingClientRect:()=>({top:0}),
 querySelector:selector=>({clientHeight:30,getBoundingClientRect:()=>({top:200+Number(selector.match(/\d+/)[0])*100-el.scrollTop})}),
 scrollTo:options=>{moves.push(options);el.scrollTop=options.top}
};
const follow=api.followSyncedLyrics(el,lines,()=>position,fn=>{listener=fn;return ()=>unsubscribed=true},i=>active.push(i));
function progress(value){position=value;listener(value)}
progress(1.9);assert.equal(active.at(-1),0,'visual cue leads the audio clock slightly');
progress(2);assert.equal(active.at(-1),0);
const count=moves.length;progress(3);assert.equal(moves.length,count,'same line must not repeatedly restart smooth scrolling');
follow.pause();assert.equal(delay,5000);progress(6);assert.equal(active.at(-1),1);assert.equal(moves.length,count);
now+=4999;progress(6);assert.equal(moves.length,count);now++;timer();assert(moves.length>count,'manual reading resumes at current audio time');
progress(2);assert.equal(active.at(-1),0,'seek backwards follows the earlier line');
progress(10);assert.equal(active.at(-1),-1,'outro has no falsely active lyric');
follow.dispose();assert(unsubscribed);const disposed=moves.length;progress(2);assert.equal(moves.length,disposed);
console.log('PASS timed lyrics follow audio cues, instrumental gaps, seeks, manual pause, and cleanup');

// A fullscreen reader can mount before Steam has measured its height, then
// resize again when translations or fonts arrive without changing the cue.
let resize, disconnected=false, height=0, available=false, lineTop=250, frameId=0;
const frames=new Map(),layoutMoves=[];
const view={requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
 ResizeObserver:class{constructor(fn){resize=fn;}observe(){}disconnect(){disconnected=true;}}};
const reader={scrollTop:0,get clientHeight(){return height;},ownerDocument:{defaultView:view},firstElementChild:{},
 getBoundingClientRect:()=>({top:0}),querySelector:()=>available?{clientHeight:40,getBoundingClientRect:()=>({top:lineTop-reader.scrollTop})}:null,
 scrollTo:move=>{layoutMoves.push(move);reader.scrollTop=move.top;}};
position=2;
const mounted=api.followSyncedLyrics(reader,lines,()=>position,fn=>{listener=fn;return()=>{};},()=>{});
assert.equal(layoutMoves.length,0,'missing or zero-sized rows must not be marked centered');
height=200;available=true;listener(position);
assert.equal(layoutMoves.at(-1).top,170);assert.equal(layoutMoves.at(-1).behavior,'auto','first visible cue centers instantly');
const flush=()=>{while(frames.size){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());}};
lineTop=350;resize();flush();assert.equal(layoutMoves.at(-1).top,270,'same cue re-centers after translated rows resize');
mounted.pause();reader.scrollTop=400;const manualCount=layoutMoves.length;
lineTop=450;resize();flush();assert.equal(layoutMoves.length,manualCount,'translation arrival preserves manual-reading timeout');
now+=5000;timer();assert.equal(layoutMoves.at(-1).top,370);assert.equal(layoutMoves.at(-1).behavior,'smooth');
resize();mounted.dispose();assert(disconnected);assert.equal(frames.size,0);
console.log('PASS fullscreen waits for real layout, re-centers resized translations and preserves manual reading');

// Repeated input resets the five-second idle deadline; a progress sample
// restores following even when Steam has not delivered the timer callback.
let pollingListener,nowMoved=0;
const recovered=api.followSyncedLyrics(reader,lines,()=>position,fn=>{pollingListener=fn;return()=>{};},()=>{},()=>nowMoved++);
recovered.pause();now+=4000;recovered.pause();const beforeRecovery=nowMoved;
now+=4999;pollingListener(position);assert.equal(nowMoved,beforeRecovery);
now++;pollingListener(position);assert(nowMoved>beforeRecovery);
recovered.dispose();
console.log('PASS five-second idle deadline resets on input and recovers through live progress polling');

const assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const api={}; let timer, delay, listener, unsubscribed=false, position=0;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/syncedLyrics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
 exports:api,setTimeout:(fn,ms)=>{timer=fn;delay=ms;return 1},clearTimeout:()=>{timer=undefined}
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
progress(2);assert.equal(active.at(-1),0);
const count=moves.length;progress(3);assert.equal(moves.length,count,'same line must not repeatedly restart smooth scrolling');
follow.pause();assert.equal(delay,3000);progress(6);assert.equal(active.at(-1),1);assert.equal(moves.length,count);
timer();assert(moves.length>count,'manual reading resumes at current audio time');
progress(2);assert.equal(active.at(-1),0,'seek backwards follows the earlier line');
progress(10);assert.equal(active.at(-1),-1,'outro has no falsely active lyric');
follow.dispose();assert(unsubscribed);const disposed=moves.length;progress(2);assert.equal(moves.length,disposed);
console.log('PASS timed lyrics follow audio cues, instrumental gaps, seeks, manual pause, and cleanup');

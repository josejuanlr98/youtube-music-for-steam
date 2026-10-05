const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let now=0,id=0,framesRun=0;
const frames=new Map(),timers=new Map(),events=new Map();
const clock={Date:{now:()=>now},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:key=>timers.delete(key)};
const view={requestAnimationFrame:fn=>{frames.set(++id,{fn,at:now+16});return id;},cancelAnimationFrame:key=>frames.delete(key)};
const doc={visibilityState:'visible',defaultView:view,addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:event=>events.delete(event)};
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/lyricsScroll.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,...clock});
const el={scrollTop:0,scrollHeight:200,clientHeight:100,ownerDocument:doc};
function advance(ms){
 const end=now+ms;
 while(true){
  const next=[...[...timers].map(([id,item])=>({id,...item,type:'timer'})),...[...frames].map(([id,item])=>({id,...item,type:'frame'}))].sort((a,b)=>a.at-b.at)[0];
  if(!next||next.at>end)break;
  now=next.at;(next.type==='timer'?timers:frames).delete(next.id);
  if(next.type==='frame')framesRun++;
  next.fn(now);
 }
 now=end;
}
const motion=api.startLyricsScroll(el);
assert.equal(frames.size,0,'initial reading delay needs no animation loop');assert.equal(timers.size,1);
advance(3000);assert(el.scrollTop>10);assert.equal(frames.size,1);
motion.setPlaying(false);const paused=el.scrollTop,frameCount=framesRun;advance(3000);
assert.equal(el.scrollTop,paused);assert.equal(framesRun,frameCount,'playback pause schedules no recurring RAF');assert.equal(timers.size,0);
motion.setPlaying(true);advance(100);assert(el.scrollTop>paused);
motion.pause();el.scrollTop=50;assert.equal(frames.size,0);assert.equal(timers.size,1);
advance(4000);assert.equal(el.scrollTop,50);assert.equal(motion.pause(),false,'repeated input renews the pause');el.scrollTop=35;
advance(4999);assert.equal(el.scrollTop,35);advance(1);assert.equal(el.scrollTop,35,'untimed reading resumes from the manual position without restoring an old anchor');advance(16);assert(el.scrollTop>35&&el.scrollTop<36);advance(600);assert(el.scrollTop>35);
while(el.scrollTop<100)advance(16);
assert.equal(frames.size,0,'end-of-reader wait has no RAF');const restart=[...timers.values()][0].at;advance(restart-now-1);assert.equal(el.scrollTop,100);advance(1);assert.equal(el.scrollTop,0);advance(16);assert(el.scrollTop>0,'loop resumes immediately after the five-second end wait');
doc.visibilityState='hidden';events.get('visibilitychange')();const before=el.scrollTop;
assert.equal(frames.size,0);assert.equal(timers.size,0);advance(3000);assert.equal(el.scrollTop,before);
doc.visibilityState='visible';events.get('visibilitychange')();advance(16);assert(el.scrollTop-before<1,'visibility resumes without a catch-up jump');
// Paused playback preserves manual browsing without timers or movement.
motion.setPlaying(false);motion.pause();el.scrollTop=80;advance(5000);assert.equal(el.scrollTop,80);assert.equal(frames.size,0);assert.equal(timers.size,0);
// Late translated lines can add overflow after an initially short plain lyric.
el.scrollHeight=100;motion.setPlaying(true);advance(516);assert.equal(frames.size,0);assert.equal(timers.size,1);
el.scrollHeight=200;advance(300);assert.equal(frames.size,1);
const stale=[...frames.values()][0].fn;motion.dispose();assert.equal(events.size,0);assert.equal(frames.size,0);assert.equal(timers.size,0);stale();assert.equal(frames.size,0);
console.log('PASS RAF reading preserves speed, looping and five-second manual pause, sleeps while paused/hidden, handles late overflow and cleans up');

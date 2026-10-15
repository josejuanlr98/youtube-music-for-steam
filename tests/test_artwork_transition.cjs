const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const timers=new Map();let clock=0,sequence=0;
const globals={setTimeout:(fn,delay)=>{timers.set(++sequence,{fn,at:clock+delay});return sequence},clearTimeout:key=>timers.delete(key)};
const api={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/artworkTransition.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,...globals});
const deferred=()=>{let resolve,reject;const ready=new Promise((a,b)=>{resolve=a;reject=b});return {ready,resolve,reject,cancelled:false,cancel(){this.cancelled=true}}};
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve()};
(async()=>{
 const frames=[],loads=new Map(),transition=api.createArtworkTransition(frame=>frames.push(frame),source=>{const pending=deferred();loads.set(source,pending);return pending});
 transition.setSource('a');assert.equal(frames.length,0);loads.get('a').resolve('a');await tick();assert.equal(frames.at(-1).current,'a');
 transition.setSource('b');assert.equal(frames.at(-1).current,'a','old decoded cover stays while downloading');transition.setSource('c');assert(loads.get('b').cancelled);loads.get('b').resolve('b');await tick();assert.equal(frames.at(-1).current,'a','stale loads never overwrite a newer Cast selection');loads.get('c').resolve('c');await tick();assert.equal(frames.at(-1).previous,'a');assert.equal(frames.at(-1).current,'c');
 clock+=480;for(const[id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn()}assert.equal(frames.at(-1).previous,'','old layers retire after the fade');
 transition.setSource('d');transition.dispose();const count=frames.length;loads.get('d').resolve('d');await tick();assert.equal(frames.length,count);assert.equal(timers.size,0,'unmount removes pending fades');
 const images=[],decode=deferred(),doc={createElement:()=>{const image={decode:()=>decode.ready};images.push(image);return image}};
 const loaded=api.prepareArtwork('large','small',doc);let ready=false;loaded.ready.then(()=>ready=true);const work=images[0].onload();await tick();assert.equal(ready,false,'decode must finish before the cover is promoted');decode.resolve();await work;await tick();assert(ready);loaded.cancel();assert.equal(timers.size,0);
 const fallback=api.prepareArtwork('broken','small',doc);images.at(-1).onerror();assert.equal(images.at(-1).src,'small');await images.at(-1).onload();assert.equal(await fallback.ready,'small');fallback.cancel();
 console.log('PASS decoded cover promotion, fallback, bounded layers, rapid skips, stale-load rejection, fade retirement and teardown');
})().catch(error=>{console.error(error);process.exitCode=1});


const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const backdropSource=fs.readFileSync('src/components/ArtworkBackdrop.tsx','utf8');
assert.equal((backdropSource.match(/ref=\{(?:firstRef|secondRef)\}/g)||[]).length,2,'fullscreen uses only two moving surfaces');
assert.doesNotMatch(backdropSource,/filter:'blur|feTurbulence|requestAnimationFrame/,'motion has no costly blur or frame loop');
assert.match(backdropSource,/rgba\(5,8,14,\.30\)/,'lyrics retain a restrained contrast shade');
const api={}, timers=new Map(), records=[];
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/ArtworkBackdrop.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
 exports:api,require:n=>n.endsWith('visualDiagnostics')?{recordVisualDiagnostic:(...v)=>records.push(v)}:{},
 setTimeout:fn=>{const id=timers.size+1;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id)
});
let preference,visibility,removed=0,rule='',transform='matrix(1.14)',time=0;
const reduced={matches:false,addEventListener:(_,fn)=>preference=fn,removeEventListener:()=>preference=null};
const declarations={};
const doc={visibilityState:'hidden',head:{appendChild(s){rule=s.textContent}},createElement:()=>({textContent:'',remove(){removed++}}),defaultView:{matchMedia:()=>reduced,getComputedStyle:()=>({transform})}};
const element={ownerDocument:doc,style:{setProperty:(k,v,priority)=>{assert.equal(priority,'important');declarations[k]=v},removeProperty:k=>delete declarations[k]},getAnimations:()=>[{currentTime:time,playState:'running'}]};
doc.hidden=true;
doc.addEventListener=(_,fn)=>visibility=fn;
doc.removeEventListener=()=>visibility=null;
const cleanup=api.startArtworkMotion(element);
assert.equal(declarations['animation-play-state'],'paused');
doc.hidden=false;visibility();
assert.equal(declarations['animation-play-state'],'running');
assert(rule.includes('@keyframes ytm-artwork-drift'));
assert(declarations.animation.includes('28s'),'full screen CSS motion does not depend on hidden document flags');
timers.get(1)(); transform='matrix(1.16)';time=2000;timers.get(2)();
assert(records.at(-1)[1].includes('changed=true; clock=true'));
reduced.matches=true;preference();assert.equal(declarations.animation,'none');
reduced.matches=false;preference();assert(declarations.animation.includes('28s'));
cleanup();assert.equal(timers.size,0);assert.equal(removed,1);assert.equal(preference,null);assert.equal(visibility,null);assert.equal(declarations.animation,undefined);
assert.doesNotMatch(backdropSource,/atmosphereCompanion|hue =|saturation =/,'fullscreen never invents colors absent from the cover');
console.log('PASS CSS motion owns mounted document, observes elapsed motion, honors reduced motion and cleans up');

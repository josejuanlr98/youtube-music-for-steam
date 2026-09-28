const assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const api={}; let now=0,tick,disposed=false;
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/lyricsScroll.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api,Date:{now:()=>now},setInterval:fn=>{tick=fn;return 1},clearInterval:()=>disposed=true});
const el={scrollTop:0,scrollHeight:200,clientHeight:100,ownerDocument:{visibilityState:'visible'}};
const motion=api.startLyricsScroll(el);
function advance(ms){for(let i=0;i<ms;i+=50){now+=50;tick()}}
advance(3000);assert(el.scrollTop>10);
motion.pause();el.scrollTop=50;advance(2950);assert.equal(el.scrollTop,50);advance(100);assert(el.scrollTop>50);
while(el.scrollTop<100) advance(50);
advance(4950);assert.equal(el.scrollTop,100);advance(50);assert.equal(el.scrollTop,0);advance(3000);assert(el.scrollTop>0);
el.ownerDocument.visibilityState='hidden';const before=el.scrollTop;advance(3000);assert.equal(el.scrollTop,before);
motion.dispose();assert(disposed);
console.log('PASS automatic reading loops, waits three seconds after manual input, pauses when hidden and cleans up');

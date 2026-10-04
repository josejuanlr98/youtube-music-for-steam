const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/artworkPalette.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {
  exports:api, require:()=>({}), Uint8ClampedArray, URL,
});
const grayscale = api.extractAccent(new Uint8ClampedArray([0,0,0,255,255,255,255,255]));
assert.notEqual(grayscale,api.defaultAccent);
assert.equal(new Set(grayscale.split(',').map(Number)).size,1,'black and white artwork remains achromatic');
assert.equal(api.extractAccent(new Uint8ClampedArray([255,0,0,0])),api.defaultAccent);
const pixels = new Uint8ClampedArray([180,40,30,255,185,45,31,255,40,40,180,255]);
const [r,g,b] = api.extractAccent(pixels).split(',').map(Number);
assert(r>g && r>b,'dominant warm cover produces warm accent');
assert(Math.max(r,g,b)>=190,'accent is bright enough for dark backgrounds');
assert(Math.max(r,g,b)-Math.min(r,g,b)>=80,'accent preserves the cover saturation');
console.log('PASS palette ignores invisible/extreme pixels and produces a readable dominant accent');

assert.equal(api.paletteArtworkUrl('https://i.ytimg.com/vi/abc/maxresdefault.jpg?test=1'), 'https://i.ytimg.com/vi/abc/hqdefault.jpg');
assert.equal(api.paletteArtworkUrl('https://lh3.googleusercontent.com/art=w1200-h1200-l90-rj'), 'https://lh3.googleusercontent.com/art=w128-h128-l90-rj');
assert.equal(api.paletteArtworkUrl('https://example.org/art.jpg'), 'https://example.org/art.jpg');

(async()=>{
  const module={},events=[],revoked=[],requests=[];
  let failProxy=false;
  const doc={defaultView:{URL:{createObjectURL:()=> 'blob:local-cover',revokeObjectURL:u=>revoked.push(u)}},createElement:tag=>tag==='canvas'?{
    getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([208,128,32,255])})})
  }:{set src(url){queueMicrotask(()=>url.startsWith('blob:')?this.onload():this.onerror(new Error('CORS blocked')));}}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/artworkPalette.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports:module,require:n=>n==='@decky/api'?{fetchNoCors:async url=>{requests.push(url);if(failProxy)throw new Error('Offline');return {ok:true,blob:async()=>({type:'image/png',size:100})};},call:async()=>({})}:n.endsWith('visualDiagnostics')?{recordVisualDiagnostic:(a,d)=>events.push([a,d])}:{},
    Uint8ClampedArray,URL,AbortController,setTimeout,clearTimeout
  });
  const color=await module.artworkAccent('https://i.ytimg.com/vi/song/maxresdefault.jpg',doc);
  assert.notEqual(color,module.defaultAccent);
  assert.equal(requests[0],'https://i.ytimg.com/vi/song/hqdefault.jpg');
  assert.deepEqual(revoked,['blob:local-cover'],'release image memory after palette sampling');
  assert(events.some(([,d])=>d.includes('Decky image OK')));
  failProxy=true;
  assert.equal(await module.artworkAccent('https://i.ytimg.com/vi/other/maxresdefault.jpg',doc),module.defaultAccent,'offline/CORS failures safely fall back');
  assert(events.some(([,d])=>d==='all image methods failed'));
  console.log('PASS Cast palette uses bounded proxy image, releases blob and reports failed fallback');
})().catch(e=>{console.error(e);process.exitCode=1});

const multicolor = api.extractPalette(new Uint8ClampedArray([200,40,35,255,40,160,65,255,35,70,190,255]));
assert.equal(multicolor.length,3);assert.equal(new Set(multicolor).size,3,'distinct cover colors survive palette extraction');
const monochrome = api.extractPalette(new Uint8ClampedArray([190,60,30,255]));
assert.equal(monochrome.length,3);
for (const color of monochrome) { const [r,g,b]=color.split(',').map(Number);assert(r>g&&g>b,'fallback shades preserve the cover hue'); }

const paletteSource = fs.readFileSync('src/services/artworkPalette.ts','utf8');
assert.doesNotMatch(paletteSource,/cache\.get\(url\) \|\| previous\.palette/,'a new song never renders the previous cover palette');
assert.doesNotMatch(paletteSource,/cache\.get\(url\) \|\| value\.palette/,'render-time URL changes use the neutral palette immediately');
assert.match(paletteSource,/cache\.get\(url\) \|\| defaultPalette/,'uncached artwork uses the intentional Nothing-playing palette');
console.log('PASS palette transitions cannot leak the previous song color');
const stored={},colors=['210, 100, 70','100, 55, 45','65, 35, 25'];
vm.runInNewContext(ts.transpileModule(paletteSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports:stored,require:name=>name==='react'?{useState:initial=>[initial,()=>{}],useEffect(){}}:{},
  localStorage:{getItem:()=>JSON.stringify([['cover',colors],['bad',['999, 1, 2','0, 0, 0','0, 0, 0']]])},
});
assert.equal(stored.artworkPaletteReady('cover'),true);
assert.equal(stored.artworkPaletteReady('bad'),false,'invalid persisted colors are rejected');
assert.deepEqual(Array.from(stored.useArtworkPalette('cover')),colors,'persisted cover colors are available in the first render');
console.log('PASS artwork palettes survive reload and are ready on first render');

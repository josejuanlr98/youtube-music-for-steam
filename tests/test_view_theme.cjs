const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,modules={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>modules[n]||{}});
 return exports;
}
const {lyricsSource}=load('src/services/lyricsSource.ts');
for(const source of ['Musixmatch','Source: Musixmatch',' Source: Source: Musixmatch ','source: Fuente: Musixmatch'])assert.equal(lyricsSource(source),'Musixmatch');
assert.equal(lyricsSource('Source: '),'');assert.equal(lyricsSource(null),'');assert.equal(lyricsSource('LRCLIB'),'LRCLIB');
const {attachViewTheme}=load('src/components/ThemeScope.tsx',{'../theme':{themeCss:'test theme'}});
const {themeCss}=load('src/theme.ts');
assert.match(themeCss,/ytm-rating-button:focus[^}]*outline:none/);
assert.match(themeCss,/ytm-rating-button \{[^}]*border-color:rgba\(var\(--ytm-cover-accent\),\.25\)/,'rating controls share the player accent border');
assert.match(themeCss,/ytm-lyrics-view:not\(\.ytm-immersive\) \.ytm-reader \{[^}]*border:0 !important/,'compact lyrics has no nested bubble outline');
assert.match(themeCss,/ytm-compact-slider \.gpfocus[^}]*border-radius:8px/);
const makeDoc=()=>{const nodes=[];return {nodes,head:{appendChild:s=>nodes.push(s)},createElement:()=>({dataset:{},style:{setProperty(...args){assert.deepEqual(args,['display','none','important'])}},remove(){nodes.splice(nodes.indexOf(this),1)}})}};
const a=makeDoc(),b=makeDoc();const releaseA=attachViewTheme(a),releaseA2=attachViewTheme(a),releaseB=attachViewTheme(b);
assert.equal(a.nodes.length,1);assert.equal(b.nodes.length,1);assert.equal(b.nodes[0].textContent,'test theme');
releaseA();releaseA();assert.equal(a.nodes.length,1);releaseA2();assert.equal(a.nodes.length,0);assert.equal(b.nodes.length,1);releaseB();assert.equal(b.nodes.length,0);
console.log('PASS source normalization and separate-document theme ownership, sharing and cleanup');

const rowFocus=load('src/services/mediaRowFocus.ts');
const doc={},otherDoc={};
const makeRow=ownerDocument=>({ownerDocument,attrs:new Map(),setAttribute(name,value){this.attrs.set(name,value);},removeAttribute(name){this.attrs.delete(name);},contains(target){return target===this.child;}});
const first=makeRow(doc),second=makeRow(doc),other=makeRow(otherDoc);
rowFocus.focusMediaRow(first);rowFocus.focusMediaRow(other);
for(let i=0;i<100;i++){
 rowFocus.focusMediaRow(second);rowFocus.blurMediaRow(first);
 assert.equal(first.attrs.size,0);assert.equal(second.attrs.get('data-ytm-row-focused'),'true','late blur from the old row cannot clear the new row');
 rowFocus.focusMediaRow(first);rowFocus.blurMediaRow(second);
 assert.equal(second.attrs.size,0);assert.equal(first.attrs.get('data-ytm-row-focused'),'true');
}
assert.equal(other.attrs.get('data-ytm-row-focused'),'true','separate Steam documents have independent focus owners');
rowFocus.blurMediaRow(first);rowFocus.blurMediaRow(null);rowFocus.focusMediaRow(null);assert.equal(first.attrs.size,0);
const effects=[],refs=[];
const media=load('src/components/MediaRow.tsx',{
 'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
 react:{useRef:()=>{const ref={current:null};refs.push(ref);return ref;},useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn)},
 '@decky/ui':{Focusable:'row',DialogButton:'button'},'../services/mediaRowFocus':rowFocus,
 '../services/artworkPalette':{useArtworkAccent:()=> '80,100,120',defaultAccent:'125,145,165'},
}).MediaRow({title:'Song',subtitle:'Artist',onPlay(){}});
refs[0].current=first;effects.forEach(fn=>fn());
assert.equal(media.props.noFocusRing,true);
media.props.onFocusCapture();assert.equal(first.attrs.get('data-ytm-row-focused'),'true');
first.child={};media.props.onBlurCapture({currentTarget:first,relatedTarget:first.child});assert.equal(first.attrs.size,1,'moving into an action keeps the row highlighted');
media.props.onBlurCapture({currentTarget:first,relatedTarget:null});assert.equal(first.attrs.size,0);
media.props.onGamepadFocus();rowFocus.focusMediaRow(second);media.props.onGamepadBlur();assert.equal(first.attrs.size,0);assert.equal(second.attrs.size,1);
assert(!themeCss.includes('.ytm-media-row:focus-within'));assert(!themeCss.includes('.ytm-media-row:has(.gpfocus)'),'stale Steam/DOM focus cannot paint previous cards');
assert.match(themeCss,/ytm-media-row[^}]*transition:none !important; animation:none !important/);
console.log('PASS rapid gamepad/native focus transfers leave exactly one highlighted row, ignore stale blur and suppress inherited glow transitions');

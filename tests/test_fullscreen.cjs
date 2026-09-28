const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const effects = [];
let resolveLock, released = 0, unblocked = 0, requests = 0, backs = 0, reopened = 0, returned = 0;
let next = 0, previous = 0, toggled = 0;
const document = {visibilityState:'visible', addEventListener(){}, removeEventListener(){}};
const modules = {
 'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
 'react':{useState:v=>[typeof v==='function'?v():v,()=>{}],useRef:()=>({current:null}),useEffect:fn=>effects.push(fn)},
 '@decky/ui':{Focusable:'div',DialogButton:'button',Navigation:{NavigateBack(){backs++},OpenQuickAccessMenu(){reopened++}},GamepadButton:{BUMPER_LEFT:5,BUMPER_RIGHT:6,DIR_UP:9,DIR_DOWN:10},QuickAccessTab:{Decky:1}},
 'react-icons/fa':{}, 'react-icons/md':{}, 'react-icons/si':{}, '../services/lyricsScroll':{}, '../services/syncedLyrics':{}, '../services/notifications':{},
 '../services/audioManager':{getIsCastConnected:()=>false, getCastSenderName:()=>null, addCastConnectionListener:()=>()=>{}, getCurrentTrack:()=>({videoId:'test',title:'Test'}),getProgress:()=>({position:45}),addProgressListener(){},addTrackChangeListener(){},playNext:async()=>{next++},playPrevious:async()=>{previous++},togglePlayback:()=>{toggled++}},
 '../services/lyrics':{},'../services/focus':{},
 '../services/artworkPalette':{useArtworkPalette:()=> ['180,202,220','72,101,137','43,66,96']},'./ArtworkBackdrop':{ArtworkBackdrop:'backdrop'},
 './ThemeScope':{ThemeScope:'theme'},'./OverflowText':{OverflowText:'overflow-text'},'../services/lyricsSource':{lyricsSource:s=>s}
};
const result = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/LyricsPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
 exports:result,require:n=>modules[n],document,navigator:{wakeLock:{request:()=>{requests++;return new Promise(resolve=>resolveLock=resolve)}}},
 Event:class {constructor(type){this.type=type}}, window:{dispatchEvent(event){assert.equal(event.type,'ytm-return-player'); returned++},SuspendResumeStore:{BlockSuspendAction:()=>()=>unblocked++}},setTimeout
});
(async()=>{
 const root = result.LyricsPanel({fullScreen:true});
 const event = (button,repeat=false) => ({detail:{button,is_repeat:repeat},preventDefault(){},stopPropagation(){}});
 root.props.onButtonDown(event(6));
 root.props.onButtonDown(event(6));
 await new Promise(resolve=>setTimeout(resolve,0));
 root.props.onButtonDown(event(6,true));
 assert.equal(next,1,'held bumper and in-flight skip must not skip many songs');
 root.props.onButtonDown(event(5)); await new Promise(resolve=>setTimeout(resolve,0)); assert.equal(previous,1);
 root.props.onOKButton(event(1)); assert.equal(toggled,1);
 const nodes = node => !node || typeof node !== 'object' ? [] : [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
 assert.equal(nodes(root).some(n=>n.type==='button' && n.props.preferredFocus),false,'fullscreen has no Exit button');
 assert.equal(root.props.preferredFocus,true,'initial focus belongs to fullscreen controls');
 root.props.onOKButton(event(1)); assert.equal(toggled,2); assert.equal(backs,0,'A on initial focus pauses instead of exiting');
 const cleanup=effects[3]();
 assert.equal(requests,1);
 cleanup(); assert.equal(unblocked,1);
 resolveLock({release:async()=>{released++}});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(released,1,'wake lock resolving after exit must be released');
 root.props.onCancelButton({preventDefault(){},stopPropagation(){}});
 root.props.onCancelButton({preventDefault(){},stopPropagation(){}});
 assert.equal(backs,1); assert.equal(returned,1);
 await new Promise(resolve=>setTimeout(resolve,230));
 assert.equal(reopened,1);
 console.log('PASS fullscreen transport, repeat guards, initial A, wake-lock cleanup and B returning exactly once');
})().catch(e=>{console.error(e);process.exitCode=1});

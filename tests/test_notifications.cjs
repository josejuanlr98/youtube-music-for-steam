const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/services/notifications.tsx'), 'utf8');
const exportsObject = {};
const listeners = {};
let stored = { connections:true, tracks:true, connectionSound:false, trackSound:false };
const toasts = [];
let dismissed = 0;
const sounded = [];
const queued = [];
// Model Steam's queued-toast path: it reselects sound by notification type,
// ignoring the per-toast playSound setting unless our playback guard stops it.
const originalSound = function(notification) { assert.equal(this, notificationStore); sounded.push(notification); return 'played'; };
const notificationStore = { PlayNotificationSound:originalSound };
const patcher = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../node_modules/@decky/ui/src/utils/patcher.ts'), 'utf8'), {
  compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 }
}).outputText, { exports:patcher, console:{ debug:() => {} } });
const flushSounds = () => { while (queued.length) notificationStore.PlayNotificationSound(queued.shift()); };
const timers = new Map();
const listen = key => fn => { listeners[key] = fn; return () => { delete listeners[key]; }; };
class DeckyToaster {
  toast(data) {
    assert.equal(this, sharedToaster);
    toasts.push(data); queued.push({ decky:true, data, eType:31 });
    return { data, dismiss:() => { dismissed++; } };
  }
}
const sharedToaster = new DeckyToaster();
const testWindow = { NotificationStore:notificationStore, DeckyPluginLoader:{ toaster:sharedToaster } };
const modules = {
  '@decky/api': { call:async (method, value) => { if (method.startsWith('set_')) stored = value; return { ...stored }; },
    toaster:{ toast:data => sharedToaster.toast(data) } },
  '@decky/ui':patcher,
  'react/jsx-runtime':{ jsx:(type, props) => ({ type, props }) },
  'react-icons/si':{ SiYoutubemusic:'icon' },
  './audioManager':{ addPlaybackStartedListener:listen('playing'), addSenderConnectedListener:listen('sender'), addTrackChangeListener:listen('track') },
};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions:{ module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2022 } }).outputText, {
  exports:exportsObject, require:name => { assert(name in modules, name); return modules[name]; }, console, window:testWindow,
  setTimeout:fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout:id => timers.delete(id),
});
(async () => {
  const stop = exportsObject.initNotifications();
  await exportsObject.loadNotificationSettings();
  assert.equal(toasts.length, 0);
  listeners.sender('Desktop');
  assert.equal(toasts[0].title.props.children, 'Desktop');
  assert.equal(toasts[0].body.props.children, 'Connected · YouTube Music');
  assert.equal(toasts[0].playSound, false);
  const track = { videoId:'one', title:'Song', artist:'Artist', albumArt:'https://example.test/art.jpg' };
  listeners.playing(track);
  assert.equal(toasts[1].title.props.children, 'Song'); assert.equal(toasts[1].body.props.children, 'Artist');
  assert.equal(toasts[1].logo.props.src, track.albumArt); assert.equal(toasts[1].playSound, false);
  flushSounds(); assert.equal(sounded.length, 0, 'silent defaults must suppress actual Steam sound playback');
  listeners.playing(track); listeners.playing(track);
  assert.equal(toasts.length, 2, 'resume and repeated state/stream messages must not duplicate a song');
  await exportsObject.saveNotificationSettings({ ...stored, tracks:false, connectionSound:true });
  listeners.playing({ ...track, videoId:'two' });
  assert.equal(toasts.length, 2);
  listeners.sender('Tablet'); assert.equal(toasts.at(-1).playSound, true);
  flushSounds(); assert.equal(sounded.length, 1);
  await exportsObject.saveNotificationSettings({ ...stored, tracks:true, trackSound:true, connections:false });
  listeners.sender('Muted device'); assert.equal(toasts.length, 3);
  listeners.playing({ ...track, videoId:'three' }); assert.equal(toasts.at(-1).playSound, true);
  flushSounds(); assert.equal(sounded.length, 2);
  await exportsObject.saveNotificationSettings({ ...stored, connections:true, connectionSound:false, trackSound:true });
  listeners.sender('Silent device');
  listeners.playing({ ...track, videoId:'four' });
  flushSounds(); assert.equal(sounded.length, 3, 'connection and song sound preferences are independent');
  await exportsObject.saveNotificationSettings({ ...stored, connectionSound:true, trackSound:false });
  listeners.sender('Audible device');
  listeners.playing({ ...track, videoId:'five' });
  flushSounds(); assert.equal(sounded.length, 4, 'turning song sound off must take effect immediately');
  await exportsObject.saveNotificationSettings({ ...stored, connectionSound:false });
  listeners.sender('Queued silent');
  await exportsObject.saveNotificationSettings({ ...stored, connectionSound:true });
  flushSounds(); assert.equal(sounded.length, 4, 'queued notifications retain the setting used when created');
  assert.equal(notificationStore.PlayNotificationSound({ eType:31, data:{} }), 'played');
  assert.equal(notificationStore.PlayNotificationSound({ decky:true, data:{ playSound:false } }), 'played');
  assert.equal(sounded.length, 6, 'Steam achievements and other plugins are untouched');
  assert(dismissed > 0, 'fast events must bound active toasts');
  let chats = 0,nativeMode=false;const safeRouted=[];
  // Reproduce Steamcord's own-property replacement (it returns undefined).
  const reroute = data => {
    chats++;
    if(nativeMode)return DeckyToaster.prototype.toast.call(sharedToaster,data);
    const str=value=>typeof value==='string'?value:value==null?'':'Notification';
    safeRouted.push({title:str(data.title)||'Decky',body:str(data.body),quiet:true});toasts.push(data);
    return undefined;
  };
  sharedToaster.__steamcordSafe = 2;
  sharedToaster.toast = reroute;
  listeners.playing({ ...track, videoId:'with-steamcord' });
  assert.equal(chats, 1,'YouTube notifications use Steamcord safe routing instead of bypassing it');
  assert.deepEqual(safeRouted.at(-1),{title:'YouTube Music · Song',body:'Artist',quiet:true});
  assert.equal(toasts.at(-1).logo.props.src, track.albumArt);
  flushSounds(); assert.equal(sounded.length, 6, 'Steamcord safe routing stays silent');
  assert.equal(sharedToaster.toast, reroute, 'other plugins retain their existing routing');
  sharedToaster.toast({ title:'Other plugin' }); assert.equal(chats, 2);assert.equal(safeRouted.at(-1).title,'Other plugin');
  stop(); assert.equal(Object.keys(listeners).length, 0); assert.equal(timers.size, 0);
  assert.equal(notificationStore.PlayNotificationSound, originalSound, 'unload restores native sound playback');
  const stopAgain = exportsObject.initNotifications();
  await exportsObject.loadNotificationSettings();
  const beforeManualPick = toasts.length;
  exportsObject.suppressPlaybackNotification('picked-in-library');
  listeners.playing({ ...track, videoId:'picked-in-library' });
  assert.equal(toasts.length, beforeManualPick, 'a song selected inside Library stays quiet');
  listeners.playing({ ...track, videoId:'automatic-next' });
  assert.equal(toasts.length, beforeManualPick + 1, 'the following automatic song change still notifies');
  listeners.playing({ ...track, videoId:'selected-from-search' }, true);
  listeners.playing({ ...track, videoId:'selected-from-playlist' }, true);
  assert.equal(toasts.length, beforeManualPick + 1, 'manual playback from Search and playlists never notifies');
  listeners.playing({ ...track, videoId:'next-after-selection' }, false);
  assert.equal(toasts.length, beforeManualPick + 2, 'automatic advancement after a manual selection notifies');
  listeners.sender('Steamcord loaded first');
  assert.equal(toasts.at(-1).title, 'YouTube Music · Steamcord loaded first');
  assert.equal(safeRouted.at(-1).body,'Connected · YouTube Music','works regardless of plugin load order');
  const beforeFullscreen = toasts.length;
  const resumeNotifications = exportsObject.suppressFullscreenNotifications();
  listeners.sender('Hidden in fullscreen');
  listeners.playing({ ...track, videoId:'fullscreen-song' });
  assert.equal(toasts.length, beforeFullscreen, 'fullscreen drops new alerts');
  resumeNotifications(); resumeNotifications();
  listeners.sender('Visible after exit');
  assert.equal(toasts.length, beforeFullscreen + 1, 'exit restores saved notification preferences');
  let visible = true;
  const panel = { isConnected:true, parentElement:null, getAttribute:()=>null,
    ownerDocument:{ visibilityState:'visible', defaultView:{ innerWidth:1280, innerHeight:800, getComputedStyle:()=>({ display:visible ? 'block' : 'none' }) } },
    getClientRects:()=>[{}], getBoundingClientRect:()=>({ top:80,left:800,bottom:700,right:1250 }) };
  const unregister = exportsObject.registerNotificationPanel(panel);
  const beforePanel = toasts.length;
  listeners.sender('Visible panel'); listeners.playing({ ...track, videoId:'panel-song' });
  assert.equal(toasts.length, beforePanel, 'visible tab suppresses both notification types');
  visible = false;
  listeners.sender('Hidden mounted panel');
  assert.equal(toasts.length, beforePanel + 1, 'hidden mounted tab does not suppress notifications');
  visible = true;
  unregister();
  listeners.sender('Panel closed');
  assert.equal(toasts.length, beforePanel + 2, 'unmount restores notifications');
  // Native opt-in still preserves our sound preference if Steamcord replaced
  // the sound method outright after YouTube Music installed its patch.
  nativeMode=true;
  const steamcordSound=function(notification){return originalSound.call(this,notification);};
  notificationStore.PlayNotificationSound=steamcordSound;
  const beforeSounds=sounded.length;
  listeners.playing({...track,videoId:'steamcord-native-opt-in'},false);flushSounds();
  assert.equal(sounded.length,beforeSounds,'native opt-in keeps our silent song setting after a foreign replacement');
  notificationStore.PlayNotificationSound({eType:2,data:{}});assert.equal(sounded.length,beforeSounds+1,'other plugin sounds still pass through');
  stopAgain();assert.equal(notificationStore.PlayNotificationSound,steamcordSound,'cleanup preserves Steamcord sound routing');
  const stopThird=exportsObject.initNotifications();await exportsObject.loadNotificationSettings();
  listeners.sender('Before foreign overwrite');
  const replacement=()=> 'foreign sound';notificationStore.PlayNotificationSound=replacement;
  stopThird();assert.equal(notificationStore.PlayNotificationSound,replacement,'unload cannot unpatch an unrelated method installed outside the Decky chain');
  console.log('PASS notifications: silent defaults, independent toggles/sounds, metadata, deduplication, bounded toasts and cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });

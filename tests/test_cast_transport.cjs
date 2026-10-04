const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
const defer = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };

function setup() {
  const sockets = [], calls = [], requests = [], timers = [], intervals = new Map(), events = {};
  let now = 100000, play = async () => {}, response = async () => null, rpc = async () => ({success:true});
  const audio = { style:{}, src:'', ended:false, paused:true, duration:180, currentTime:0,
    play:() => { audio.paused=false; return play(); }, pause:() => { audio.paused=true; },
    removeAttribute:() => { audio.src=''; }, load() {}, remove() {},
    addEventListener:(name,fn) => { events[name]=fn; }, removeEventListener:(name) => { delete events[name]; } };
  class Socket {
    static OPEN=1; readyState=1; sent=[];
    constructor() { sockets.push(this); }
    send(msg) { this.sent.push(JSON.parse(msg)); }
    close() {}
  }
  const api = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/services/audioManager.ts'),'utf8'), {
    compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports:api, require:() => ({ call:async (name,...args) => { calls.push(name); return rpc(name,...args); } }), console,
    document:{ getElementById:() => audio }, WebSocket:Socket, AbortController, Date:{now:()=>now},
    fetch:async url => { requests.push(url); return { ok:true, json:() => response(url) }; },
    setTimeout:(fn,ms) => { if (ms !== 45000 && ms !== 20000) timers.push(fn); return timers.length; }, clearTimeout() {},
    setInterval:fn => { const id=intervals.size+1; intervals.set(id,fn); return id; }, clearInterval:id => intervals.delete(id),
  });
  api.initAudio();
  return { api, audio, sockets, calls, requests, events, timers, intervals,
    advance:ms => { now += ms; for (const fn of intervals.values()) fn(); },
    play:fn => { play=fn; }, response:fn => { response=fn; }, rpc:fn => { rpc=fn; },
    message:(event,data) => sockets.at(-1).onmessage({ data:JSON.stringify({ event,data }) }) };
}
const track = (id) => ({ videoId:id, playbackId:`play-${id}`, title:id, url:`https://audio.test/${id}`, duration:180 });

(async () => {
  const relink = setup(), connected = [];
  relink.api.addSenderConnectedListener(name => connected.push(name));
  relink.message('senderConnected',{senderName:'Phone'});
  relink.message('connection',{phoneConnected:true,senderName:'Phone'});
  relink.response(async () => ({ok:true}));
  await relink.api.stopAllPlayback();
  relink.message('connection',{phoneConnected:true,senderName:'Phone'});
  relink.message('senderConnected',{senderName:'Phone'});
  assert.equal(connected.length,2,'relink notifies once even if connection precedes sender event');
  await relink.api.stopAllPlayback();
  relink.response(async url => url.endsWith('/api/state') ? {connected:true,senderName:'Phone'} : {ok:true});
  relink.sockets[0].onopen(); await tick();
  assert.equal(connected.length,3,'snapshot recovers a missed relink event');
  relink.api.destroyAudio();
  const volume = setup();
  volume.message('connection',{phoneConnected:true});
  const changes=[]; volume.api.addVolumeListener(value=>changes.push(value));
  volume.message('volume',{value:37,muted:false});
  assert.equal(volume.audio.volume,.37);
  assert.equal(changes.at(-1),37);
  volume.message('volume',{value:37,muted:true});
  assert.equal(volume.audio.muted,true);
  assert.equal(changes.at(-1),0);
  volume.api.setAudioVolume(60);
  assert.equal(volume.audio.muted,false);
  assert.equal(volume.audio.volume,.6);
  assert(volume.requests.some(url=>url.endsWith('/api/volume')));
  volume.api.destroyAudio();
  const stalled = setup();
  stalled.message('track',track('stalled')); await tick();
  stalled.advance(19000);
  assert(!stalled.sockets[0].sent.some(m=>m.event==='playbackError'));
  stalled.advance(1000);
  assert.equal(stalled.sockets[0].sent.filter(m=>m.event==='playbackError').length,1);
  stalled.audio.currentTime=5;
  stalled.advance(1000);
  stalled.advance(19000);
  assert.equal(stalled.sockets[0].sent.filter(m=>m.event==='playbackError').length,1);
  stalled.api.destroyAudio();
  const s=setup();
  s.message('connection',{ phoneConnected:true, senderName:'Phone' });
  s.message('track',track('one')); await tick();
  assert(s.sockets[0].sent.some(m => m.event==='playing' && m.data.playbackId==='play-one'));
  s.sockets[0].readyState=3; s.sockets[0].onclose();
  assert.equal(s.api.getIsCastConnected(),true,'local transport loss must not switch Queue to local mode');
  await s.api.playNext();
  assert(s.requests.some(url => url.endsWith('/api/next')));
  assert(!s.calls.includes('next_track'),'transport outage must never switch to the local queue');
  s.audio.ended=true; s.events.ended();
  assert(!s.calls.includes('track_ended'));
  s.timers.shift()();
  s.response(async url => url.endsWith('/api/state') ? { connected:true, track:track('one'), isPlaying:true } : null);
  s.sockets[1].onopen(); await tick();
  assert(s.sockets[1].sent.some(m => m.event==='ended' && m.data.playbackId==='play-one'),'reconnect replays pending end for the same playback only');
  s.audio.ended=false;
  s.message('track',track('two')); await tick();
  for (const fn of s.intervals.values()) fn();
  assert.equal(s.sockets[1].sent.at(-1).data.playbackId,'play-two');
  s.api.destroyAudio();

  const race=setup(), old=defer();
  race.play(() => old.promise);
  race.message('track',track('old'));
  race.play(async () => {});
  race.message('track',track('new')); await tick();
  old.reject(Error('interrupted by next song')); await tick();
  assert.equal(race.api.getCurrentTrack().videoId,'new');
  assert.equal(race.api.getIsPlaying(),true);
  assert(!race.sockets[0].sent.some(m => m.event==='playbackError'),'rejected old play must not retry the new song');
  const late=defer(); race.play(() => late.promise);
  race.message('track',track('paused'));
  race.message('state',{ isPlaying:false }); late.resolve(); await tick();
  assert.equal(race.api.getIsPlaying(),false,'pause while loading must win over late play resolution');
  race.api.destroyAudio();

  const stale=setup(), snapshot=defer();
  stale.response(url => url.endsWith('/api/state') ? snapshot.promise : Promise.resolve(null));
  stale.sockets[0].onopen();
  stale.message('track',track('latest')); await tick();
  snapshot.resolve({ connected:true, track:track('outdated'), isPlaying:true }); await tick();
  assert.equal(stale.api.getCurrentTrack().videoId,'latest');
  stale.api.destroyAudio();
  const local=setup();
  local.rpc(async name => name==='get_current_track' ? track('local') : {success:true});
  await local.api.playTrack(track('local'));
  local.audio.currentTime=42;
  local.message('state',{isPlaying:false});
  local.message('stop',{});
  local.message('queue',{tracks:[],position:-1});
  await tick();
  assert.equal(local.api.getCurrentTrack().videoId,'local','idle Cast receiver must not stop local playback');
  assert(!local.calls.includes('sync_cast_queue'),'idle receiver snapshot must not erase a local playlist');
  local.events.error(); await tick(); await tick();
  assert.equal(local.audio.currentTime,42,'retry keeps the playback position');
  local.events.error(); await tick();
  assert.equal(local.calls.filter(n=>n==='get_current_track').length,1,'broken audio must not loop extraction indefinitely');
  assert(local.calls.includes('skip_unplayable'),'second failed audio URL must try the next song');
  assert.equal(local.api.getIsPlaying(),false);
  local.api.destroyAudio();
  console.log('PASS local playback isolation, bounded audio recovery and preserved position');
  const endOfQueue=setup();
  await endOfQueue.api.playTrack(track('last'));
  endOfQueue.rpc(async name=>name==='next_track'?{stopped:true}:{success:true});
  await endOfQueue.api.playNext();
  assert.equal(endOfQueue.audio.paused,true,'Next at queue end must silence the existing song');
  assert.equal(endOfQueue.audio.src,'');
  assert.equal(endOfQueue.api.getCurrentTrack(),null);
  assert.equal(endOfQueue.api.getIsPlaying(),false);
  endOfQueue.api.resumePlayback();await tick();
  assert.equal(endOfQueue.audio.paused,true,'Play cannot resume an orphan stream without metadata');
  endOfQueue.api.destroyAudio();
  const resumeRace=setup();
  await resumeRace.api.playTrack(track('race'));
  resumeRace.api.pausePlayback();
  const pendingResume=defer();resumeRace.play(()=>pendingResume.promise);
  resumeRace.api.resumePlayback();
  resumeRace.response(async()=>({ok:true}));
  await resumeRace.api.stopAllPlayback();
  pendingResume.resolve();await tick();
  assert.equal(resumeRace.api.getIsPlaying(),false,'late resume completion must not revive a stopped player');
  assert.equal(resumeRace.api.getCurrentTrack(),null);
  resumeRace.api.destroyAudio();
  console.log('PASS end-of-queue and delayed resume never leave orphan audio or revive stopped playback');
  const pick=setup(),starts=[];
  pick.api.addPlaybackStartedListener((song,manual)=>starts.push([song.videoId,manual]));
  pick.play(async()=>{throw Error('temporary audio failure');});
  await pick.api.playTrack(track('picked'));
  pick.rpc(async name=>name==='get_current_track'?track('picked'):name==='track_ended'?track('automatic'):{success:true});
  pick.play(async()=>{});
  pick.timers.shift()();await tick();
  assert.deepEqual(starts,[['picked',true]],'a manual song must remain silent after its stream retries');
  pick.api.pausePlayback();pick.api.resumePlayback();await tick();
  assert.equal(starts.at(-1)[1],true,'resuming a manually chosen song stays silent');
  pick.audio.ended=true;pick.events.ended();await tick();
  assert.deepEqual(starts.at(-1),['automatic',false],'the next automatic song still notifies');
  pick.api.destroyAudio();
  console.log('PASS manual selection stays silent through audio retries and resumes; automatic advancement notifies');
  console.log('PASS Cast transport: ownership during outage, replay after reconnect, playback IDs, stale responses and pause races');
})().catch(error => { console.error(error); process.exitCode=1; });

// Run without child processes: node tests/test_cast_lifecycle.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');

async function setup() {
  const state = { starts: 0, stops: 0, clears: 0, events: [], timers: [], failStart: false, holdStop: null, now: 0, network: {name:'Home',uuid:'network-id',type:'wifi'}, receivers: [], delayed: [], volumes: [], failVolume: false, volumeRead: null };
  const server = new EventEmitter();
  server.listen = (_port, _host, cb) => cb();
  const modules = {
    'node:http': { createServer: () => server },
    'yt-cast-receiver': class extends EventEmitter {
      senders=[];
      constructor(){super();state.receivers.push(this);}
      async start() { state.starts++; if (state.failStart) { state.failStart = false; throw Error('temporary failure'); } }
      async stop() { state.stops++; if (state.holdStop) await state.holdStop; }
      getConnectedSenders() { return this.senders; }
    },
    './CastPlayer.js': { CastPlayer: class {
      queue = new EventEmitter();
      clearOnDisconnect() { state.clears++; }
      markSenderActivity(){}
      getPlaybackId(){return 'current';}
      async syncSender(){}
      isCurrentlyPlaying(){return false;}
      getSenderIdleMs(){return 0;}
      async setVolume(value){if(state.failVolume)throw Error('temporary volume failure');state.volumes.push(value.level);}
    } },
    './JsonDataStore.js': { JsonDataStore: class {
      async get(key) { return key === 'ssdp.uuid' ? 'persistent-id' : key === 'volume' ? state.volumeRead ? await state.volumeRead : {level:35,muted:false} : ['Home']; }
      async set() {}
      async remove() {}
      async flush() {}
    } },
    './wsManager.js': { WsManager: class {
      onMessage() {}
      broadcast(event, data) { state.events.push({ event, data }); }
    } },
    './httpServer.js': { handleRequest(_req, _res, ctx) { state.ctx = ctx; } },
    './ytdlp.js': { selfUpdate: async () => {} },
    './network.js': { getCurrentNetwork: async () => state.network },
  };
  const filename = path.resolve(__dirname, '../backend/src/server.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    require: name => name in modules ? modules[name] : require(name),
    exports: {}, __dirname: path.dirname(filename),
    process: { env: {}, on() {}, exit(code) { throw Error(`Unexpected exit ${code}`); } },
    console: { log() {}, error() {}, warn() {} },
    Date:{now:()=>state.now},
    setInterval(fn, ms) { state.timers.push({ fn, ms }); }, clearInterval() {}, setTimeout(fn,ms){state.delayed.push({fn,ms});return state.delayed.length;}, clearTimeout() {},
  }, { filename });
  for (let i = 0; i < 40; i++) await Promise.resolve();
  assert.equal(state.starts, 1);
  server.emit('request', {}, {});
  return state;
}

(async () => {
  let s = await setup();
  assert.equal(await s.ctx.disconnectCast(), true);
  assert.equal(s.starts, 2);
  assert.equal(s.stops, 1);
  assert.equal(s.clears, 1);
  assert.equal(s.events.at(-1).data.phoneConnected, false);
  console.log('PASS unlink restarts advertising and clears the session');

  s = await setup();
  await s.ctx.network.untrust();
  assert.equal(await s.ctx.disconnectCast(), true);
  assert.equal(s.starts, 1);
  console.log('PASS unlink respects untrusted networks');

  s = await setup();
  s.failStart = true;
  assert.equal(await s.ctx.disconnectCast(), true);
  s.timers.find(t => t.ms === 10000).fn();
  for (let i = 0; i < 40; i++) await Promise.resolve();
  assert.equal(s.starts, 3);
  console.log('PASS failed restart recovers on network poll');

  s = await setup();
  let finish;
  s.holdStop = new Promise(resolve => { finish = resolve; });
  const first = s.ctx.disconnectCast();
  const second = s.ctx.disconnectCast();
  await Promise.resolve();
  assert.equal(s.stops, 1);
  finish();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(s.stops, 1);
  assert.equal(s.starts, 2);
  console.log('PASS concurrent unlink requests share one stop and receiver restart');

  s = await setup();
  const poll=async(ms)=>{s.timers.find(t=>t.ms===ms).fn();for(let i=0;i<40;i++)await Promise.resolve();};
  s.network={name:'Office',uuid:'office-1',type:'wifi'};await poll(10000);
  assert.equal(s.stops,1);assert.equal(s.ctx.network.getCurrent().trusted,false);
  await s.ctx.network.trust();assert.equal(s.starts,2);
  s.network={...s.network,uuid:'office-2'};await poll(10000);
  assert.equal(s.stops,2);assert.equal(s.starts,3,'a trusted connection with a new UUID rebinds advertising');
  console.log('PASS network switching disables untrusted advertising and rebinds trusted interfaces');

  s = await setup();
  let active=s.receivers.at(-1);const phone={name:'Phone'};
  active.senders=[phone];active.emit('senderConnect',phone);
  assert.equal(s.ctx.isConnected(),true);assert.equal(s.ctx.senderName(),'Phone');
  active.senders=[];active.emit('senderDisconnect',phone,true);
  s.now=89999;await poll(30000);assert.equal(s.ctx.isConnected(),true,'temporary sender loss preserves the grace window');
  active.senders=[phone];active.emit('senderConnect',phone);s.now=90001;await poll(30000);
  assert.equal(s.clears,0,'reconnection preserves playback');
  active.senders=[];active.emit('senderDisconnect',phone,false);
  assert.equal(s.ctx.isConnected(),false);assert.equal(s.clears,1,'explicit disconnect clears immediately');
  console.log('PASS implicit disconnect/reconnect preserves the session; explicit disconnect clears it');

  s = await setup();
  const old=s.receivers.at(-1);old.senders=[phone];old.emit('senderConnect',phone);
  await s.ctx.disconnectCast();const count=s.events.length;
  old.emit('senderConnect',{name:'Late old sender'});old.emit('senderDisconnect',phone,false);
  assert.equal(s.events.length,count,'late old-receiver events cannot revive or clear the replacement session');
  await s.delayed.find(item=>item.ms===2000).fn();assert.equal(s.volumes.length,0,'old delayed volume work is discarded after restart');
  active=s.receivers.at(-1);active.senders=[phone];active.emit('senderConnect',phone);
  s.failVolume=true;await s.delayed.at(-1).fn();assert.equal(s.ctx.isConnected(),true,'volume failure is handled without taking down Cast');
  s.failVolume=false;active.emit('senderConnect',phone);await s.delayed.at(-1).fn();assert.deepEqual(s.volumes,[35]);
  let release;s.volumeRead=new Promise(resolve=>release=resolve);active.emit('senderConnect',phone);
  const lateVolume=s.delayed.at(-1).fn();await s.ctx.disconnectCast();release({level:70,muted:false});await lateVolume;
  assert.deepEqual(s.volumes,[35],'even a pending preference read cannot apply volume to a new session');
  console.log('PASS receiver generation guards reject stale events and delayed volume writes; volume errors remain contained');
})().catch(error => { console.error(error); process.exitCode = 1; });

// Run without child processes: node tests/test_cast_lifecycle.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');

async function setup() {
  const state = { starts: 0, stops: 0, clears: 0, events: [], timers: [], failStart: false, holdStop: null };
  const server = new EventEmitter();
  server.listen = (_port, _host, cb) => cb();
  const modules = {
    'node:http': { createServer: () => server },
    'yt-cast-receiver': class extends EventEmitter {
      async start() { state.starts++; if (state.failStart) { state.failStart = false; throw Error('temporary failure'); } }
      async stop() { state.stops++; if (state.holdStop) await state.holdStop; }
      getConnectedSenders() { return []; }
    },
    './CastPlayer.js': { CastPlayer: class {
      queue = new EventEmitter();
      clearOnDisconnect() { state.clears++; }
    } },
    './JsonDataStore.js': { JsonDataStore: class {
      async get(key) { return key === 'ssdp.uuid' ? 'persistent-id' : ['Home']; }
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
    './network.js': { getCurrentNetwork: async () => ({ name: 'Home', uuid: 'network-id', type: 'wifi' }) },
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
    setInterval(fn, ms) { state.timers.push({ fn, ms }); }, clearInterval() {}, setTimeout, clearTimeout,
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
})().catch(error => { console.error(error); process.exitCode = 1; });

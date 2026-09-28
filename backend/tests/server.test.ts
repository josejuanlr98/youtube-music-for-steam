import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({
  start: vi.fn(), stop: vi.fn(), clear: vi.fn(), broadcast: vi.fn(), remove:vi.fn(), flush:vi.fn(),
  getNetwork: vi.fn(), handle: vi.fn(), server: null as any,
  receiver:null as any, senders:[] as Array<{name:string}>, sync:vi.fn(),
}));
vi.mock('node:http', () => ({ default: { createServer: () => mocks.server } }));
vi.mock('yt-cast-receiver', () => ({ default: class extends EventEmitter {
  constructor(_player:unknown, options:any) {
    super(); mocks.receiver = this;
    expect(options.app.resetPlayerOnDisconnectPolicy).toBe('allExplicitlyDisconnected');
  }
  start = mocks.start;
  stop = mocks.stop;
  getConnectedSenders = () => mocks.senders;
} }));
vi.mock('../src/CastPlayer.js', () => ({ CastPlayer: class {
  queue = new EventEmitter();
  clearOnDisconnect = mocks.clear;
  markSenderActivity() {}
  getPlaybackId() { return 'active'; }
  syncSender = mocks.sync;
  isCurrentlyPlaying() { return true; }
  getSenderIdleMs() { return 0; }
  async setVolume() {}
} }));
vi.mock('../src/JsonDataStore.js', () => ({ JsonDataStore: class {
  async get(key: string) { return key === 'ssdp.uuid' ? 'persistent-id' : ['Home']; }
  async set() {}
  remove = mocks.remove;
  flush = mocks.flush;
} }));
vi.mock('../src/wsManager.js', () => ({ WsManager: class {
  onMessage() {}
  broadcast = mocks.broadcast;
} }));
vi.mock('../src/httpServer.js', () => ({ handleRequest: mocks.handle }));
vi.mock('../src/network.js', () => ({ getCurrentNetwork: mocks.getNetwork }));
vi.mock('../src/ytdlp.js', () => ({ selfUpdate: async () => {} }));

async function context() {
  await import('../src/server.js');
  // Drain startup's asynchronous datastore and network operations.
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(mocks.start).toHaveBeenCalledTimes(1);
  mocks.server.emit('request', {}, {});
  return mocks.handle.mock.calls[0][2];
}

describe('Unlink receiver lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.spyOn(process, 'on').mockReturnValue(process);
    mocks.server = new EventEmitter();
    mocks.server.listen = (_port: number, _host: string, ready: () => void) => ready();
    mocks.start.mockResolvedValue(undefined);
    mocks.stop.mockResolvedValue(undefined);
    mocks.senders = [];
    mocks.sync.mockResolvedValue(undefined);
    mocks.getNetwork.mockResolvedValue({ name: 'Home', uuid: 'network-id', type: 'wifi' });
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('advertises again after unlink on a trusted network', async () => {
    const ctx = await context();
    const oldReceiver = mocks.receiver;
    const pending = ctx.disconnectCast();
    await Promise.resolve();
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(await pending).toBe(true);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.broadcast).toHaveBeenCalledWith('connection', { phoneConnected: false, senderName: null });
    expect(mocks.remove).toHaveBeenCalledWith('mdxContext.cl');
    expect(mocks.remove).toHaveBeenCalledWith('mdxContext.m');
    expect(mocks.flush).toHaveBeenCalled();
    expect(mocks.receiver).not.toBe(oldReceiver);
    mocks.senders = [{name:'Phone'}];
    mocks.receiver.emit('senderConnect', mocks.senders[0]);
    expect(mocks.broadcast).toHaveBeenCalledWith('connection', { phoneConnected:true, senderName:'Phone' });
  });

  it('does not advertise on an untrusted network', async () => {
    const ctx = await context();
    await ctx.network.untrust();
    expect(await ctx.disconnectCast()).toBe(true);
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('recovers on the network poll when restart fails', async () => {
    const ctx = await context();
    mocks.start.mockRejectedValueOnce(new Error('temporary network failure'));
    expect(await ctx.disconnectCast()).toBe(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(mocks.start).toHaveBeenCalledTimes(3);
  });

  it('coalesces simultaneous unlink operations', async () => {
    const ctx = await context();
    let finish!: () => void;
    mocks.stop.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = ctx.disconnectCast();
    const second = ctx.disconnectCast();
    await Promise.resolve();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    finish();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });
  it('keeps playback through an implicit disconnect and resyncs on return', async () => {
    const ctx = await context();
    mocks.senders = [{name:'Phone'}];
    mocks.receiver.emit('senderConnect', mocks.senders[0]);
    mocks.senders = [];
    mocks.receiver.emit('senderDisconnect', {name:'Phone'}, true);
    expect(ctx.isConnected()).toBe(true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.clear).not.toHaveBeenCalled();
    mocks.senders = [{name:'Phone'}];
    mocks.receiver.emit('senderConnect', mocks.senders[0]);
    await vi.advanceTimersByTimeAsync(90000);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.sync).toHaveBeenCalledWith('active');
  });
  it('clears an explicit disconnect immediately and expires a missing sender', async () => {
    await context();
    mocks.senders = [{name:'Phone'}];
    mocks.receiver.emit('senderConnect', mocks.senders[0]);
    mocks.senders = [];
    mocks.receiver.emit('senderDisconnect', {name:'Phone'}, false);
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    mocks.receiver.emit('senderConnect', {name:'Phone'});
    mocks.receiver.emit('senderDisconnect', {name:'Phone'}, true);
    await vi.advanceTimersByTimeAsync(90000);
    expect(mocks.clear).toHaveBeenCalledTimes(2);
  });
});

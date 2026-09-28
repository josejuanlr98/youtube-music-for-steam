import { describe, it, expect, vi } from 'vitest';
import { CastPlayer } from '../src/CastPlayer.js';
import { extractAudioInfo } from '../src/ytdlp.js';
import { Constants } from 'yt-cast-receiver';

vi.mock('../src/ytdlp.js', () => ({ extractAudioInfo:vi.fn() }));

function setup() {
  const ws = { broadcast:vi.fn() };
  const player = new CastPlayer({ ytdlpPath:'unused', wsManager:ws as any, dataStore:{ get:async () => null } as any });
  player.queue.videoIds.push('a', 'b', 'c');
  player.queue.setAsCurrent({ id:'b', client:'YTMUSIC', context:{ playlistId:'playlist', index:1, params:'old-token' } } as any);
  Object.assign(player, { sessionCleared:false, playing:true, playbackId:'current', currentTrackInfo:{ videoId:'b' }, currentPosition:42, currentDuration:180 });
  return player;
}

describe('Cast playback synchronization', () => {
  function recoveringPlayer() {
    const player = setup();
    player.setLogger({ info:vi.fn(), debug:vi.fn(), warn:vi.fn(), error:vi.fn() } as any);
    vi.spyOn(player, 'getQueueWithMetadata').mockReturnValue({tracks:[],position:0});
    return player;
  }
  it('skips initial extraction failures and retains the sender playlist index', async () => {
    const player = recoveringPlayer();
    vi.mocked(extractAudioInfo).mockReset().mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({videoId:'c',title:'C',artist:'',albumArt:'',duration:180,url:'https://audio.test/c'});
    expect(await player.play({id:'b',client:'YTMUSIC',context:{playlistId:'playlist',index:1}} as any)).toBe(true);
    expect(vi.mocked(extractAudioInfo).mock.calls.map(call => call[0])).toEqual(['b','c']);
    expect(player.queue.current).toMatchObject({id:'c',context:{playlistId:'playlist',index:2}});
  });
  it('bounds consecutive extraction failures even with a large queue', async () => {
    const player = recoveringPlayer();
    player.queue.videoIds.push('d','e','f','g','h');
    vi.mocked(extractAudioInfo).mockReset().mockRejectedValue(new Error('Unavailable'));
    expect(await player.play({id:'a',client:'YTMUSIC'} as any)).toBe(false);
    expect(extractAudioInfo).toHaveBeenCalledTimes(5);
    expect(player.isCurrentlyPlaying()).toBe(false);
    expect(player.getPlaybackId()).toBeNull();
  });
  it.each(['pause','stop','disconnect'])('does not auto-advance after %s during extraction', async action => {
    const player = recoveringPlayer();
    let reject!: (error:Error) => void;
    vi.mocked(extractAudioInfo).mockReset().mockReturnValue(new Promise((_,fail) => {reject=fail;}));
    const playing = player.play({id:'b',client:'YTMUSIC'} as any);
    await vi.waitFor(() => expect(extractAudioInfo).toHaveBeenCalledTimes(1));
    if (action === 'disconnect') player.clearOnDisconnect();
    else if (action === 'pause') await player.pause();
    else await player.stop();
    reject(new Error('Unavailable'));
    expect(await playing).toBe(false);
    expect(extractAudioInfo).toHaveBeenCalledTimes(1);
  });
  it('retries a failed audio URL once and skips after a second failure', async () => {
    const player = setup();
    const next = vi.spyOn(player, 'next').mockResolvedValue(true);
    vi.mocked(extractAudioInfo).mockReset().mockResolvedValue({videoId:'b', title:'B', artist:'', albumArt:'', duration:180, url:'https://audio.test/b'});
    await player.handlePlaybackError('current');
    await player.handlePlaybackError('current');
    expect(extractAudioInfo).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
  it('preserves previous state when the sender mutates its playlist in place', async () => {
    const player = setup();
    const previous = await player.getState();
    player.queue.current!.context!.index = 2;
    player.queue.videoIds.push('d');
    expect(previous.queue.current?.context?.index).toBe(1);
    expect(previous.queue.videoIds).toEqual(['a','b','c']);
  });
  it('ignores delayed progress, ended and error events from previous playback', async () => {
    const player = setup();
    const next = vi.spyOn(player, 'next').mockResolvedValue(true);
    const jump = vi.spyOn(player, 'playVideoById').mockResolvedValue(true);
    player.updateProgress(99, 100, 'old');
    player.updateProgress(NaN, 100, 'current');
    await player.handleTrackEnded('old');
    await player.handlePlaybackError('old');
    expect(await player.getPosition()).toBe(42);
    expect(next).not.toHaveBeenCalled();
    expect(jump).not.toHaveBeenCalled();
    await Promise.all([player.handleTrackEnded('current'), player.handleTrackEnded('current')]);
    expect(jump).toHaveBeenCalledTimes(1);
    expect(jump).toHaveBeenCalledWith('c');
  });

  it('keeps sender progress alive during short throttling and stops when audio evidence expires', async () => {
    vi.useFakeTimers();
    try {
      const player = setup();
      const state = vi.fn(); player.on('state', state);
      await player.syncSender('current');
      expect(state.mock.calls.at(-1)![0].previous).toBeNull();
      expect(state.mock.calls.at(-1)![0].current.status).toBe(Constants.PLAYER_STATUSES.PLAYING);
      state.mockClear();
      player.updateProgress(43, 180, 'current');
      await vi.advanceTimersByTimeAsync(5000);
      expect(state).toHaveBeenCalledTimes(1);
      expect(state.mock.calls[0][0].current.position).toBe(48);
      await vi.advanceTimersByTimeAsync(15000);
      const count = state.mock.calls.length;
      const position = await player.getPosition();
      await vi.advanceTimersByTimeAsync(60000);
      expect(state).toHaveBeenCalledTimes(count);
      expect(await player.getPosition()).toBe(position);
      player.updateProgress(73, 180, 'current');
      await vi.advanceTimersByTimeAsync(0);
      expect(state.mock.calls.length).toBeGreaterThan(count);
      player.clearOnDisconnect();
      const stopped = state.mock.calls.length;
      await vi.advanceTimersByTimeAsync(30000);
      await player.syncSender('current');
      expect(state).toHaveBeenCalledTimes(stopped);
    } finally { vi.useRealTimers(); }
  });

  it('stops heartbeat on pause without resuming the phone', async () => {
    vi.useFakeTimers();
    try {
      const player = setup();
      player.setLogger({info:vi.fn(),debug:vi.fn(),warn:vi.fn(),error:vi.fn()} as any);
      player.updateProgress(20, 180, 'current');
      await vi.advanceTimersByTimeAsync(5000);
      await player.pause();
      const position = await player.getPosition();
      await vi.advanceTimersByTimeAsync(30000);
      expect(await player.getPosition()).toBe(position);
      expect(player.status).toBe(Constants.PLAYER_STATUSES.PAUSED);
      expect((player as any).progressHeartbeat).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('queue jumps retain list identity and destination index without stale navigation tokens', async () => {
    const player = setup();
    const play = vi.spyOn(player, 'play').mockResolvedValue(true);
    expect(await player.playVideoById('c')).toBe(true);
    expect(play.mock.calls[0][0]).toEqual({ id:'c', client:'YTMUSIC', context:{ playlistId:'playlist', index:2 } });
    expect(await player.playVideoById('missing')).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('keeps known duration when frontend metadata is temporarily unavailable', async () => {
    const player = setup();
    player.updateProgress(1, 0, 'current');
    expect(await player.getDuration()).toBe(180);
  });

  it('enriches only nearby metadata and shares an in-flight request', async () => {
    const player = setup();
    player.queue.videoIds.push(...Array.from({length:1000}, (_,i) => 'track-' + i));
    let finish!: (value:any) => void;
    const fetchMetadata = vi.spyOn(player as any, 'fetchMetadataFromOembed').mockImplementation(
      () => new Promise(resolve => {finish=resolve;}));
    player.getQueueWithMetadata();
    player.getQueueWithMetadata();
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    player.clearOnDisconnect();
    finish({title:'A',artist:'',albumArt:''});
    await Promise.resolve();
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
  });

  it('superseded extraction cannot stop or replace a newer song on the sender', async () => {
    const player = setup();
    player.setLogger({ info:vi.fn(), debug:vi.fn(), warn:vi.fn(), error:vi.fn() } as any);
    vi.spyOn(player, 'getQueueWithMetadata').mockReturnValue({ tracks:[], position:0 });
    let finish!: (value:any) => void;
    const first = new Promise<any>(resolve => { finish = resolve; });
    vi.mocked(extractAudioInfo).mockReset().mockReturnValueOnce(first).mockResolvedValueOnce({ videoId:'c', title:'C', artist:'', albumArt:'', url:'https://audio.test/c', duration:180 });
    const state = vi.fn(); player.on('state', state);
    const old = player.play({ id:'a', client:'YTMUSIC' } as any);
    await vi.waitFor(() => expect(extractAudioInfo).toHaveBeenCalledTimes(1));
    const latest = player.play({ id:'c', client:'YTMUSIC' } as any);
    finish({ videoId:'a', title:'A', duration:180 });
    expect(await old).toBe(false);
    expect(await latest).toBe(true);
    expect(player.getCurrentTrackInfo()?.videoId).toBe('c');
    expect(state.mock.calls.at(-1)?.[0].current).toMatchObject({ status:Constants.PLAYER_STATUSES.PLAYING, queue:{ current:{ id:'c' } } });
  });

  it('unlink cancels queued play requests before they can start', async () => {
    const player = setup();
    vi.mocked(extractAudioInfo).mockReset();
    const queued = player.play({ id:'a', client:'YTMUSIC' } as any);
    player.clearOnDisconnect();
    expect(await queued).toBe(false);
    expect(extractAudioInfo).not.toHaveBeenCalled();
  });
});

import { call } from '@decky/api';
import type { TrackInfo } from '../types';
export type { TrackInfo } from '../types';

const AUDIO_ID = 'ytm-audio-player';
const CAST_BACKEND = 'http://127.0.0.1:39281';
const CAST_WS = 'ws://127.0.0.1:39281';

let audioElement: HTMLAudioElement | null = null;
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let progressTimer: ReturnType<typeof setInterval> | null = null;

let currentTrack: TrackInfo | null = null;
let isPlaying = false;
let stoppingAll = false;
let stopInFlight: Promise<void> | null = null;
let playbackGeneration = 0;
// Playback ownership survives a temporary WebSocket/sender status outage.
let playbackSource: 'local' | 'cast' | null = null;
let castPlaybackId: string | null = null;
let pendingCastEnded = false;
let castRevision = 0;
let queueRevision = 0;
let queueMirror: Promise<unknown> = Promise.resolve();
let localRetryId: string | null = null;
let localManualPlayback = false;
let retryInFlight = false;
let failedLocalTracks = 0;
let skippingLocal = false;
async function skipFailedLocalTrack() {
  if (skippingLocal || !currentTrack || stoppingAll || playbackSource !== 'local') return;
  if (++failedLocalTracks > 5) { notifyPlaying(false); return; }
  skippingLocal = true;
  const generation = playbackGeneration;
  try {
  const result = await call<[string], TrackInfo & { stopped?:boolean; error?:string }>('skip_unplayable', currentTrack.videoId);
  if (generation !== playbackGeneration || stoppingAll) return;
  if (result.stopped) { clearPlayback(); return; }
  if (result.error || !result.url) { notifyPlaying(false); return; }
  await loadAndPlay(result);
  } finally { skippingLocal = false; }
}
let connectionRevision = 0;
const usesCast = () => playbackSource === 'cast' || castConnected;
let castConnected = false;
let castNetwork: NetworkInfo = { uuid: null, name: null, trusted: false };
let castSenderName: string | null = null;
let senderNotified = false;
let senderNameTimer: ReturnType<typeof setTimeout> | null = null;
function notifySender(name: string | null, avatar?: string) {
  if (!name) {
    if (senderNotified) return;
    senderNotified = true;
    castSenderName = null;
    if (!castConnected) {
      castConnected = true;
      castConnectionListeners.forEach(fn => fn(true, null));
    }
    // A connection/track can arrive just before the receiver supplies the
    // sender object. Give that event a moment before showing the generic label.
    senderNameTimer = setTimeout(() => {
      senderNameTimer = null;
      senderConnectedListeners.forEach(fn => fn(null, undefined));
    }, 1200);
    return;
  }
  if (senderNameTimer) { clearTimeout(senderNameTimer); senderNameTimer = null; }
  if (senderNotified && name === castSenderName) return;
  senderNotified = true;
  castSenderName = name;
  senderConnectedListeners.forEach(fn => fn(name, avatar));
  // senderConnected is the receiver's strongest signal that Cast has resumed.
  // Do not depend on the separate connection-state broadcast arriving after a
  // Stop/restart; either event should restore the plugin's Cast indicator.
  if (!castConnected) {
    castConnected = true;
    castConnectionListeners.forEach(fn => fn(true, name));
  } else {
    castConnectionListeners.forEach(fn => fn(true, name));
  }
}
let progressPosition = 0;
let progressDuration = 0;
let volumeValue = 100;
let volumeMuted = false;
let volumeRevision = 0;
let lastCastReport = 0;
let volumeListeners: Array<(value:number) => void> = [];
export function getAudioVolume() { return volumeMuted ? 0 : volumeValue; }
export function addVolumeListener(fn:(value:number)=>void) {
  volumeListeners.push(fn);
  return () => { volumeListeners = volumeListeners.filter(listener => listener !== fn); };
}
function applyVolume(value:number, muted = false) {
  if (!Number.isFinite(value)) return;
  volumeRevision++;
  volumeValue = Math.max(0, Math.min(100, value)); volumeMuted = muted;
  if (audioElement) { audioElement.volume = volumeValue / 100; audioElement.muted = muted; }
  volumeListeners.forEach(fn => fn(getAudioVolume()));
}

let trackChangeListeners: Array<(track: TrackInfo | null) => void> = [];
let playbackStartedListeners: Array<(track: TrackInfo, manual: boolean) => void> = [];
let senderConnectedListeners: Array<(name: string | null, avatar?:string) => void> = [];
export function addPlaybackStartedListener(fn: (track: TrackInfo, manual: boolean) => void) {
  playbackStartedListeners.push(fn);
  return () => { playbackStartedListeners = playbackStartedListeners.filter(l => l !== fn); };
}
export function addSenderConnectedListener(fn: (name: string | null, avatar?:string) => void) {
  senderConnectedListeners.push(fn);
  return () => { senderConnectedListeners = senderConnectedListeners.filter(l => l !== fn); };
}
let playStateListeners: Array<(playing: boolean) => void> = [];
let castConnectionListeners: Array<(connected: boolean, senderName: string | null) => void> = [];
let networkListeners: Array<(info: NetworkInfo) => void> = [];
let queueListeners: Array<(tracks: TrackInfo[], position: number) => void> = [];
let progressListeners: Array<(position: number, duration: number) => void> = [];
let castQueue: { tracks: TrackInfo[]; position: number } = { tracks: [], position: -1 };

export interface NetworkInfo {
  uuid: string | null;
  name: string | null;
  trusted: boolean;
}

export function getCurrentTrack() { return currentTrack; }
export function getIsPlaying() { return isPlaying; }
export function getIsCastConnected() { return castConnected; }
export function getNetworkInfo() { return castNetwork; }
export function getCastSenderName() { return castSenderName; }
export function getProgress() { return { position: progressPosition, duration: progressDuration }; }
export function getLivePlaybackPosition() {
  const current = audioElement?.currentTime;
  return playbackSource && Number.isFinite(current) ? Math.max(0, current!) : progressPosition;
}

export function addTrackChangeListener(fn: (track: TrackInfo | null) => void) {
  trackChangeListeners.push(fn);
  return () => { trackChangeListeners = trackChangeListeners.filter((l) => l !== fn); };
}
export function addPlayStateListener(fn: (playing: boolean) => void) {
  playStateListeners.push(fn);
  return () => { playStateListeners = playStateListeners.filter((l) => l !== fn); };
}
export function addCastConnectionListener(fn: (connected: boolean, senderName: string | null) => void) {
  castConnectionListeners.push(fn);
  return () => { castConnectionListeners = castConnectionListeners.filter((l) => l !== fn); };
}
export function addNetworkListener(fn: (info: NetworkInfo) => void) {
  networkListeners.push(fn);
  return () => { networkListeners = networkListeners.filter((l) => l !== fn); };
}
export function getQueue() { return castQueue; }
export function addProgressListener(fn: (position: number, duration: number) => void) { progressListeners.push(fn); return () => { progressListeners = progressListeners.filter((l) => l !== fn); }; }
export function addQueueListener(fn: (tracks: TrackInfo[], position: number) => void) {
  queueListeners.push(fn);
  return () => { queueListeners = queueListeners.filter((l) => l !== fn); };
}
function notifyQueue(tracks: TrackInfo[], position: number) {
  castQueue = { tracks, position };
  queueListeners.forEach((fn) => fn(tracks, position));
  // Keep Decky's local queue in sync with the Cast queue so the Queue tab is
  // always the same queue shown by the phone during a Cast session.
  if (usesCast()) queueMirror = queueMirror.then(() => call('sync_cast_queue', tracks, position)).catch(() => {});
}

function notifyProgress(position: number, duration: number) { progressPosition = Math.max(0, position || 0); progressDuration = Math.max(0, duration || 0); progressListeners.forEach((fn) => fn(progressPosition, progressDuration)); }
function notifyTrack(track: TrackInfo | null) {
  currentTrack = track;
  trackChangeListeners.forEach((fn) => fn(track));
}
/** Metadata may only be cleared after the media element has been silenced. */
function clearPlayback() {
  playbackGeneration++;
  playbackSource = null; castPlaybackId = null; pendingCastEnded = false;
  stopCastProgress();
  notifyPlaying(false);
  audioElement?.pause();
  audioElement?.removeAttribute('src');
  audioElement?.load();
  notifyTrack(null);
  notifyProgress(0, 0);
}
function notifyPlaying(value: boolean, manual = playbackSource === 'local' && localManualPlayback) {
  isPlaying = value;
  playStateListeners.forEach((fn) => fn(value));
  if (value && currentTrack) playbackStartedListeners.forEach(fn => fn(currentTrack!, manual));
}
function notifyCastConnection(value: boolean) {
  if (!value) {
    senderNotified = false;
    if (senderNameTimer) { clearTimeout(senderNameTimer); senderNameTimer = null; }
  }
  castConnected = value;
  castConnectionListeners.forEach((fn) => fn(value, castSenderName));
}
function notifyNetwork(info: NetworkInfo) {
  castNetwork = info;
  networkListeners.forEach((fn) => fn(info));
}

async function castGet(path: string) {
  try {
    return await castRequest(path);
  } catch {
    return null;
  }
}
async function castPost(path: string, body?: unknown) {
  try {
    return await castRequest(path, body ?? {});
  } catch {
    return { ok: false };
  }
}

export async function apiGetNetwork(): Promise<NetworkInfo | null> {
  return await castGet('/api/network/current');
}
export async function apiTrustNetwork() { return castPost('/api/network/trust'); }
export async function apiUntrustNetwork() { return castPost('/api/network/untrust'); }

function sendCast(event: string, data: unknown = {}) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

/** No retries for mutations: repeating a timed-out queue edit could apply it twice. */
export async function castRequest(path: string, body?: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${CAST_BACKEND}${path}`, {
      signal:controller.signal, ...(body === undefined ? {} : {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
      }),
    });
    const value = await res.json();
    if (!res.ok || value?.ok === false || value?.error)
      throw new Error(value?.message || value?.error || 'Cast could not complete this action.');
    return value;
  } finally { clearTimeout(timer); }
}

function sendCastPlayback(event: string, data: Record<string, unknown> = {}) {
  if (event === 'progress') lastCastReport = Date.now();
  if (castPlaybackId) sendCast(event, { ...data, playbackId:castPlaybackId });
}

function startCastProgress() {
  if (progressTimer) clearInterval(progressTimer);
  let lastPosition = audioElement?.currentTime ?? 0;
  let lastAdvance = Date.now();
  progressTimer = setInterval(() => {
    if (!audioElement || playbackSource !== 'cast' || !isPlaying) return;
    const duration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
    notifyProgress(audioElement.currentTime, duration);
    sendCastPlayback('progress', { currentTime: audioElement.currentTime, duration });
    if (Math.abs(audioElement.currentTime - lastPosition) > .05) {
      lastPosition = audioElement.currentTime;
      lastAdvance = Date.now();
    } else if (!audioElement.paused && !audioElement.ended && Date.now() - lastAdvance >= 20000) {
      // Some stalled media requests never raise an error event.
      lastAdvance = Date.now();
      sendCastPlayback('playbackError', {message:'Audio stalled for 20 seconds'});
    }
  }, 1000);
}
function stopCastProgress() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

async function handleCastTrack(data: any) {
  if (!audioElement || !data?.url) return;
  // A valid receiver track is also proof that a sender is actively casting.
  // Recover UI state and the one-time connection alert if the sender event was
  // lost while the receiver was restarting.
  notifySender(castSenderName);
  const generation = ++playbackGeneration;
  playbackSource = 'cast';
  castPlaybackId = data.playbackId ?? null;
  pendingCastEnded = false;
  stopCastProgress();
  const track: TrackInfo = {
    videoId: data.videoId ?? '',
    title: data.title ?? 'Unknown',
    artist: data.artist ?? '',
    album: data.album ?? '',
    albumArt: data.albumArt ?? '',
    duration: data.duration ?? 0,
    url: data.url,
    queuePosition: data.queuePosition,
    queueLength: data.queueLength,
  };
  audioElement.src = track.url || '';
  if (Number.isFinite(data.position) && data.position > 0) audioElement.currentTime = data.position;
  notifyProgress(data.position || 0, track.duration || 0);
  notifyTrack(track);

  const autoplay = data.autoplay !== false;
  if (autoplay) {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([audioElement.play(), new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error('Cast audio did not start within 20 seconds')), 20000);
      })]);
      if (generation !== playbackGeneration) return;
      notifyPlaying(true);
      startCastProgress();
      sendCastPlayback('playing');
    } catch (e) {
      if (generation !== playbackGeneration) return;
      console.error('[YTM] Cast playback failed:', e);
      sendCastPlayback('playbackError', { message: String(e) });
      notifyPlaying(false);
    } finally { clearTimeout(deadline); }
  } else {
    notifyPlaying(false);
  }
}

function handleCastMessage(msg: any) {
  if (['track', 'state', 'stop', 'seek'].includes(msg.event)) castRevision++;
  if (msg.event === 'queue') queueRevision++;
  if (msg.event === 'connection') connectionRevision++;
  if (stoppingAll && ['track', 'state', 'queue'].includes(msg.event)) return;
  switch (msg.event) {
    case 'volume':
      if (usesCast()) applyVolume(msg.data?.value, !!msg.data?.muted);
      break;
    case 'track':
      void handleCastTrack(msg.data);
      break;
    case 'state':
      if (playbackSource !== 'cast') break;
      if (msg.data?.isPlaying && audioElement?.src && !isPlaying) {
        const generation = playbackGeneration;
        void audioElement.play().then(() => {
          if (generation !== playbackGeneration) return;
          notifyPlaying(true);
          startCastProgress();
          sendCastPlayback('playing');
        }).catch(() => {});
      } else if (!msg.data?.isPlaying) {
        playbackGeneration++;
        audioElement?.pause();
        stopCastProgress();
        notifyPlaying(false);
      }
      break;
    case 'stop':
      if (playbackSource !== 'cast') break;
      clearPlayback();
      break;
    case 'seek':
      if (playbackSource !== 'cast') break;
      if (audioElement && Number.isFinite(msg.data?.position)) {
        audioElement.currentTime = msg.data.position;
      }
      break;
    case 'queue':
      notifyQueue(msg.data?.tracks ?? [], msg.data?.position ?? -1);
      break;
    case 'connection':
      if (msg.data?.phoneConnected) {
        const name = msg.data?.senderName ?? null;
        if (!castConnected || (name && name !== castSenderName)) notifySender(name);
        else notifyCastConnection(true);
      } else {
        castSenderName = msg.data?.senderName ?? null;
        notifyCastConnection(false);
      }
      break;
    case 'senderConnected':
      notifySender(msg.data?.senderName ?? null, msg.data?.avatar);
      break;
    case 'network':
      notifyNetwork({
        uuid: msg.data?.uuid ?? null,
        name: msg.data?.name ?? null,
        trusted: !!msg.data?.trusted,
      });
      break;
  }
}

function connectCast() {
  try {
    ws = new WebSocket(CAST_WS);
  } catch {
    scheduleCastReconnect();
    return;
  }
  const socket = ws;
  ws.onopen = () => {
    reconnectDelay = 1000;
    const revision = castRevision;
    const queueSnapshot = queueRevision;
    const connectionSnapshot = connectionRevision;
    const volumeSnapshot = volumeRevision;
    void castGet('/api/state').then((state) => {
      if (!state || ws !== socket || revision !== castRevision || stoppingAll) return;
      if (connectionSnapshot === connectionRevision) {
        const name = state.senderName ?? null;
        if (state.connected && (!castConnected || (name && name !== castSenderName))) notifySender(name);
        else notifyCastConnection(!!state.connected);
      }
      if (volumeSnapshot === volumeRevision && (state.connected || state.track)) applyVolume(state.volume, !!state.muted);
      if (state.track?.url) {
        if (playbackSource !== 'cast' || state.track.playbackId !== castPlaybackId || !audioElement?.src) {
          void handleCastTrack({ ...state.track, position:state.position, autoplay:state.isPlaying });
        } else if (pendingCastEnded) {
          sendCastPlayback('ended');
        } else {
          handleCastMessage({ event:'state', data:state });
          sendCastPlayback('playing');
        }
      } else if (playbackSource === 'cast') {
        handleCastMessage({ event:'stop', data:{} });
      }
    });
    void apiGetNetwork().then((n) => { if (ws === socket && n) notifyNetwork(n); });
    void castGet('/api/queue').then((q) => { if (ws === socket && queueSnapshot === queueRevision && !stoppingAll && q?.tracks) notifyQueue(q.tracks, q.position ?? -1); });
  };
  ws.onmessage = (event) => {
    if (ws !== socket) return;
    try { handleCastMessage(JSON.parse(event.data as string)); } catch {}
  };
  ws.onclose = () => {
    if (ws !== socket) return;
    // Losing our local transport is not evidence that the sender disconnected.
    // Keep Player/Queue in Cast mode until the receiver confirms its state.
    scheduleCastReconnect();
  };
  ws.onerror = () => {};
}
function scheduleCastReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
    connectCast();
  }, reconnectDelay);
}

function onAudioEnded() {
  if (stoppingAll || !currentTrack || !audioElement?.ended) return;
  stopCastProgress();
  notifyPlaying(false);
  if (playbackSource === 'cast') {
    pendingCastEnded = true;
    sendCastPlayback('ended');
  } else {
    void handleLocalTrackEnded();
  }
}
function onAudioError() {
  if (stoppingAll || !currentTrack) return;
  if (playbackSource === 'cast') {
    sendCastPlayback('playbackError', { message: 'Audio playback error' });
  } else {
    void handleLocalError();
  }
}
function onAudioTimeUpdate() {
  if (!audioElement) return;
  const duration = Number.isFinite(audioElement.duration) ? audioElement.duration : 0;
  if (playbackSource === 'cast' && isPlaying && !audioElement.paused && Date.now() - lastCastReport >= 4000)
    sendCastPlayback('progress', {currentTime:audioElement.currentTime, duration});
  notifyProgress(audioElement.currentTime, duration);
  if (audioElement.currentTime > 2) failedLocalTracks = 0;
}

function onAudioPause() {
  if (isPlaying && playbackSource === 'local') {
    notifyPlaying(false);
    void call('pause');
  }
}

async function handleLocalTrackEnded() {
  const generation = playbackGeneration;
  try {
    const result = await call<[], TrackInfo & { stopped?: boolean; error?: string }>('track_ended');
    if (generation !== playbackGeneration) return;
    if (result.stopped) {
      clearPlayback(); return;
    }
    if (result.error || !result.url) { notifyPlaying(false); return; }
    await loadAndPlay(result);
  } catch { notifyPlaying(false); }
}
async function handleLocalError() {
  if (retryInFlight || !currentTrack) return;
  if (localRetryId === currentTrack.videoId) { await skipFailedLocalTrack().catch(() => notifyPlaying(false)); return; }
  retryInFlight = true;
  localRetryId = currentTrack.videoId;
  const generation = playbackGeneration;
  try {
    const result = await call<[], TrackInfo & { error?: string }>('get_current_track');
    if (generation !== playbackGeneration) return;
    if (result.error || !result.url) { await skipFailedLocalTrack(); return; }
    await loadAndPlay(result, true);
  } catch { notifyPlaying(false); }
  finally { retryInFlight = false; }
}

async function loadAndPlay(track: TrackInfo, retry = false, manual = false) {
  if (stoppingAll || !audioElement || !track.url) return;
  if (!retry) { localRetryId = null; localManualPlayback = manual; }
  else manual = localManualPlayback;
  const generation = ++playbackGeneration;
  playbackSource = 'local';
  castPlaybackId = null;
  pendingCastEnded = false;
  stopCastProgress();
  const resumePosition = retry ? audioElement.currentTime : 0;
  audioElement.src = track.url;
  if (resumePosition > 0) audioElement.currentTime = resumePosition;
  notifyTrack(track);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([audioElement.play(), new Promise<never>((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Audio did not start within 20 seconds')), 20000);
    })]);
    if (generation !== playbackGeneration) return;
    notifyPlaying(true, manual);
    void call('resume');
  } catch (e) {
    if (generation !== playbackGeneration) return;
    console.error('[YTM] play failed:', e);
    notifyPlaying(false);
    // Retry once, then skip; defer until an ongoing retry releases its guard.
    if ((e as { name?:string })?.name !== 'NotAllowedError') setTimeout(() => {
      if (generation === playbackGeneration && !stoppingAll) void handleLocalError();
    }, 0);
  } finally { clearTimeout(deadline); }
}

export function initAudio() {
  if (document.getElementById(AUDIO_ID)) {
    audioElement = document.getElementById(AUDIO_ID) as HTMLAudioElement;
  } else {
    audioElement = document.createElement('audio');
    audioElement.id = AUDIO_ID;
    audioElement.style.display = 'none';
    document.body.appendChild(audioElement);
  }
  audioElement.removeEventListener('ended', onAudioEnded);
  audioElement.removeEventListener('error', onAudioError);
  audioElement.removeEventListener('pause', onAudioPause);
  audioElement.removeEventListener('timeupdate', onAudioTimeUpdate);
  audioElement.addEventListener('ended', onAudioEnded);
  audioElement.addEventListener('error', onAudioError);
  audioElement.addEventListener('pause', onAudioPause);
  audioElement.addEventListener('timeupdate', onAudioTimeUpdate);
  if (!currentTrack && audioElement.getAttribute?.('src')) clearPlayback();
  connectCast();
}

export function destroyAudio() {
  volumeListeners = [];
  playbackGeneration++;
  stopCastProgress();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  if (audioElement) {
    audioElement.pause(); audioElement.src = '';
    audioElement.removeEventListener('ended', onAudioEnded);
    audioElement.removeEventListener('error', onAudioError);
    audioElement.removeEventListener('pause', onAudioPause);
    audioElement.removeEventListener('timeupdate', onAudioTimeUpdate);
    audioElement.remove(); audioElement = null;
  }
  currentTrack = null; isPlaying = false; castConnected = false; castSenderName = null; progressPosition = 0; progressDuration = 0;
  senderNotified = false;
  if (senderNameTimer) { clearTimeout(senderNameTimer); senderNameTimer = null; }
  playbackSource = null; castPlaybackId = null; pendingCastEnded = false;
  localManualPlayback=false;
  castQueue = { tracks: [], position: -1 };
  trackChangeListeners = []; playStateListeners = [];
  playbackStartedListeners = []; senderConnectedListeners = [];
  castConnectionListeners = []; networkListeners = []; queueListeners = []; progressListeners = [];
}

export async function playTrack(track: TrackInfo) {
  // Taking control from the Deck explicitly ends the phone Cast session first.
  if (usesCast()) {
    const snapshot = await call('get_queue');
    await disconnectCast();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await queueMirror;
    const restored = await call<[unknown], {success?:boolean;error?:string}>('restore_local_queue', snapshot);
    if (!restored.success) throw new Error(restored.error || 'Could not restore your playlist.');
  }
  await loadAndPlay(track, false, true);
}
export function pausePlayback() {
  if (usesCast()) {
    void castPost('/api/pause');
    return;
  }
  playbackGeneration++;
  notifyPlaying(false);
  void call('pause');
  audioElement?.pause();
}
export function resumePlayback() {
  if (usesCast()) {
    void castPost('/api/play');
    return;
  }
  if (currentTrack && audioElement?.src) {
    const generation=playbackGeneration;
    void audioElement.play().then(() => {
      if(generation!==playbackGeneration)return;
      notifyPlaying(true);
      void call('resume');
    }).catch(() => {if(generation===playbackGeneration)notifyPlaying(false);});
  }
}
export function togglePlayback() {
  if (isPlaying) pausePlayback(); else resumePlayback();
}
export async function playNext() {
  if (usesCast()) { await castPost('/api/next'); return; }
  const generation = playbackGeneration;
  const result = await call<[], TrackInfo & { stopped?: boolean; error?: string }>('next_track');
  if (generation !== playbackGeneration) return;
  if (result.stopped) { clearPlayback(); return; }
  if (result.error || !result.url) return;
  await loadAndPlay(result);
}
export async function playPrevious() {
  if (usesCast()) { await castPost('/api/prev'); return; }
  const generation = playbackGeneration;
  const result = await call<[], TrackInfo & { stopped?: boolean; error?: string }>('previous_track');
  if (generation !== playbackGeneration) return;
  if (result.stopped) return;
  if (result.error || !result.url) return;
  await loadAndPlay(result);
}
export function setAudioVolume(value: number) {
  applyVolume(value);
  if (!usesCast()) void call('set_volume', value);
  else void castPost('/api/volume', { volume: value });
}
export function getAudioElement() { return audioElement; }

export function stopAllPlayback(): Promise<void> {
  if (stopInFlight) return stopInFlight;
  stoppingAll = true;
  playbackGeneration++;
  playbackSource = null; castPlaybackId = null; pendingCastEnded = false;
  // Silence immediately; remove src instead of loading an empty URL.
  notifyPlaying(false);
  audioElement?.pause();
  audioElement?.removeAttribute('src');
  audioElement?.load();
  stopCastProgress();
  notifyTrack(null);
  notifyProgress(0, 0);
  stopInFlight = (async () => {
    // Ask the backend even if the UI missed a connection event.
    const results = await Promise.allSettled([
      disconnectCast(),
      call<[], { success?: boolean; error?: string }>('stop_all').then(result => {
        if (!result.success) throw new Error('Could not clear the local queue.');
      }),
    ]);
    if (results[0].status === 'fulfilled') {
      castSenderName = null;
      notifyCastConnection(false);
    }
    notifyQueue([], -1);
    const failed = results.some(result => result.status === 'rejected');
    if (failed) throw new Error('Audio stopped, but clearing or unlinking failed. Press Stop again to retry.');
  })().finally(() => { stoppingAll = false; stopInFlight = null; });
  return stopInFlight;
}

export async function disconnectCast() {
  senderNotified = false;
  const result = await castPost('/api/cast/disconnect');
  if (!result?.ok) throw new Error('Could not unlink and restart Cast. Please try again.');
  castSenderName = null;
  notifyCastConnection(false);
}

export function seekPlayback(position: number) {
  const target = Math.max(0, position);
  if (usesCast()) { void castPost('/api/seek', { position: target }); return; }
  if (audioElement) { audioElement.currentTime = target; notifyProgress(target, Number.isFinite(audioElement.duration) ? audioElement.duration : progressDuration); }
}

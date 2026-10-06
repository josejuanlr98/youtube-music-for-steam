import { call, toaster } from '@decky/api';
import { callOriginal, replacePatch, type Patch } from '@decky/ui';
import { SiYoutubemusic } from 'react-icons/si';
import { addPlaybackStartedListener, addSenderConnectedListener, addTrackChangeListener } from './audioManager';

export interface NotificationSettings {
  connections: boolean;
  tracks: boolean;
  connectionSound: boolean;
  trackSound: boolean;
}
const safeAvatar = (value?:string) => {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com') || url.hostname === 'yt3.ggpht.com') ? url.href : undefined;
  } catch { return undefined; }
};
const notificationArtSize = 'clamp(52px, 6vh, 68px)';
const notificationLogo = (avatar?:string) => safeAvatar(avatar)
  ? <img src={safeAvatar(avatar)} alt="" referrerPolicy="no-referrer" style={{width:notificationArtSize,height:notificationArtSize,minWidth:notificationArtSize,flex:'0 0 auto',alignSelf:'center',display:'block',objectFit:'cover',borderRadius:7,margin:0}} onError={event => { event.currentTarget.style.visibility='hidden'; }} />
  : <div style={{ width:notificationArtSize, height:notificationArtSize, minWidth:notificationArtSize, aspectRatio:'1 / 1', display:'flex', alignItems:'center', justifyContent:'center', alignSelf:'center', flexShrink:0, overflow:'visible', background:'transparent', margin:0 }}>
      <SiYoutubemusic size={48} style={{ width:'78%', height:'78%', display:'block', flexShrink:0, color:'#ffffff' }} />
    </div>;
const toastTitle = (text:string) => <div style={{fontSize:'clamp(11px, .9vw, 13px)',fontWeight:650,lineHeight:1.35,color:'#f5f7fa',maxWidth:'min(62vw, 420px)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{text}</div>;
const toastDetail = (text:string) => <div style={{fontSize:'clamp(10px, .82vw, 12px)',lineHeight:1.45,color:'#aebdcb',marginTop:3,maxWidth:'min(62vw, 420px)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{text}</div>;
let settings: NotificationSettings = { connections:true, tracks:true, connectionSound:false, trackSound:false };
let ready = false;
let fullscreenReaders = 0;
let dismissVisible: (() => void) | undefined;
const panels = new Set<HTMLElement>();
export function registerNotificationPanel(element: HTMLElement) {
  panels.add(element);
  if (panelVisible()) dismissVisible?.();
  return () => { panels.delete(element); };
}
function panelVisible() {
  return [...panels].some(element => {
    if (!element.isConnected || element.ownerDocument.visibilityState === 'hidden' || !element.getClientRects().length) return false;
    const view = element.ownerDocument.defaultView;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = view?.getComputedStyle(node);
      if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0' || node.getAttribute('aria-hidden') === 'true') return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 && rect.top < (view?.innerHeight || 0) && rect.left < (view?.innerWidth || 0);
  });
}
const notificationsSuppressed = () => fullscreenReaders > 0 || panelVisible();
export function suppressFullscreenNotifications() {
  fullscreenReaders++;
  dismissVisible?.();
  let released = false;
  return () => { if (!released) { released = true; fullscreenReaders--; } };
}
let loading: Promise<NotificationSettings> | null = null;
const quietPlayback = new Map<string, number>();
/** Silence a user-selected song while still notifying later automatic changes. */
export function suppressPlaybackNotification(videoId:string) {
  if (!videoId) return;
  quietPlayback.set(videoId, Date.now() + 15000);
}
export function loadNotificationSettings(): Promise<NotificationSettings> {
  if (!loading) loading = call<[], NotificationSettings>('get_notification_settings').then(value => {
    settings = value; ready = true; return { ...settings };
  }).finally(() => { loading = null; });
  return loading;
}
export async function saveNotificationSettings(value: NotificationSettings) {
  const result = await call<[NotificationSettings], NotificationSettings & { error?:string }>('set_notification_settings', value);
  if (result.error) throw new Error(result.error);
  settings = result; ready = true;
  return { ...settings };
}

function notificationText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(notificationText).join('');
  if (value && typeof value === 'object' && 'props' in value)
    return notificationText((value as {props?: {children?:unknown}}).props?.children);
  return '';
}

function sendToast(data: Parameters<typeof toaster.toast>[0]) {
  const shared = (window as unknown as {
    DeckyPluginLoader?: { toaster?: typeof toaster & { __steamcordSafe?: number | boolean } };
  }).DeckyPluginLoader?.toaster;
  // Steamcord's safe renderer accepts strings, not JSX. Respect its routing
  // and streaming preferences instead of bypassing it with a native Decky toast.
  if (shared?.__steamcordSafe) {
    return shared.toast({ ...data, title:`YouTube Music · ${notificationText(data.title)}`, body:notificationText(data.body) });
  }
  return toaster.toast(data);
}

// A plugin may replace the sound method outright, outside Decky's patch chain.
// Only remove our patch if it is still reachable; never overwrite that plugin.
function soundPatchInstalled(patch: Patch) {
  let current = patch.object[patch.property];
  for (let depth = 0; typeof current === 'function' && depth < 32; depth++) {
    if (current === patch.patchedFunction) return true;
    current = current.__deckyPatch?.original;
  }
  return false;
}

// Mounted once for the plugin lifetime, independent of the Quick Access panel.
// Only actual sender events and successful playback emit notifications.
export function initNotifications() {
  let lastTrack = '';
  let alive = true;
  let soundPatch: Patch | undefined;
  const ensureSoundPatch = () => {
    if (soundPatch && soundPatchInstalled(soundPatch)) return;
    soundPatch = undefined;
    const store = (window as unknown as { NotificationStore?: { PlayNotificationSound?: (...args: any[]) => unknown } }).NotificationStore;
    if (typeof store?.PlayNotificationSound !== 'function') throw new Error('Steam notification sound hook is unavailable');
    // Steam's queued-toast path selects sound by eType again, discarding the
    // playSound option Decky passed to ProcessNotification. Filter only our
    // explicitly silent toasts at the final playback method, including delayed ones.
    soundPatch = replacePatch(store, 'PlayNotificationSound', (args: any[]) => {
      const notification = args[0];
      if (notification?.decky && notification.data?.ytmNotification === true && (notificationsSuppressed() || notification.data.playSound === false)) return;
      return callOriginal;
    });
  };
  const active = new Set<ReturnType<typeof toaster.toast>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  dismissVisible = () => { active.forEach(item => item.dismiss()); active.clear(); };
  const toast = (data: Parameters<typeof toaster.toast>[0]) => {
    if (!alive || !ready || notificationsSuppressed()) return;
    try {
      ensureSoundPatch();
      // Keep fast skips from filling the Steam notification queue.
      if (active.size >= 2) { const oldest = active.values().next().value; oldest?.dismiss(); if (oldest) active.delete(oldest); }
      const payload = { ...data, ytmNotification:true, duration:5000, showToast:true, showNewIndicator:false };
      const item = sendToast(payload);
      if (!item || typeof item.dismiss !== 'function') return;
      active.add(item);
      const timer = setTimeout(() => { active.delete(item); timers.delete(timer); }, 6000);
      timers.add(timer);
    } catch (error) { console.warn('[YTM] Notification unavailable', error); }
  };
  const removers = [
    addSenderConnectedListener((name, avatar) => {
      if (settings.connections) toast({ title:toastTitle(name || 'Device connected'), body:toastDetail('Connected · YouTube Music'), logo:notificationLogo(avatar), playSound:settings.connectionSound });
    }),
    addTrackChangeListener(track => { if (!track) lastTrack = ''; }),
    addPlaybackStartedListener((track, manual) => {
      if (!track.videoId || lastTrack === track.videoId) return;
      lastTrack = track.videoId;
      const quietUntil = quietPlayback.get(track.videoId) || 0;
      quietPlayback.delete(track.videoId);
      if (manual || quietUntil > Date.now()) return;
      if (!settings.tracks) return;
      toast({ title:toastTitle(track.title || 'Now playing'), body:toastDetail(track.artist || 'YouTube Music'),
        logo:track.albumArt ? <img src={track.albumArt} alt="" style={{ width:notificationArtSize, height:notificationArtSize, minWidth:notificationArtSize, flex:'0 0 auto', alignSelf:'center', display:'block', objectFit:'cover', borderRadius:7, margin:0 }} onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /> : notificationLogo(),
        playSound:settings.trackSound });
    }),
  ];
  void loadNotificationSettings().catch(error => console.warn('[YTM] Could not load notification preferences', error));
  return () => { alive = false; ready = false; quietPlayback.clear(); dismissVisible = undefined; removers.forEach(remove => remove()); timers.forEach(clearTimeout); active.forEach(item => item.dismiss()); if (soundPatch && soundPatchInstalled(soundPatch)) soundPatch.unpatch(); };
}

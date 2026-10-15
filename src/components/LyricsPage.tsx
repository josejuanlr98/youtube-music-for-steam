import { acquireFullscreenPower } from '../services/fullscreenPower';
import { returnBrowseToPlayer, backFromBrowse } from '../services/browseNavigation';
import { translationColor } from '../services/lyricColor';
import { DialogButton, Focusable, GamepadButton, Navigation } from '@decky/ui';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FaArrowLeft, FaExpand } from 'react-icons/fa';
import { addTrackChangeListener, getCurrentTrack, addCastConnectionListener, getIsCastConnected, getCastSenderName, getProgress, getLivePlaybackPosition, addProgressListener, addPlayStateListener, getIsPlaying, playNext, playPrevious, togglePlayback } from '../services/audioManager';
import { loadLyrics, loadTranslatedLyrics, type LyricsResult } from '../services/lyrics';
import { focusLyricsReader } from '../services/focus';

import { MdCastConnected, MdTranslate } from 'react-icons/md';
import { SiYoutubemusic } from 'react-icons/si';
import { followSyncedLyrics } from '../services/syncedLyrics';
import { startLyricsScroll } from '../services/lyricsScroll';
import { suppressFullscreenNotifications } from '../services/notifications';
import { useI18n } from '../services/i18n';
import { useArtworkPalette } from '../services/artworkPalette';
import { ArtworkBackdrop } from './ArtworkBackdrop';
import { ThemeScope } from './ThemeScope';
import { OverflowTextGroup } from './OverflowText';
import { lyricsSource } from '../services/lyricsSource';
import { createReaderScroller } from '../services/readerScroll';

export const LYRICS_ROUTE = '/youtube-music-lyrics';
const MUSIC_WORDMARK_PATH = 'M60.06 4.51L60.68 4.50L61.03 4.61L61.30 4.79L61.54 5.23L61.63 5.91L61.54 6.63L61.42 6.92L61.17 7.17L60.95 7.27L60.73 7.32L60.05 7.32L59.70 7.21L59.42 6.99L59.23 6.54L59.18 5.59L59.29 5.11L59.47 4.79L59.65 4.65ZM27.84 4.70L31.44 4.70L32.95 11.14L33.50 14.14L33.77 16.00L33.87 17.04L33.96 17.27L34.08 17.21L34.13 17.00L34.55 14.09L35.09 11.14L36.56 4.74L36.68 4.68L40.21 4.70L40.21 20.16L38.18 20.18L38.09 20.13L38.09 11.00L38.14 10.82L38.14 9.45L38.18 9.27L38.18 8.27L38.27 7.05L38.26 6.93L38.18 6.91L38.01 6.97L37.59 8.55L35.27 19.54L35.13 20.13L35.05 20.18L33.05 20.18L32.92 20.12L30.32 8.09L30.03 6.97L29.95 6.91L29.79 6.93L29.86 9.36L29.91 9.55L29.91 11.05L29.95 11.23L29.95 20.13L29.86 20.18L27.84 20.16ZM53.61 8.61L55.05 8.59L55.41 8.64L56.08 8.83L56.44 9.01L57.01 9.53L57.21 9.83L57.45 10.46L57.59 11.23L57.57 12.30L57.09 12.36L55.68 12.41L55.59 12.36L55.54 11.55L55.35 10.79L55.15 10.44L54.94 10.29L54.68 10.18L54.32 10.14L53.74 10.24L53.47 10.38L53.31 10.53L53.09 10.96L53.09 11.59L53.14 11.82L53.29 12.17L53.58 12.56L54.11 12.99L55.67 14.06L56.60 14.81L56.92 15.12L57.30 15.65L57.53 16.11L57.68 16.59L57.77 17.41L57.72 18.00L57.53 18.71L57.21 19.30L56.76 19.76L56.12 20.12L55.68 20.27L55.00 20.41L53.68 20.41L53.05 20.32L52.47 20.12L52.01 19.89L51.49 19.42L51.29 19.12L51.05 18.54L50.96 18.09L50.95 17.09L51.02 16.88L51.77 16.82L52.98 16.84L53.05 17.68L53.29 18.26L53.61 18.62L54.05 18.82L54.55 18.86L54.99 18.76L55.42 18.47L55.63 18.09L55.68 17.46L55.53 17.06L55.33 16.76L54.56 16.03L52.44 14.51L51.76 13.83L51.38 13.26L51.09 12.50L51.00 11.86L51.00 11.05L51.20 10.24L51.47 9.70L51.67 9.44L52.33 8.97L52.96 8.73ZM66.20 8.61L67.63 8.59L68.50 8.78L68.94 8.97L69.39 9.29L69.71 9.70L69.89 10.06L70.13 10.96L70.18 12.32L70.12 12.80L69.91 12.86L68.59 12.95L68.05 12.95L68.00 12.91L68.00 12.05L67.91 11.28L67.76 10.74L67.58 10.42L67.39 10.24L67.13 10.14L66.64 10.14L66.29 10.29L65.97 10.74L65.82 11.23L65.68 12.36L65.68 16.59L65.82 17.77L65.97 18.21L66.12 18.47L66.29 18.62L66.64 18.77L67.13 18.77L67.39 18.67L67.65 18.47L67.89 17.99L68.00 17.59L68.11 16.11L69.41 16.14L70.18 16.18L70.22 16.23L70.23 17.14L70.13 17.91L69.89 18.71L69.71 19.08L69.51 19.38L69.03 19.85L68.58 20.12L67.86 20.32L67.41 20.36L66.36 20.36L65.96 20.32L65.33 20.17L64.61 19.80L64.40 19.65L64.01 19.21L63.70 18.62L63.46 17.86L63.32 17.09L63.27 15.73L63.23 15.55L63.23 13.18L63.32 12.00L63.61 10.74L64.01 9.88L64.38 9.43L64.62 9.22L65.29 8.83L65.73 8.68ZM42.24 8.79L44.55 8.77L44.63 8.82L44.64 17.45L44.73 18.04L44.88 18.39L45.06 18.58L45.41 18.73L45.82 18.72L46.17 18.62L46.74 18.28L47.00 17.95L47.00 8.82L47.09 8.77L49.44 8.79L49.44 20.16L47.61 20.16L47.54 19.05L47.45 18.78L47.15 19.15L46.39 19.85L45.89 20.12L45.45 20.27L44.95 20.36L44.28 20.36L43.56 20.21L42.99 19.88L42.70 19.53L42.37 18.77L42.23 17.91ZM59.29 8.79L61.50 8.77L61.59 8.82L61.59 20.09L61.54 20.18L59.36 20.18L59.28 20.13Z';

interface LyricsPanelProps {
  onBack?: () => void;
  fullScreen?: boolean;
}

const formatLyricsTime = (sec: number) => {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * A compact lyrics reader for Quick Access and a larger reader for the
 * dedicated route. The two views share the same data and gamepad controls.
 */
export const LyricsPanel = ({ onBack, fullScreen = false }: LyricsPanelProps) => {
  const { t, translateLyrics, resolvedTranslationLanguage } = useI18n();
  const [track, setTrack] = useState(getCurrentTrack);
  const [playing, setPlaying] = useState(getIsPlaying);
  const [cast, setCast] = useState(() => ({ connected:getIsCastConnected(), sender:getCastSenderName() }));
  const [result, setResult] = useState<LyricsResult & { forVideoId?: string }>({});
  const [translatedLines, setTranslatedLines] = useState<string[] | null>(null);
  const [translationError, setTranslationError] = useState('');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationAttempt, setTranslationAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const manualScroll = useRef<ReturnType<typeof createReaderScroller> | null>(null);
  useEffect(() => {
    if (scrollRef.current) manualScroll.current=createReaderScroller(scrollRef.current);
    return () => { manualScroll.current?.dispose(); manualScroll.current=null; };
  }, [track?.videoId, loading, result.lyrics]);

  const rootRef = useRef<HTMLDivElement>(null);
  const [activeLine, setActiveLine] = useState(-1);
  const autoScroll = useRef<{ pause():boolean|void; dispose():void; setPlaying?(value:boolean):void } | null>(null);
  useEffect(() => focusLyricsReader(fullScreen ? rootRef.current : scrollRef.current), [fullScreen]);
  useEffect(() => addTrackChangeListener(setTrack), []);
  useEffect(() => addPlayStateListener(setPlaying), []);

  useEffect(() => {
    setAttempt(0);
    setTranslationAttempt(0);
  }, [track?.videoId]);

  useEffect(() => {
    let alive = true;
    setLoading(!!track?.videoId);
    if (attempt === 0) {
      setResult({});
      setActiveLine(-1);
      manualScroll.current?.cancel();
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
    const currentId = track?.videoId;
    let autoRetryTimer: ReturnType<typeof setTimeout> | undefined;
    if (currentId) {
      const liveDur = track.duration || getProgress().duration;
      void loadLyrics(currentId, { ...track, duration:liveDur }).then(value => {
        if (!alive) return;
        setResult({ ...value, forVideoId: currentId });
        if ((value.error || !value.lyrics) && attempt < 3) {
          const delay = attempt === 0 ? 1500 : attempt === 1 ? 3500 : 7000;
          autoRetryTimer = setTimeout(() => { if (alive) setAttempt(a => a + 1); }, delay);
        }
      })
        .catch(() => {
          if (!alive) return;
          setResult({ error: 'Could not load lyrics. Please try again.', forVideoId: currentId });
          if (attempt < 3) {
            const delay = attempt === 0 ? 1500 : attempt === 1 ? 3500 : 7000;
            autoRetryTimer = setTimeout(() => { if (alive) setAttempt(a => a + 1); }, delay);
          }
        })
        .finally(() => { if (alive) setLoading(false); });
    }
    return () => {
      alive = false;
      if (autoRetryTimer) clearTimeout(autoRetryTimer);
    };
  }, [track?.videoId, attempt]);

  useEffect(() => {
    let alive = true;
    if (translationAttempt === 0) setTranslatedLines(null);
    setTranslationError('');
    setTranslationLoading(false);
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    if (translateLyrics && result.lyrics) {
      const text = result.timedLines?.length ? result.timedLines.map(line => line.text).join('\n') : result.lyrics;
      setTranslationLoading(true);
      void loadTranslatedLyrics(text, resolvedTranslationLanguage)
        .then(value => {
          if (!alive) return;
          if (value.translatedLines?.length) setTranslatedLines(value.translatedLines);
          setTranslationError(value.error || '');
          if ((value.error || value.complete === false || !value.translatedLines?.length) && translationAttempt < 3) {
            const delay = translationAttempt === 0 ? 2000 : translationAttempt === 1 ? 4500 : 9000;
            retryTimer = setTimeout(() => { if (alive) setTranslationAttempt(a => a + 1); }, delay);
          }
        })
        .catch(() => {
          if (!alive) return;
          setTranslationError('Translation is temporarily unavailable');
          if (translationAttempt < 3) {
            const delay = translationAttempt === 0 ? 2000 : translationAttempt === 1 ? 4500 : 9000;
            retryTimer = setTimeout(() => { if (alive) setTranslationAttempt(a => a + 1); }, delay);
          }
        })
        .finally(() => { if (alive) setTranslationLoading(false); });
    }
    return () => { alive = false; if (retryTimer) clearTimeout(retryTimer); };
  }, [translateLyrics, resolvedTranslationLanguage, result.lyrics, result.timedLines, translationAttempt]);

  // Browser wake lock and suspend protection supplement Steam's native
  // screensaver settings; synthetic mouse events do not reset Steam's idle clock.
  useEffect(() => {
    if (!fullScreen) return;
    const releasePower = acquireFullscreenPower();
    let releaseSuspend: (() => void) | undefined;
    let wakeLock: WakeLockSentinel | undefined;
    let pending = false;
    let disposed = false;
    const doc = rootRef.current?.ownerDocument || document;
    try {
      const store = (window as any).SuspendResumeStore;
      if (typeof store?.BlockSuspendAction === 'function') releaseSuspend = store.BlockSuspendAction();
    } catch { /* Suspend protection is optional on other Steam clients. */ }
    const acquireWakeLock = async () => {
      if (disposed || pending || doc.visibilityState !== 'visible' || (wakeLock && !wakeLock.released)) return;
      pending = true;
      try {
        const provider = doc.defaultView?.navigator || navigator;
        if (provider.wakeLock?.request) {
          const acquired = await provider.wakeLock.request('screen');
          if (disposed) await acquired.release();
          else wakeLock = acquired;
        }
      } catch { /* Native Steam protection remains active if wake lock is unavailable. */ }
      finally { pending = false; }
    };
    const onVisibility = () => { if (doc.visibilityState === 'visible') void acquireWakeLock(); };
    doc.addEventListener('visibilitychange', onVisibility);
    void acquireWakeLock();
    return () => {
      disposed = true;
      doc.removeEventListener('visibilitychange', onVisibility);
      releasePower();
      try { releaseSuspend?.(); } catch { /* already released by Steam */ }
      void wakeLock?.release().catch(() => {});
    };
  }, [fullScreen]);

  useEffect(() => fullScreen ? suppressFullscreenNotifications() : undefined, [fullScreen]);
  useEffect(() => addCastConnectionListener((connected, sender) => setCast({ connected, sender })), []);
  useEffect(() => {
    if (loading || !result.lyrics || !scrollRef.current) return;
    const lines = result.timedLines;
    const move=(top:number,instant:boolean)=>{
      if(manualScroll.current)manualScroll.current.scrollTo(top,instant);
      else scrollRef.current?.scrollTo({top,behavior:instant?'auto':'smooth'});
    };
    const syncProgressBar = (pos?: number) => {
      if (!fullScreen || typeof rootRef.current?.querySelector !== 'function') return;
      const fillEl = rootRef.current.querySelector<HTMLElement>('.ytm-fullscreen-progress-fill');
      const timeEl = rootRef.current.querySelector<HTMLElement>('.ytm-fullscreen-progress-time');
      if (!fillEl && !timeEl) return;
      const prog = typeof getProgress === 'function' ? (getProgress() || { position: 0, duration: 0 }) : { position: 0, duration: 0 };
      const cur = typeof pos === 'number' && Number.isFinite(pos) ? pos : (typeof getLivePlaybackPosition === 'function' ? getLivePlaybackPosition() : prog.position) || 0;
      const dur = Math.max(0, Number(prog.duration) || Number(track?.duration) || 0);
      const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
      if (fillEl?.style) fillEl.style.width = `${pct.toFixed(1)}%`;
      if (timeEl) timeEl.textContent = dur > 0 ? `${formatLyricsTime(cur)} / ${formatLyricsTime(dur)}` : formatLyricsTime(cur);
    };
    const motion = lines?.length
      ? followSyncedLyrics(scrollRef.current, lines, getLivePlaybackPosition, listener => {
          const wrapped = (pos: number) => {
            syncProgressBar(pos);
            listener(pos);
          };
          const unsubscribe = addProgressListener(wrapped);
          const timer = window.setInterval(() => {
            if (getIsPlaying() && rootRef.current?.ownerDocument?.visibilityState !== 'hidden') wrapped(getLivePlaybackPosition());
          }, 100);
          return () => { unsubscribe(); window.clearInterval(timer); };
        }, setActiveLine, move)
      : fullScreen ? startLyricsScroll(scrollRef.current, 2000) : null;
    if (!motion) return;
    if (!lines?.length) (motion as { setPlaying?(value:boolean):void }).setPlaying?.(playing);
    autoScroll.current = motion;
    return () => { motion.dispose(); autoScroll.current = null; };
  }, [fullScreen, loading, result.lyrics, result.timedLines, track?.videoId]);
  useEffect(() => {
    if (!result.timedLines?.length) autoScroll.current?.setPlaying?.(playing);
  }, [playing, result.timedLines]);
  const staleTrack = !!(track?.videoId && result.forVideoId && result.forVideoId !== track.videoId);
  const effectiveLoading = loading || staleTrack;
  const centered = fullScreen && (!track || (!effectiveLoading && !result.lyrics && !result.error));
  const source = lyricsSource(result.source);
  const pauseMotion = () => { if(autoScroll.current?.pause())manualScroll.current?.cancel(); };
  const pauseForPointer = () => { pauseMotion(); manualScroll.current?.cancel(); };
  useEffect(() => {
    if (!fullScreen || !rootRef.current || typeof rootRef.current.animate !== 'function') return;
    if (rootRef.current.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animations = Array.from(rootRef.current.querySelectorAll<HTMLElement>('.ytm-cover-column, .ytm-reader'))
      .map(element => element.animate([{ opacity:.15, transform:'translateY(4px)' }, { opacity:1, transform:'translateY(0)' }], { duration:260, easing:'ease-out' }));
    return () => animations.forEach(animation => animation.cancel());
  }, [fullScreen]);
  const palette = useArtworkPalette(track?.albumArt, rootRef);
  const accent = palette[0];
  const translatedColor = translationColor(palette[1]);
  const translationIndicator=translateLyrics && <span className="ytm-translation-indicator" role="img" aria-label={t('language.translate')} title={t('language.translate')} style={{color:translatedColor}}><MdTranslate size={fullScreen?22:17} aria-hidden="true"/></span>;
  const transportBusy = useRef(false);
  const changeTrack = async (previous: boolean) => {
    if (transportBusy.current || !track) return;
    transportBusy.current = true;
    try { await (previous ? playPrevious() : playNext()); }
    catch { /* Keep the reader usable if the transport is temporarily unavailable. */ }
    finally { transportBusy.current = false; }
  };

  const scroll = (direction: number, page = false) => {
    pauseMotion();
    const el = scrollRef.current;
    if (el) manualScroll.current?.scroll(direction * (page ? Math.max(120, el.clientHeight * 0.75) : fullScreen ? 140 : 80));
  };

  const leaving = useRef(false);
  const initialProg = typeof getProgress === 'function' ? (getProgress() || { position: 0, duration: 0 }) : { position: 0, duration: 0 };
  const initialPos = Math.max(0, Number(initialProg.position) || 0);
  const initialDur = Math.max(0, Number(initialProg.duration) || Number(track?.duration) || 0);
  const initialPct = initialDur > 0 ? Math.min(100, Math.max(0, (initialPos / initialDur) * 100)) : 0;
  const artwork = (() => {
    const original = track?.albumArt || '';
    if (!fullScreen) return original;
    try {
      const url = new URL(original);
      if (url.hostname.endsWith('.googleusercontent.com') || url.hostname.endsWith('.ggpht.com'))
        return original.replace(/=w\d+-h\d+/, '=w800-h800').replace(/=s\d+([^a-z]|$)/, '=w800-h800$1');
    } catch {}
    return original;
  })();
  const leave = onBack ?? (() => {
    if (leaving.current) return;
    leaving.current = true;
    if (fullScreen) void returnBrowseToPlayer(1, rootRef.current);
    else void backFromBrowse(rootRef.current);
  });
  const openFullscreen = () => { Navigation.Navigate(LYRICS_ROUTE); Navigation.CloseSideMenus(); };
  const rootStyle: CSSProperties = fullScreen
    ? { width: '100%', maxWidth: '100%', minWidth: 0, top: 40, bottom: 40, left: 0, right: 0, minHeight: 0, overflow: 'hidden', boxSizing: 'border-box' as const, padding: '16px clamp(16px, 3vw, 42px)', display: 'flex', flexDirection: 'column' as const, background: '#080b11', position: 'fixed' as const, outline:'none' }
    : { position:'relative', isolation:'isolate', width: '100%', maxWidth: '100%', minWidth: 0, height: '100%', minHeight: 0, overflow: 'hidden', boxSizing: 'border-box' as const, padding: '6px 4px 4px', display: 'flex', flexDirection: 'column' as const, gap: 8, background: '#101823' };
  const readerStyle = fullScreen
    ? { flex: '1 1 0', minHeight: 0, boxSizing: 'border-box' as const, padding: 'clamp(18px, 3vw, 40px)', overflowY: 'scroll' as const, overscrollBehavior: 'contain' as const, scrollBehavior: 'auto' as const, textAlign: 'center' as const, fontFamily:'"YouTube Sans", Roboto, Arial, sans-serif', fontSize: 'clamp(20px, 2.1vw, 32px)', lineHeight: 1.72, letterSpacing:'-.014em', whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const }
    : { flex: '1 1 0', minHeight: 0, boxSizing: 'border-box' as const, padding: '10px 12px', overflowY: 'scroll' as const, overscrollBehavior: 'contain' as const, scrollBehavior: 'auto' as const, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const };

  const lyricsContent = effectiveLoading
    ? <div className="ytm-muted" style={fullScreen ? { height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:500, opacity:0, letterSpacing:'.02em', animation:'ytm-pulse 1.8s ease-in-out 400ms infinite' } : undefined}>{t('lyrics.loading')}</div>
    : result.error
      ? (
          <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, textAlign:'center', padding:fullScreen ? '0 24px' : '0 12px' }}>
            <div style={{ fontSize:fullScreen ? 'clamp(16px, 1.8vw, 22px)' : 12, fontWeight:fullScreen ? 600 : 500, color:'rgba(255, 255, 255, 0.72)', lineHeight:1.45, maxWidth:440, letterSpacing:'-.01em' }}>
              {result.error}
            </div>
          </div>
        )
      : result.timedLines?.length
        ? <div style={{ paddingBlock:fullScreen ? '26vh' : '8vh' }}>
            {result.timedLines.map((line, index) => <div key={index} data-lyric-index={index}
              className={`ytm-lyric-line${index === activeLine ? ' ytm-lyric-active' : ''}`}
              style={{ display:'block', position:'relative', padding:fullScreen ? '18px 0' : '9px 0', margin:0, lineHeight:1.6, fontWeight:fullScreen ? 650 : 600, whiteSpace:'pre-wrap', color:index === activeLine ? '#fff' : 'rgba(255,255,255,.42)' }}>
              <div className="ytm-lyric-pair" style={{transform:index === activeLine ? `scale(${fullScreen ? 1.08 : 1.03})` : `scale(${fullScreen ? .90 : .92})`, opacity:index === activeLine ? 1 : .30, transformOrigin:'center', transition:'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease-out',color:'#fff'}}>
                <span style={{display:'block'}}>{line.text || '\u00a0'}</span>
                {translatedLines?.[index] && translatedLines[index] !== line.text && <span style={{display:'block',fontFamily:'"YouTube Sans", Roboto, "Noto Sans", Arial, sans-serif',fontSize:fullScreen ? '.76em' : '.70em',fontWeight:550,color:translatedColor,opacity:.92,lineHeight:1.45,letterSpacing:'-.01em',marginTop:4}}><span className="ytm-translation-reveal">{translatedLines[index]}</span></span>}
              </div>
            </div>)}
          </div>
        : result.lyrics
          ? translatedLines ? <div>{result.lyrics.split('\n').map((line,index) => <div key={index} style={{marginBottom:fullScreen ? 18 : 10}}><div>{line || '\u00a0'}</div>{translatedLines[index] && translatedLines[index] !== line && <div style={{fontFamily:'"YouTube Sans", Roboto, "Noto Sans", Arial, sans-serif',fontSize:fullScreen ? '.76em' : '.70em',fontWeight:550,color:translatedColor,opacity:.82,lineHeight:1.45,letterSpacing:'-.01em',marginTop:4}}><span className="ytm-translation-reveal">{translatedLines[index]}</span></div>}</div>)}</div> : result.lyrics
          : (track ? 'Lyrics not available' : 'Your next song starts here.');

  return (
    <Focusable ref={rootRef} tabIndex={fullScreen ? 0 : undefined} preferredFocus={fullScreen} noFocusRing className={`ytm-ui ytm-lyrics-view${fullScreen ? ' ytm-immersive' : ''}`} flow-children="vertical"
      style={{ ...rootStyle, '--ytm-cover-accent':accent } as CSSProperties & { '--ytm-cover-accent':string }}
      onCancelButton={event => { event.preventDefault(); event.stopPropagation(); leave(); }}
      onSecondaryActionDescription={!fullScreen ? t('lyrics.fullscreen') : undefined}
      onSecondaryButton={!fullScreen ? event => { event.preventDefault(); event.stopPropagation(); openFullscreen(); } : undefined}
      onCancelActionDescription={t('common.back')}
      onOKActionDescription={fullScreen ? `${t('player.play')} / ${t('player.pause')}` : undefined}
      onOKButton={fullScreen ? event => { event.preventDefault(); event.stopPropagation(); if (track) togglePlayback(); } : undefined}
      onGamepadDirection={fullScreen ? event => {
        const button = event.detail.button;
        if (button === GamepadButton.DIR_UP || button === GamepadButton.DIR_DOWN) {
          event.preventDefault(); event.stopPropagation(); scroll(button === GamepadButton.DIR_UP ? -1 : 1);
        }
      } : undefined}
      onButtonDown={event => {
        const button = event.detail.button;
        if (fullScreen && (button === GamepadButton.BUMPER_LEFT || button === GamepadButton.BUMPER_RIGHT)) {
          event.preventDefault(); event.stopPropagation();
          if (fullScreen) {
            if (!event.detail.is_repeat) void changeTrack(button === GamepadButton.BUMPER_LEFT);
          }
        }
      }}>
      <ThemeScope />
      {fullScreen && <ArtworkBackdrop palette={palette} animated />}
      {!fullScreen && <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexShrink: 0, minHeight:28, alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        {!fullScreen && <div style={{ display:'inline-flex', alignItems:'center', gap:4, flexShrink:0 }}><SiYoutubemusic className="ytm-cover-logo" size={20} style={{ color:`rgb(${accent})`, flexShrink:0 }} aria-label="YouTube Music" /><svg className="ytm-wordmark" viewBox="27.8 0 42.5 24" aria-hidden="true" style={{ display:'block', height:20, width:'auto', fill:translatedColor, flexShrink:0 }}><path d={MUSIC_WORDMARK_PATH} /></svg></div>}
        <div style={{ minWidth: 0, flex: 1, padding: 0 }} />
        {!fullScreen && <DialogButton className="ytm-button" aria-label={t('lyrics.fullscreen')} onOKActionDescription={t('lyrics.fullscreen')} style={{ width:32, flexShrink:0, minWidth:32, height:28, minHeight:28, padding:0, margin:0, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={openFullscreen}><FaExpand size={13} /></DialogButton>}
        <DialogButton className="ytm-button" onOKActionDescription={t('common.back')} style={{ width:72, minWidth:0, height:28, minHeight:28, padding:'0 8px', lineHeight:'28px', margin:0, fontSize:11 }} onClick={leave}><FaArrowLeft /> {t('common.back')}</DialogButton>
      </div>}
      <div className="ytm-lyrics-layout" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'row', gap: fullScreen ? 'clamp(18px, 4vw, 54px)' : 10, flex: 1, minHeight: 0, minWidth: 0, overflow: fullScreen ? 'visible' : 'hidden', alignItems: fullScreen ? 'center' : 'stretch', justifyContent:fullScreen ? 'center' : undefined, maxWidth:fullScreen ? 860 : undefined, width:'100%', margin:fullScreen ? '0 auto' : undefined }}>
        <div className="ytm-cover-column" style={{ width: fullScreen ? 'min(26vw, 260px, max(80px, calc(100vh - 360px)))' : 78, minWidth: fullScreen ? 80 : 78, maxWidth: fullScreen ? (centered ? '80%' : '30%') : 78, maxHeight:fullScreen ? '100%' : undefined, flex: '0 0 auto', overflow: fullScreen ? 'visible' : 'hidden', textAlign: fullScreen ? 'center' : 'left', paddingBlock:fullScreen ? 8 : 0, boxSizing:'border-box' }}>
          {fullScreen && track && <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:5, margin:'0 auto 12px' }}>
            <SiYoutubemusic className="ytm-cover-logo" size={28} style={{ display:'block', width:'clamp(24px, 2.1vw, 30px)', height:'clamp(24px, 2.1vw, 30px)', minHeight:24, overflow:'visible', color:`rgb(${accent})` }} aria-label="YouTube Music" />
            <svg className="ytm-wordmark" viewBox="27.8 0 42.5 24" aria-hidden="true" style={{ display:'block', height:'clamp(24px, 2.1vw, 30px)', width:'auto', fill:translatedColor, overflow:'visible' }}><path d={MUSIC_WORDMARK_PATH} /></svg>
          </div>}
          {track?.albumArt ? <div style={{ width: fullScreen ? '100%' : 78, height: fullScreen ? undefined : 78, aspectRatio: '1 / 1', borderRadius: fullScreen ? 12 : 6, overflow: 'hidden', background: 'rgba(255, 255, 255, 0.04)', boxShadow: fullScreen ? '0 16px 56px -6px rgba(0, 0, 0, 0.36), 0 6px 22px -4px rgba(0, 0, 0, 0.20), 0 0 0 1px rgba(255, 255, 255, 0.08)' : '0 4px 12px rgba(0, 0, 0, 0.28)' }}><img key={track.videoId} src={artwork} onError={event => { if (event.currentTarget.src !== track.albumArt) event.currentTarget.src = track.albumArt; }} alt="Album art" style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover', transform: (/\.ytimg\.com\//.test(artwork) && /\/(?:hq|sd)default\./.test(artwork) && !artwork.includes('sqp=')) ? 'scale(1.35)' : undefined }} /></div>
            : <div className="ytm-card" style={{ width: '100%', aspectRatio: '1', display: 'grid', placeItems: 'center', borderRadius: fullScreen ? 12 : 6 }}><SiYoutubemusic size={fullScreen ? 84 : 26} /></div>}
          <OverflowTextGroup textKey={`${fullScreen}|${track?.title}|${track?.artist}`}>
          <h2 style={{ fontSize: fullScreen ? 'clamp(18px, 1.8vw, 22px)' : 13, fontWeight: 700, letterSpacing: '-.018em', lineHeight: 1.25, color: '#f8fafc', margin: fullScreen ? '16px 0 5px' : '8px 0 3px', whiteSpace: fullScreen ? 'normal' : undefined, overflowWrap: 'anywhere', overflow: fullScreen ? 'visible' : 'hidden' }}>{track?.title ?? 'Nothing playing'}</h2>
          <div className="ytm-muted ytm-artist-name" style={{ color:track?.artist?translatedColor:undefined, fontSize: fullScreen ? 14.5 : 11.5, fontWeight: 500, lineHeight: 1.35, whiteSpace: fullScreen ? 'normal' : undefined, overflowWrap: 'anywhere', overflow: fullScreen ? 'visible' : 'hidden' }}>{track?.artist || 'Play a song to see its lyrics.'}</div>

          </OverflowTextGroup>
          {fullScreen && track && <div className="ytm-fullscreen-progress" style={{ marginTop:12, width:'100%' }}>
            <div style={{ width:'100%', height:3, borderRadius:999, background:`rgba(${accent}, 0.24)`, overflow:'hidden' }}>
              <div className="ytm-fullscreen-progress-fill" style={{ width:`${initialPct.toFixed(1)}%`, height:'100%', borderRadius:999, background:`rgb(${accent})`, transition:'width 150ms linear' }} />
            </div>
            <div className="ytm-fullscreen-progress-time" style={{ marginTop:5, fontSize:10, lineHeight:1.3, color:translatedColor, opacity:.82, fontVariantNumeric:'tabular-nums', letterSpacing:'.02em' }}>
              {initialDur > 0 ? `${formatLyricsTime(initialPos)} / ${formatLyricsTime(initialDur)}` : formatLyricsTime(initialPos)}
            </div>
          </div>}
          {fullScreen && cast.connected && <div className="ytm-muted ytm-cast-details" style={{ color:translatedColor, display:'inline-flex', alignItems:'center', justifyContent:'center', textAlign:'center', fontSize:11, fontWeight:500, lineHeight:1.35, marginTop:10, padding:'3px 10px', borderRadius:999, background:'rgba(255, 255, 255, 0.06)', border:'1px solid rgba(255, 255, 255, 0.08)', overflowWrap:'anywhere' }}>
            <MdCastConnected size={12} style={{ verticalAlign:'middle', marginRight:6 }} />{cast.sender || 'Connected device'}
          </div>}
          {source && <div className="ytm-lyrics-source" style={{ display:'none', marginTop:12, fontSize:fullScreen ? 10 : 9, lineHeight:1.4, color:`rgb(${accent})`, opacity:.82, overflowWrap:'anywhere' }}>
            Source: {source}
          </div>}
          {translateLyrics && <div className="ytm-translation-status" style={{ marginTop:8, display:'flex', alignItems:'center', justifyContent:fullScreen ? 'center' : 'flex-start', gap:6, color:translatedColor }}>
            {translationIndicator}
            {translationLoading && <span role="status" style={{minWidth:0,fontSize:fullScreen ? 10 : 9,lineHeight:1.4,overflowWrap:'anywhere'}}>{t('lyrics.translating')}</span>}
          </div>}
          {translateLyrics && translationError && !translationLoading && <div className="ytm-translation-error" role="status" style={{ marginTop:6, fontSize:fullScreen ? 10 : 9, lineHeight:1.4, color:translatedColor, overflowWrap:'anywhere' }}>
            {translationError}
            <DialogButton className="ytm-button" style={{ width:'100%', minWidth:0, height:'auto', minHeight:26, marginTop:5, padding:'4px 6px', fontSize:10 }} onClick={() => setTranslationAttempt(value => value + 1)}>{t('lyrics.retryTranslation')}</DialogButton>
          </div>}
        </div>
        {!centered && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 0', maxWidth:fullScreen ? 620 : undefined, alignSelf: 'stretch', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
          <Focusable ref={scrollRef} preferredFocus={!fullScreen} noFocusRing tabIndex={0} onWheel={pauseForPointer} onTouchStart={pauseForPointer} onTouchMove={pauseForPointer} onPointerDown={pauseForPointer} onPointerMove={event=>{if(event.buttons)pauseForPointer();}} onPointerUp={pauseForPointer} focusClassName="ytm-reader-focus"
            className="ytm-reader ytm-card" role="region" aria-label={t('lyrics.region')}
            onGamepadDirection={event => {
              const button = event.detail.button;
              if (button === GamepadButton.DIR_UP || button === GamepadButton.DIR_DOWN) {
                event.preventDefault(); event.stopPropagation(); scroll(button === GamepadButton.DIR_UP ? -1 : 1);
              }
            }}
            onKeyDown={event => {
              if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) {
                event.preventDefault(); scroll(event.key.endsWith('Up') ? -1 : 1, event.key.startsWith('Page'));
              }
            }}
            style={{ ...readerStyle, outline:'none', ...(fullScreen ? { background:'transparent', border:0, boxShadow:'none', WebkitMaskImage:result.error || effectiveLoading ? 'none' : 'linear-gradient(transparent,#000 12%,#000 86%,transparent)' } : {}) }}>
            {lyricsContent}
          </Focusable>

        </div>}
      </div>
    </Focusable>
  );
};

// Kept for compatibility with old route registrations and external callers.
export const LyricsPage = () => <LyricsPanel onBack={() => { void returnBrowseToPlayer(); }} />;

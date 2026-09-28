import { DialogButton, Focusable, GamepadButton, Navigation, QuickAccessTab } from '@decky/ui';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { FaArrowLeft, FaExpand } from 'react-icons/fa';
import { addTrackChangeListener, getCurrentTrack, addCastConnectionListener, getIsCastConnected, getCastSenderName, getProgress, addProgressListener, playNext, playPrevious, togglePlayback } from '../services/audioManager';
import { loadLyrics, type LyricsResult } from '../services/lyrics';
import { focusLyricsReader } from '../services/focus';

import { MdCastConnected } from 'react-icons/md';
import { SiYoutubemusic } from 'react-icons/si';
import { followSyncedLyrics } from '../services/syncedLyrics';
import { startLyricsScroll } from '../services/lyricsScroll';
import { suppressFullscreenNotifications } from '../services/notifications';
import { useArtworkPalette } from '../services/artworkPalette';
import { ArtworkBackdrop } from './ArtworkBackdrop';
import { ThemeScope } from './ThemeScope';
import { OverflowText, OverflowTextGroup } from './OverflowText';
import { lyricsSource } from '../services/lyricsSource';

export const LYRICS_ROUTE = '/youtube-music-lyrics';

interface LyricsPanelProps {
  onBack?: () => void;
  fullScreen?: boolean;
}

/**
 * A compact lyrics reader for Quick Access and a larger reader for the
 * dedicated route. The two views share the same data and gamepad controls.
 */
export const LyricsPanel = ({ onBack, fullScreen = false }: LyricsPanelProps) => {
  const [track, setTrack] = useState(getCurrentTrack);
  const [cast, setCast] = useState(() => ({ connected:getIsCastConnected(), sender:getCastSenderName() }));
  const [result, setResult] = useState<LyricsResult>({});
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const [activeLine, setActiveLine] = useState(-1);
  const autoScroll = useRef<ReturnType<typeof startLyricsScroll> | null>(null);
  useEffect(() => focusLyricsReader(fullScreen ? rootRef.current : scrollRef.current), [fullScreen]);
  useEffect(() => addTrackChangeListener(setTrack), []);

  useEffect(() => {
    let alive = true;
    setResult({});
    setActiveLine(-1);
    setLoading(!!track?.videoId);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (track?.videoId) {
      void loadLyrics(track.videoId, { ...track, duration:track.duration || getProgress().duration }).then(value => { if (alive) setResult(value); })
        .catch(() => { if (alive) setResult({ error: 'Could not load lyrics. Please try again.' }); })
        .finally(() => { if (alive) setLoading(false); });
    }
    return () => { alive = false; };
  }, [track?.videoId, attempt]);

  // Deck exposes this store in SteamOS. BlockSuspendAction prevents the Deck
  // from suspending while the dedicated reader is open; the browser wake lock
  // covers displays/firmware that support that API. Both are released on exit.
  useEffect(() => {
    if (!fullScreen) return;
    let releaseSuspend: (() => void) | undefined;
    let wakeLock: WakeLockSentinel | undefined;
    let pending = false;
    let disposed = false;
    try {
      const store = (window as unknown as { SuspendResumeStore?: { BlockSuspendAction?: () => (() => void) } }).SuspendResumeStore;
      if (typeof store?.BlockSuspendAction === 'function') releaseSuspend = store.BlockSuspendAction();
    } catch { /* Deck builds without this store simply use the wake lock. */ }
    const acquireWakeLock = async () => {
      if (disposed || pending || document.visibilityState !== 'visible' || (wakeLock && !wakeLock.released)) return;
      pending = true;
      try {
        if (navigator.wakeLock?.request) {
          const acquired = await navigator.wakeLock.request('screen');
          if (disposed) await acquired.release();
          else wakeLock = acquired;
        }
      } catch { /* Wake lock is optional; BlockSuspendAction is still active. */ }
      finally { pending = false; }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void acquireWakeLock(); };
    document.addEventListener('visibilitychange', onVisibility);
    void acquireWakeLock();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      try { releaseSuspend?.(); } catch { /* already released by Steam */ }
      void wakeLock?.release().catch(() => {});
    };
  }, [fullScreen]);

  useEffect(() => fullScreen ? suppressFullscreenNotifications() : undefined, [fullScreen]);
  useEffect(() => addCastConnectionListener((connected, sender) => setCast({ connected, sender })), []);
  useEffect(() => {
    if (loading || !result.lyrics || !scrollRef.current) return;
    const lines = result.timedLines;
    const motion = lines?.length
      ? followSyncedLyrics(scrollRef.current, lines, () => getProgress().position, addProgressListener, setActiveLine)
      : fullScreen ? startLyricsScroll(scrollRef.current) : null;
    if (!motion) return;
    autoScroll.current = motion;
    return () => { motion.dispose(); autoScroll.current = null; };
  }, [fullScreen, loading, result.lyrics, result.timedLines, track?.videoId]);
  const centered = fullScreen && (!track || (!loading && !result.lyrics && !result.error));
  const source = lyricsSource(result.source);
  const pauseMotion = () => autoScroll.current?.pause();
  useEffect(() => {
    if (!fullScreen || !rootRef.current || typeof rootRef.current.animate !== 'function') return;
    if (rootRef.current.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animations = Array.from(rootRef.current.querySelectorAll<HTMLElement>('.ytm-cover-column, .ytm-reader'))
      .map(element => element.animate([{ opacity:.15, transform:'translateY(4px)' }, { opacity:1, transform:'translateY(0)' }], { duration:300, easing:'ease-out' }));
    return () => animations.forEach(animation => animation.cancel());
  }, [fullScreen]);
  const palette = useArtworkPalette(track?.albumArt, rootRef);
  const accent = palette[0];
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
    if (el) el.scrollBy({ top: direction * (page ? Math.max(80, el.clientHeight * 0.75) : 64), behavior: 'smooth' });
  };

  const leaving = useRef(false);
  const artwork = (() => {
    const original = track?.albumArt || '';
    if (!fullScreen) return original;
    try {
      const url = new URL(original);
      if (url.hostname.endsWith('.googleusercontent.com') || url.hostname.endsWith('.ggpht.com'))
        return original.replace(/=w\d+-h\d+[^?]*/, '=w800-h800-l90-rj');
    } catch {}
    return original;
  })();
  const leave = onBack ?? (() => {
    if (leaving.current) return;
    leaving.current = true;
    Navigation.NavigateBack();
    if (fullScreen) {
      window.dispatchEvent(new Event('ytm-return-player'));
      setTimeout(() => Navigation.OpenQuickAccessMenu(QuickAccessTab.Decky), 200);
    }
  });
  const openFullscreen = () => { Navigation.CloseSideMenus(); Navigation.Navigate(LYRICS_ROUTE); };
  const rootStyle: CSSProperties = fullScreen
    ? { width: '100%', maxWidth: '100%', minWidth: 0, top: 40, bottom: 40, left: 0, right: 0, minHeight: 0, overflow: 'hidden', boxSizing: 'border-box' as const, padding: '16px clamp(16px, 3vw, 42px)', display: 'flex', flexDirection: 'column' as const, background: '#080b11', position: 'fixed' as const, outline:'none' }
    : { position:'relative', isolation:'isolate', width: '100%', maxWidth: '100%', minWidth: 0, height: '100%', minHeight: 0, overflow: 'hidden', boxSizing: 'border-box' as const, padding: '6px 4px 4px', display: 'flex', flexDirection: 'column' as const, gap: 8, background: '#101823' };
  const readerStyle = fullScreen
    ? { flex: '1 1 0', minHeight: 0, boxSizing: 'border-box' as const, padding: 'clamp(18px, 3vw, 40px)', overflowY: 'scroll' as const, overscrollBehavior: 'contain' as const, scrollBehavior: 'auto' as const, textAlign: 'center' as const, fontSize: 'clamp(20px, 2.1vw, 32px)', lineHeight: 1.8, whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const }
    : { flex: '1 1 0', minHeight: 0, boxSizing: 'border-box' as const, padding: '10px 12px', overflowY: 'scroll' as const, overscrollBehavior: 'contain' as const, scrollBehavior: 'smooth' as const, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const };

  const lyricsContent = loading
    ? <div className="ytm-muted" style={fullScreen ? { height:'100%', display:'grid', placeItems:'center', fontSize:12, fontWeight:400, opacity:.55 } : undefined}>Loading lyrics…</div>
    : result.error
      ? <span style={{ color: '#ffc3cb' }}>{result.error}</span>
      : result.timedLines?.length
        ? <div style={{ paddingBlock:fullScreen ? '26vh' : '8vh' }}>
            {result.timedLines.map((line, index) => <div key={index} data-lyric-index={index}
              className={`ytm-lyric-line${index === activeLine ? ' ytm-lyric-active' : ''}`}
              style={{ display:'block', position:'relative', padding:fullScreen ? '18px 0' : '9px 0', margin:0, lineHeight:1.6, fontWeight:600, whiteSpace:'pre-wrap', color:index === activeLine ? '#fff' : 'rgba(255,255,255,.42)' }}>
              <span style={{ display:'block', transform:index === activeLine ? `scale(${fullScreen ? 1.08 : 1.03})` : `scale(${fullScreen ? .90 : .92})`, opacity:index === activeLine ? 1 : .68, transformOrigin:'center', transition:'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease-out' }}>{line.text || '\u00a0'}</span>
            </div>)}
          </div>
        : result.lyrics || (track ? 'Lyrics not available' : 'Your next song starts here.');

  return (
    <Focusable ref={rootRef} tabIndex={fullScreen ? 0 : undefined} preferredFocus={fullScreen} noFocusRing className={`ytm-ui ytm-lyrics-view${fullScreen ? ' ytm-immersive' : ''}`} flow-children="vertical"
      style={{ ...rootStyle, '--ytm-cover-accent':accent } as CSSProperties & { '--ytm-cover-accent':string }}
      onCancelButton={event => { event.preventDefault(); event.stopPropagation(); leave(); }}
      onSecondaryActionDescription={!fullScreen ? 'Fullscreen' : undefined}
      onSecondaryButton={!fullScreen ? event => { event.preventDefault(); event.stopPropagation(); openFullscreen(); } : undefined}
      onCancelActionDescription="Back to player"
      onOKActionDescription={fullScreen ? 'Play / pause' : undefined}
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
        {!fullScreen && <SiYoutubemusic className="ytm-cover-logo" size={22} style={{ color:`rgb(${accent})`, flexShrink:0 }} aria-label="YouTube Music" />}
        <div style={{ minWidth: 0, textAlign:'left', flex: 1, padding:0 }}><div style={{ fontSize:15, fontWeight:700 }}>Lyrics</div></div>
        {!fullScreen && <DialogButton className="ytm-button" aria-label="Fullscreen" onOKActionDescription="Fullscreen" style={{ width:32, flexShrink:0, minWidth:32, height:28, minHeight:28, padding:0, margin:0, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={openFullscreen}><FaExpand size={13} /></DialogButton>}
        <DialogButton className="ytm-button" onOKActionDescription="Back" style={{ width:72, minWidth:0, height:28, minHeight:28, padding:'0 8px', lineHeight:'28px', margin:0, fontSize:11 }} onClick={leave}><FaArrowLeft /> Back</DialogButton>
      </div>}
      <div className="ytm-lyrics-layout" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'row', gap: fullScreen ? 'clamp(18px, 4vw, 54px)' : 10, flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', alignItems: fullScreen ? 'center' : 'stretch', justifyContent:fullScreen ? 'center' : undefined, maxWidth:fullScreen ? 860 : undefined, width:'100%', margin:fullScreen ? '0 auto' : undefined }}>
        <div className="ytm-cover-column" style={{ width: fullScreen ? 'min(26vw, 260px, max(80px, calc(100vh - 360px)))' : 78, minWidth: fullScreen ? 80 : 78, maxWidth: fullScreen ? (centered ? '80%' : '30%') : 78, maxHeight:fullScreen ? '100%' : undefined, flex: '0 0 auto', overflowY: fullScreen ? 'auto' : 'hidden', textAlign: fullScreen ? 'center' : 'left', paddingBlock:fullScreen ? 8 : 0, boxSizing:'border-box' }}>
          {fullScreen && track && <SiYoutubemusic className="ytm-cover-logo" size={44} style={{ display:'block', width:'clamp(44px, 3.4vw, 64px)', height:'clamp(44px, 3.4vw, 64px)', minHeight:44, overflow:'visible', margin:'0 auto 20px', color:`rgb(${accent})` }} aria-label="YouTube Music" />}
          {fullScreen && cast.connected && <div className="ytm-muted" style={{ textAlign:'center', fontSize:10, lineHeight:1.4, marginBottom:12, overflowWrap:'anywhere' }}>
            <MdCastConnected size={12} style={{ verticalAlign:'middle', marginRight:6 }} />{cast.sender || 'Connected device'}
          </div>}
          {track?.albumArt ? <img src={artwork} onError={event => { if (event.currentTarget.src !== track.albumArt) event.currentTarget.src = track.albumArt; }} alt="Album art" style={{ width: fullScreen ? '100%' : 78, height: fullScreen ? 'auto' : 78, aspectRatio: '1', display: 'block', maxWidth: '100%', objectFit: 'cover', borderRadius: fullScreen ? 8 : 4, boxShadow:'none' }} />
            : <div className="ytm-card" style={{ width: '100%', aspectRatio: '1', display: 'grid', placeItems: 'center' }}><SiYoutubemusic size={fullScreen ? 84 : 26} /></div>}
          <OverflowTextGroup textKey={`${fullScreen}|${track?.title}|${track?.artist}`}>
          <h2 style={{ fontSize: fullScreen ? 16 : 12, lineHeight: 1.3, margin: fullScreen ? '14px 0 4px' : '8px 0 4px', overflowWrap: 'anywhere', overflow: 'hidden' }}>{fullScreen ? <OverflowText text={track?.title ?? 'Nothing playing'} /> : track?.title ?? 'Nothing playing'}</h2>
          <div className="ytm-muted" style={{ fontSize: fullScreen ? 15 : 11, lineHeight: 1.35, overflowWrap: 'anywhere', overflow:'hidden' }}>{fullScreen ? <OverflowText text={track?.artist || 'Play a song to see its lyrics.'} /> : track?.artist || 'Play a song to see its lyrics.'}</div>

          </OverflowTextGroup>
          {source && <div className="ytm-lyrics-source" style={{ marginTop:12, fontSize:fullScreen ? 10 : 9, lineHeight:1.4, color:`rgb(${accent})`, opacity:.82, overflowWrap:'anywhere' }}>
            Source: {source}
          </div>}
        </div>
        {!centered && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 0', maxWidth:fullScreen ? 620 : undefined, alignSelf: 'stretch', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
          <Focusable ref={scrollRef} preferredFocus={!fullScreen} noFocusRing tabIndex={0} onWheel={pauseMotion} onTouchStart={pauseMotion} onTouchMove={pauseMotion} onPointerDown={pauseMotion} focusClassName="ytm-reader-focus"
            className="ytm-reader ytm-card" role="region" aria-label="Song lyrics"
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
            style={{ ...readerStyle, outline:'none', ...(fullScreen ? { background:'transparent', border:0, boxShadow:'none', WebkitMaskImage:'linear-gradient(transparent,#000 12%,#000 86%,transparent)' } : {}) }}>
            {lyricsContent}
          </Focusable>
          {result.error && <Focusable flow-children="horizontal" style={{ display: 'flex', flexShrink: 0, justifyContent: 'center', minWidth: 0 }}>
            <DialogButton className="ytm-button" style={{ width: 96, minWidth: 0, height: 32, minHeight: 32, padding: '0 8px', margin: 0, lineHeight: '32px', fontSize: 12 }} onClick={() => setAttempt(value => value + 1)}>Retry</DialogButton>
          </Focusable>}
        </div>}
      </div>
    </Focusable>
  );
};

// Kept for compatibility with old route registrations and external callers.
export const LyricsPage = () => {
  let returning = false;
  const back = () => {
    if (returning) return;
    returning = true;
    Navigation.NavigateBack();
    setTimeout(() => { returning = false; Navigation.OpenQuickAccessMenu(QuickAccessTab.Decky); }, 180);
  };
  return <LyricsPanel onBack={back} />;
};

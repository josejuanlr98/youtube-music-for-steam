import { DialogButton, Focusable, Navigation } from '@decky/ui';
import { call } from '@decky/api';
import { useEffect, useRef, useState } from 'react';
import { FaPause, FaMusic, FaStop, FaAlignLeft } from 'react-icons/fa';
import { IoPlay, IoPlaySkipBack, IoPlaySkipForward, IoShuffleOutline as MdShuffle } from 'react-icons/io5';
import { MdRepeat, MdRepeatOne, MdCastConnected } from 'react-icons/md';
import { AiOutlineLike, AiFillLike, AiOutlineDislike, AiFillDislike } from 'react-icons/ai';
import { usePlayer } from '../context/PlayerContext';
import { togglePlayback, playNext, playPrevious, stopAllPlayback, seekPlayback } from '../services/audioManager';
import { VolumeSlider, PaddedSlider } from './VolumeSlider';
import { LyricsPanel, LYRICS_ROUTE } from './LyricsPage';
import { SiYoutubemusic } from 'react-icons/si';
import { useArtworkAccent, defaultAccent } from '../services/artworkPalette';
import { ThemeScope } from './ThemeScope';
import { OverflowText, OverflowTextGroup } from './OverflowText';

const button: React.CSSProperties = { flex:'1 1 0', width:0, minWidth:0, minHeight:28, maxHeight:34, height:30, borderRadius:8, boxSizing:'border-box', lineHeight:'normal', fontSize:12, padding:'0 8px', display:'flex', alignItems:'center', justifyContent:'center', gap:6, margin:0 };
const formatTime = (value: number) => { const total = Math.max(0, Math.floor(value || 0)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };

export const PlayerView = () => {
  const { authenticated, authReady, castNetwork, track, isPlaying, shuffle, repeat, castConnected, castSenderName, position, duration, updateState } = usePlayer();
  const [rating, setRating] = useState('INDIFFERENT');
  const currentVideo = useRef(track?.videoId);
  currentVideo.current = track?.videoId;
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [showLyrics, setShowLyrics] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const accent = useArtworkAccent(track?.albumArt, viewRef);
  useEffect(() => {
    const element = viewRef.current;
    if (!element) return;
    const view = element.ownerDocument.defaultView;
    let frame = 0;
    const reset = () => {
      if (!view) return;
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(() => {
        for (let node: HTMLElement | null = element; node; node = node.parentElement) {
          if (node === element || String(node.className).includes('TabContentsScroll')) node.scrollTop = 0;
          if (node.id === 'ytm-tabs-container') break;
        }
      });
    };
    reset();
    const Observer = view?.IntersectionObserver;
    const observer = Observer ? new Observer(entries => { if (entries.some(entry => entry.isIntersecting)) reset(); }) : null;
    observer?.observe(element);
    window.addEventListener('ytm-return-player', reset);
    return () => { observer?.disconnect(); view?.cancelAnimationFrame(frame); window.removeEventListener('ytm-return-player', reset); };
  }, [showLyrics]);
  useEffect(() => {
    const returnToPlayer = () => setShowLyrics(false);
    window.addEventListener('ytm-return-player', returnToPlayer);
    return () => window.removeEventListener('ytm-return-player', returnToPlayer);
  }, []);
  useEffect(() => { if (!authenticated) setShowLyrics(false); }, [authenticated]);
  useEffect(() => {
    let alive = true;
    setRating('INDIFFERENT');
    if (authenticated && track?.videoId) void call<[string], { rating: string }>('get_song_rating', track.videoId)
      .then(result => { if (alive) setRating(result.rating); }).catch(() => {});
    return () => { alive = false; };
  }, [authenticated, track?.videoId]);

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not complete this action. Please try again.'); }
  };
  const rate = async (value: string) => {
    if (!authenticated || !track) return;
    const videoId = track.videoId;
    const result = await call<[string, string], { rating?: string; error?: string }>('rate_song', track.videoId, rating === value ? 'INDIFFERENT' : value);
    if (result.error) throw new Error(result.error);
    if (result.rating && currentVideo.current === videoId) setRating(result.rating);
  };
  const stop = async () => {
    setStopping(true); setError('');
    try { await stopAllPlayback(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not finish stopping playback. Please try again.'); }
    finally { setStopping(false); }
  };
  const total = duration || track?.duration || 0;

  if (showLyrics && authenticated) return <LyricsPanel onBack={() => setShowLyrics(false)} />;

  return (
    <Focusable ref={viewRef} onSecondaryActionDescription={track && authenticated ? 'Fullscreen lyrics' : undefined}
      onSecondaryButton={track && authenticated ? event => { event.preventDefault(); event.stopPropagation(); Navigation.CloseSideMenus(); Navigation.Navigate(LYRICS_ROUTE); } : undefined}
      className="ytm-ui ytm-player-view" style={{ '--ytm-cover-accent':accent, width:'100%', maxWidth:'100%', minWidth:0, minHeight:0, boxSizing:'border-box', padding:'2px 2px 6px', display:'flex', flexDirection:'column', gap:6 } as React.CSSProperties}>
      <ThemeScope />
      <div className="ytm-card" style={{ position:'relative', padding:'10px 34px 12px 10px', flexShrink:0, minWidth:0 }}>
          <SiYoutubemusic className="ytm-cover-logo" size={20} aria-label="YouTube Music" style={{ position:'absolute', right:10, top:10, color:`rgb(${accent})`, opacity:track?.albumArt && accent === defaultAccent ? 0 : 1, transition:'opacity 180ms ease' }} />
          {castConnected && <div className="ytm-muted" style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:6, fontSize:11, minWidth:0, marginBottom:8 }}>
            <MdCastConnected size={13} style={{ flexShrink:0 }} /><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{castSenderName || 'Connected device'}</span>
          </div>}
        <div style={{ display:'flex', gap:10, alignItems:'center', justifyContent:'center', minWidth:0 }}>
          {track?.albumArt ? <img src={track.albumArt} alt="Album art" style={{ width:'clamp(52px, 15vw, 64px)', height:'clamp(52px, 15vw, 64px)', borderRadius:4, objectFit:'cover', flexShrink:0 }} />
            : <div style={{ width:'clamp(52px, 15vw, 64px)', height:'clamp(52px, 15vw, 64px)', borderRadius:4, background:'#344052', display:'grid', placeItems:'center', flexShrink:0 }}><FaMusic size={28} /></div>}
          <OverflowTextGroup textKey={`${track?.title}|${track?.artist}`} style={{ minWidth:0, maxWidth:'calc(100% - 74px)', textAlign:'center' }}>
            <div style={{ fontSize:15, fontWeight:700, lineHeight:1.3 }}><OverflowText text={track?.title ?? 'Nothing playing'} /></div>
            <div className="ytm-muted" style={{ fontSize:13, marginTop:5 }}><OverflowText text={track?.artist || (authenticated ? 'Find a song in Library' : authReady ? 'Cast from your device' : '')} /></div>
          </OverflowTextGroup>
        </div>
      </div>

      {authReady && !authenticated && <div className="ytm-muted" role="status" style={{ fontSize:11, textAlign:'center', lineHeight:1.4 }}>
        No sign-in needed for Cast. Sign in to unlock Library.
      </div>}
      {authReady && !authenticated && !castConnected && <>
        <div className="ytm-muted" style={{ fontSize:11, textAlign:'center' }}>{castNetwork.trusted ? 'On the same network, select this Deck from the Cast menu.' : 'Enable Cast on your trusted network in Settings.'}</div>
        {!castNetwork.trusted && <DialogButton className="ytm-button" onClick={() => { Navigation.CloseSideMenus(); Navigation.Navigate('/youtube-music-settings/cast'); }}>Set up Cast</DialogButton>}
      </>}

      <div style={{ margin:0, minWidth:0 }}>
        <PaddedSlider value={Math.min(position, total)} min={0} max={Math.max(total, 1)} step={1} minimumDpadGranularity={5} showValue={false} disabled={!track || !total} onChange={seekPlayback} />
        <div className="ytm-muted" style={{ display:'flex', justifyContent:'space-between', padding:'0 2px', fontSize:10, fontVariantNumeric:'tabular-nums' }}><span>{formatTime(position)}</span><span>{formatTime(total)}</span></div>
      </div>

      <Focusable flow-children="horizontal" style={{ display:'flex', gap:6, minWidth:0, flexShrink:0 }}>
        <DialogButton className="ytm-button" style={{ ...button, height:34 }} disabled={!track || stopping} onOKActionDescription="Previous" onClick={() => void run(playPrevious)}><IoPlaySkipBack size={19} /></DialogButton>
        <DialogButton className="ytm-button" style={{ ...button, flex:1.35, height:34 }} disabled={!track || stopping} onOKActionDescription={isPlaying ? 'Pause' : 'Play'} onClick={togglePlayback}>{isPlaying ? <FaPause size={18} /> : <IoPlay size={22} />}</DialogButton>
        <DialogButton className="ytm-button" style={{ ...button, height:34 }} disabled={!track || stopping} onOKActionDescription="Next" onClick={() => void run(playNext)}><IoPlaySkipForward size={19} /></DialogButton>
      </Focusable>

      <Focusable flow-children="horizontal" style={{ display:'flex', gap:6, minWidth:0, flexShrink:0 }}>
        <DialogButton className={`ytm-button ytm-rating-button ${rating === 'LIKE' ? 'ytm-selected' : ''}`} style={button} disabled={!track || !authenticated} onOKActionDescription="Like" onClick={() => void run(() => rate('LIKE'))}>{rating === 'LIKE' ? <AiFillLike size={18} /> : <AiOutlineLike size={18} />}</DialogButton>
        <DialogButton className={`ytm-button ytm-rating-button ${rating === 'DISLIKE' ? 'ytm-selected' : ''}`} style={button} disabled={!track || !authenticated} onOKActionDescription="Dislike" onClick={() => void run(() => rate('DISLIKE'))}>{rating === 'DISLIKE' ? <AiFillDislike size={18} /> : <AiOutlineDislike size={18} />}</DialogButton>
        <DialogButton className="ytm-button" style={{ ...button, flex:1.6 }} disabled={!track || !authenticated} onClick={() => setShowLyrics(true)}><FaAlignLeft size={14} /> Lyrics</DialogButton>
      </Focusable>

      <div style={{ margin:0, minWidth:0 }}><VolumeSlider /></div>

      <Focusable flow-children="horizontal" style={{ display:'flex', gap:6, minWidth:0, flexShrink:0 }}>
        <DialogButton className={`ytm-button ${shuffle ? 'ytm-selected' : ''}`} style={{ ...button, fontSize:11 }} disabled={castConnected || !authenticated} onClick={() => void run(async () => { const result = await call<[], { shuffle: boolean }>('toggle_shuffle'); updateState({ shuffle:result.shuffle }); })}><MdShuffle size={18} /> Shuffle {shuffle ? 'On' : 'Off'}</DialogButton>
        <DialogButton className={`ytm-button ${repeat !== 'NONE' ? 'ytm-selected' : ''}`} style={{ ...button, fontSize:11 }} disabled={castConnected || !authenticated} onClick={() => void run(async () => { const result = await call<[], { repeat:'NONE' | 'ALL' | 'ONE' }>('toggle_repeat'); updateState({ repeat:result.repeat }); })}>{repeat === 'ONE' ? <MdRepeatOne size={17} /> : <MdRepeat size={17} />} Repeat {repeat === 'NONE' ? 'Off' : repeat === 'ONE' ? 'One' : 'All'}</DialogButton>
      </Focusable>
      {castConnected && <div className="ytm-muted" style={{ fontSize:10, textAlign:'center' }}>Shuffle / repeat: use your device.</div>}
      <DialogButton className="ytm-button ytm-stop" aria-label="Stop playback, clear queue and unlink Cast" style={{ ...button, flex:'none', width:'100%', fontSize:11 }} disabled={stopping} onClick={() => void stop()}><FaStop size={10} /> {stopping ? 'Stopping…' : 'Stop'}</DialogButton>
      {error && <div className="ytm-error" role="alert">{error}</div>}
    </Focusable>
  );
};

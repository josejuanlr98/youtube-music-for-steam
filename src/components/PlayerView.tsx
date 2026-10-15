import { DialogButton, Focusable, Navigation } from '@decky/ui';
import { call } from '@decky/api';
import { useEffect, useRef, useState } from 'react';
import { FaPause, FaMusic, FaStop, FaAlignLeft } from 'react-icons/fa';
import { IoPlay, IoPlaySkipBack, IoPlaySkipForward, IoShuffleOutline as MdShuffle } from 'react-icons/io5';
import { MdRepeat, MdRepeatOne, MdCastConnected } from 'react-icons/md';
import { AiOutlineLike, AiFillLike, AiOutlineDislike, AiFillDislike } from 'react-icons/ai';
import { usePlayer } from '../context/PlayerContext';
import { togglePlayback, playNext, playPrevious, stopAllPlayback, seekPlayback, getPlaybackError, addPlaybackErrorListener } from '../services/audioManager';
import { VolumeSlider, PaddedSlider } from './VolumeSlider';
import { LyricsPanel, LYRICS_ROUTE } from './LyricsPage';
import { SiYoutubemusic } from 'react-icons/si';
import { useArtworkPalette, defaultAccent } from '../services/artworkPalette';
import { ThemeScope } from './ThemeScope';
import { OverflowText, OverflowTextGroup } from './OverflowText';
import { useI18n } from '../services/i18n';
import { translationColor } from '../services/lyricColor';

const button: React.CSSProperties = { flex:'1 1 0', width:0, minWidth:0, minHeight:26, maxHeight:34, height:29, borderRadius:8, boxSizing:'border-box', lineHeight:'normal', fontSize:12, fontWeight:500, padding:'0 8px', display:'flex', alignItems:'center', justifyContent:'center', gap:6, margin:0 };
const formatTime = (value: number) => { const total = Math.max(0, Math.floor(value || 0)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };

export const PlayerView = () => {
  const { t } = useI18n();
  const { authenticated, authReady, castNetwork, track, isPlaying, shuffle, repeat, castConnected, castSenderName, position, duration, updateState } = usePlayer();
  const [rating, setRating] = useState('INDIFFERENT');
  const currentVideo = useRef(track?.videoId);
  currentVideo.current = track?.videoId;
  const [stopping, setStopping] = useState(false);
  const [skipping, setSkipping] = useState<'prev' | 'next' | null>(null);
  const skipSeq = useRef(0);
  const [error, setError] = useState('');
  const [playbackError, setPlaybackError] = useState(getPlaybackError);
  useEffect(() => addPlaybackErrorListener(setPlaybackError), []);
  const [showLyrics, setShowLyrics] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const [accent, secondary, tertiary] = useArtworkPalette(track?.albumArt, viewRef);
  const detailColor=translationColor(secondary);
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

  const run = async (action: () => Promise<unknown>, direction?: 'prev' | 'next') => {
    setError('');
    const seq = direction ? ++skipSeq.current : 0;
    if (direction) setSkipping(direction);
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not complete this action. Please try again.'); }
    finally { if (direction && skipSeq.current === seq) setSkipping(null); }
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
      onSecondaryButton={track && authenticated ? event => { event.preventDefault(); event.stopPropagation(); Navigation.Navigate(LYRICS_ROUTE); Navigation.CloseSideMenus(); } : undefined}
      className="ytm-ui ytm-player-view" style={{ '--ytm-cover-accent':accent, '--ytm-cover-secondary':secondary, '--ytm-cover-tertiary':tertiary, '--ytm-detail-color':detailColor, width:'100%', maxWidth:'100%', minWidth:0, minHeight:0, boxSizing:'border-box', padding:'2px 2px 4px', display:'flex', flexDirection:'column', gap:5 } as React.CSSProperties}>
      <ThemeScope />
      <div className="ytm-card" style={{ position:'relative', padding:'10px 12px', flexShrink:0, minWidth:0 }}>
          <SiYoutubemusic className="ytm-cover-logo" size={18} aria-label="YouTube Music" style={{ position:'absolute', right:10, top:10, color:`rgb(${accent})`, opacity:track?.albumArt && accent === defaultAccent ? 0 : 1, transition:'opacity 180ms ease', pointerEvents:'none' }} />
          {castConnected && <div className="ytm-muted ytm-cast-details" style={{ color:detailColor, display:'inline-flex', justifyContent:'flex-start', alignItems:'center', gap:5, fontSize:10.5, fontWeight:500, maxWidth:'calc(100% - 28px)', marginBottom:6, padding:'2px 8px', borderRadius:999, background:'rgba(0, 0, 0, 0.22)' }}>
            <MdCastConnected size={12} style={{ flexShrink:0 }} /><span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{castSenderName || 'Connected device'}</span>
          </div>}
        <div style={{ display:'flex', gap:11, alignItems:'center', justifyContent:'flex-start', minWidth:0, paddingRight:24 }}>
          {track?.albumArt ? <img src={track.albumArt} alt="Album art" style={{ width:52, height:52, borderRadius:8, objectFit:'cover', flexShrink:0, boxShadow:'0 5px 14px rgba(0,0,0,0.32)' }} />
            : <div style={{ width:52, height:52, borderRadius:8, background:'#344052', display:'grid', placeItems:'center', flexShrink:0 }}><FaMusic size={24} /></div>}
          <OverflowTextGroup textKey={`${track?.title}|${track?.artist}`} style={{ flex:1, minWidth:0, maxWidth:'calc(100% - 63px)', textAlign:'left' }}>
            <div style={{ fontSize:15, fontWeight:700, letterSpacing:'-.015em', lineHeight:1.26, color:'#f8fafc' }}><OverflowText text={track?.title ?? t('player.nothing')} /></div>
            <div className="ytm-muted ytm-artist-name" style={{ color:track?.artist?detailColor:'#b8bcbf', fontSize:12.5, fontWeight:500, marginTop:3, lineHeight:1.32 }}><OverflowText text={track?.artist || (authenticated ? t('player.find') : authReady ? 'Cast from your device' : '')} /></div>
          </OverflowTextGroup>
        </div>
      </div>

      {playbackError && <div className="ytm-error" role="alert" style={{fontSize:11,lineHeight:1.4}}>{playbackError}</div>}
      {authReady && !authenticated && <div className="ytm-muted" role="status" style={{ fontSize:11, textAlign:'center', lineHeight:1.35 }}>
        No sign-in needed for Cast. Sign in to unlock Library.
      </div>}
      {authReady && !authenticated && !castConnected && <>
        <div className="ytm-muted" style={{ fontSize:11, textAlign:'center' }}>{castNetwork.trusted ? 'On the same network, select this Deck from the Cast menu.' : 'Enable Cast on your trusted network in Settings.'}</div>
        {!castNetwork.trusted && <DialogButton className="ytm-button" onClick={() => { Navigation.Navigate('/youtube-music-settings/cast'); Navigation.CloseSideMenus(); }}>{t('player.setupCast')}</DialogButton>}
      </>}

      <div className="ytm-seek-group" style={{ margin:0, minWidth:0 }}>
        <PaddedSlider value={Math.min(position, total)} min={0} max={Math.max(total, 1)} step={1} minimumDpadGranularity={5} showValue={false} disabled={!track || !total} onChange={seekPlayback} />
        <div className="ytm-muted ytm-seek-times" style={{ display:'flex', justifyContent:'space-between', padding:'0 4px', marginTop:-2, fontSize:10, fontWeight:500, color:detailColor, opacity:.86, fontVariantNumeric:'tabular-nums' }}><span>{formatTime(position)}</span><span>{formatTime(total)}</span></div>
      </div>

      <Focusable flow-children="horizontal" style={{ display:'flex', gap:6, minWidth:0, flexShrink:0 }}>
        <DialogButton className={`ytm-button${skipping === 'prev' ? ' ytm-selected' : ''}`} style={{ ...button, height:32, borderRadius:9 }} disabled={!track || stopping} onOKActionDescription={t('common.previous')} onClick={() => void run(playPrevious, 'prev')}><IoPlaySkipBack size={18} /></DialogButton>
        <DialogButton className="ytm-button ytm-play-primary" style={{ ...button, flex:1.4, height:32, borderRadius:9 }} disabled={!track || stopping} onOKActionDescription={isPlaying ? t('player.pause') : t('player.play')} onClick={togglePlayback}>{isPlaying ? <FaPause size={17} /> : <IoPlay size={20} />}</DialogButton>
        <DialogButton className={`ytm-button${skipping === 'next' ? ' ytm-selected' : ''}`} style={{ ...button, height:32, borderRadius:9 }} disabled={!track || stopping} onOKActionDescription={t('common.next')} onClick={() => void run(playNext, 'next')}><IoPlaySkipForward size={18} /></DialogButton>
      </Focusable>

      <Focusable flow-children="horizontal" style={{ display:'flex', gap:6, minWidth:0, flexShrink:0 }}>
        <DialogButton className={`ytm-button ytm-rating-button ${rating === 'LIKE' ? 'ytm-selected' : ''}`} style={button} disabled={!track || !authenticated} onOKActionDescription={t('player.like')} onClick={() => void run(() => rate('LIKE'))}>{rating === 'LIKE' ? <AiFillLike size={17} /> : <AiOutlineLike size={17} />}</DialogButton>
        <DialogButton className={`ytm-button ytm-rating-button ${rating === 'DISLIKE' ? 'ytm-selected' : ''}`} style={button} disabled={!track || !authenticated} onOKActionDescription={t('player.dislike')} onClick={() => void run(() => rate('DISLIKE'))}>{rating === 'DISLIKE' ? <AiFillDislike size={17} /> : <AiOutlineDislike size={17} />}</DialogButton>
        <DialogButton className="ytm-button" style={{ ...button, flex:1.6 }} disabled={!track || !authenticated} onClick={() => setShowLyrics(true)}><FaAlignLeft size={13} /> {t('player.lyrics')}</DialogButton>
      </Focusable>

      <div className="ytm-volume-group" style={{ margin:0, minWidth:0 }}><VolumeSlider /></div>

      <Focusable flow-children="horizontal" style={{ display:'flex', gap:6, minWidth:0, flexShrink:0 }}>
        <DialogButton className={`ytm-button ${shuffle ? 'ytm-selected' : ''}`} style={{ ...button, fontSize:11 }} disabled={castConnected || !authenticated} onClick={() => void run(async () => { const result = await call<[], { shuffle: boolean }>('toggle_shuffle'); updateState({ shuffle:result.shuffle }); })}><MdShuffle size={16} /> {t('player.shuffle')} {shuffle ? t('common.on') : t('common.off')}</DialogButton>
        <DialogButton className={`ytm-button ${repeat !== 'NONE' ? 'ytm-selected' : ''}`} style={{ ...button, fontSize:11 }} disabled={castConnected || !authenticated} onClick={() => void run(async () => { const result = await call<[], { repeat:'NONE' | 'ALL' | 'ONE' }>('toggle_repeat'); updateState({ repeat:result.repeat }); })}>{repeat === 'ONE' ? <MdRepeatOne size={16} /> : <MdRepeat size={16} />} {t('player.repeat')} {repeat === 'NONE' ? t('common.off') : repeat === 'ONE' ? t('player.one') : t('player.all')}</DialogButton>
      </Focusable>
      {castConnected && <div className="ytm-muted" style={{ fontSize:10, lineHeight:1.2, textAlign:'center' }}>{t('player.deviceShuffle')}</div>}
      <DialogButton className="ytm-button ytm-stop" aria-label={t('player.stopHint')} style={{ ...button, flex:'none', width:'100%', height:26, minHeight:24, fontSize:11 }} disabled={stopping} onClick={() => void stop()}><FaStop size={9} /> {stopping ? t('player.stopping') : t('player.stop')}</DialogButton>
      {error && <div className="ytm-error" role="alert">{error}</div>}
    </Focusable>
  );
};

import { setBrowseDepth, returnBrowseToPlayer } from '../services/browseNavigation';
import { call } from '@decky/api';
import { DialogButton, Focusable, GamepadButton, Navigation, QuickAccessTab } from '@decky/ui';
import { useEffect, useRef, useState } from 'react';
import { FaArrowLeft, FaMusic } from 'react-icons/fa';
import { MdPlayArrow, MdPlaylistAdd, MdPlaylistPlay } from 'react-icons/md';
import { IoShuffleOutline } from 'react-icons/io5';
import { castRequest, getIsCastConnected, playTrack, type TrackInfo } from '../services/audioManager';
import { useArtworkAccent } from '../services/artworkPalette';
import { performPlaylistAction, type PlaylistAction } from '../services/playlistActions';
import { requestLibraryReturn, selectedPlaylist } from '../services/playlistNavigation';
import { ThemeScope } from './ThemeScope';
import { MediaRow, RowAction } from './MediaRow';
import { suppressPlaybackNotification } from '../services/notifications';
import { useI18n } from '../services/i18n';
import { OverflowText, OverflowTextGroup } from './OverflowText';
import { cachedPlaylistData, loadPlaylistData } from '../services/playlistData';
import { resetPaginationScroll, usePaginationFocus } from '../services/pagination';
import { useBrowseReturn, requestBrowseReturn } from '../services/browseState';

const PAGE_SIZE = 40;
const timeLabel = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};

export const PlaylistPage = () => {
  const { t } = useI18n();
  const playlist = selectedPlaylist();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLDivElement>(null);
  const [pageFocusRequest, setPageFocusRequest] = useState(0);
  const {topNext,topPrevious,focusTop,cancelFocus}=usePaginationFocus(listRef);
  const [tracks, setTracks] = useState<TrackInfo[]>(()=>playlist?cachedPlaylistData(playlist.playlistId)?.tracks||[]:[]);
  const [loading, setLoading] = useState(()=>!playlist||!cachedPlaylistData(playlist.playlistId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(0);
  const request = useRef(0);
  const alive = useRef(true);
  const busy = useRef(false);
  const leaving = useRef(false);
  const accent = useArtworkAccent(playlist?.thumbnail || undefined, rootRef);
  const browse = useBrowseReturn('playlist:'+playlist?.playlistId,rootRef,listRef,playRef,!loading);

  useEffect(() => {
    alive.current = true;
    const id = ++request.current;
    const cached=playlist?cachedPlaylistData(playlist.playlistId):undefined;
    setTracks(cached?.tracks||[]); setLoading(!cached); setLoadingMore(false); setPage(0); setError(''); setNotice('');
    if (!playlist) { setLoading(false); return; }
    const load = async () => {
      try {
        // The first YouTube Music page appears quickly. The complete list is
        // fetched only after opening this playlist, never for every Library row.
        const first = await loadPlaylistData(playlist.playlistId,true);
        if (!alive.current || id !== request.current) return;
        if (first.error) throw new Error(first.error);
        setTracks(first.tracks ?? []);
        setLoading(false);
        if (first.complete || playlist.count != null && (first.tracks?.length ?? 0) >= playlist.count) return;
        setLoadingMore(true);
        try {
          const complete = await loadPlaylistData(playlist.playlistId);
          if (!alive.current || id !== request.current) return;
          if (complete.error) throw new Error(complete.error);
          if (complete.tracks?.length) setTracks(complete.tracks);
        } catch { if (alive.current && id === request.current) setNotice('Some songs could not load. You can still use the songs shown.'); }
        finally { if (alive.current && id === request.current) setLoadingMore(false); }
      } catch (cause) {
        if (alive.current && id === request.current) {
          setError(cause instanceof Error ? cause.message : 'Could not open this playlist. Please retry.');
          setLoading(false);
        }
      }
    };
    void load();
    return () => { alive.current = false; request.current++; };
  }, [playlist?.playlistId]);

  const back = () => {
    if (leaving.current) return;
    leaving.current = true;
    requestBrowseReturn(playlist?.parentView);
    setBrowseDepth((playlist?.returnDepth ?? 1) - 1);
    Navigation.NavigateBack();
    if (playlist?.origin === 'route') return;
    setTimeout(() => {
      Navigation.OpenQuickAccessMenu(QuickAccessTab.Decky);
      requestLibraryReturn();
    }, 180);
  };
  const cancelBack = (event: { preventDefault:()=>void; stopPropagation:()=>void }) => { event.preventDefault(); event.stopPropagation(); back(); };
  useEffect(() => { setBrowseDepth(playlist?.returnDepth ?? 1); }, [playlist]);
  const returnToPlayer = () => {
    if (leaving.current) return;
    leaving.current = true;
    returnBrowseToPlayer(playlist?.returnDepth ?? 1);
  };
  const actPlaylist = async (mode: PlaylistAction) => {
    if (!playlist || busy.current) return;
    busy.current = true; setPending(`all-${mode}`); setError(''); setNotice('');
    try {
      const result = await performPlaylistAction(playlist.playlistId, mode);
      if (result.started && alive.current) returnToPlayer();
      else if (alive.current) setNotice(`Added ${result.added} songs to the ${result.cast ? 'Cast queue' : 'queue'}.`);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Could not update the playlist.'); }
    finally { busy.current = false; if (alive.current) setPending(null); }
  };
  const actSong = async (song: TrackInfo, mode: 'play' | 'next' | 'append') => {
    if (busy.current) return;
    busy.current = true; setPending(song.videoId); setError(''); setNotice('');
    try {
      if (mode === 'play') {
        const result = await call<[string, TrackInfo], TrackInfo & { error?: string }>('play_song', song.videoId, song);
        if (result.error || !result.url) throw new Error(result.error || 'Could not play this song.');
        suppressPlaybackNotification(song.videoId);
        await playTrack(result);
        if (alive.current) returnToPlayer();
      } else {
        if (getIsCastConnected()) {
          if (mode === 'next') await castRequest('/api/queue/next', song);
          else await castRequest('/api/queue/append', { tracks:[song] });
        } else {
          const result = await call<[TrackInfo], { success?: boolean; error?: string }>(mode === 'next' ? 'queue_song_next' : 'queue_song_append', song);
          if (!result.success) throw new Error(result.error || 'Could not queue this song.');
        }
        if (alive.current) setNotice(`${mode === 'next' ? 'Up next' : 'Added to queue'}: ${song.title}`);
      }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Could not complete this action.'); }
    finally { busy.current = false; if (alive.current) setPending(null); }
  };

  const lastPage = Math.max(0, Math.ceil(tracks.length / PAGE_SIZE) - 1);
  const visiblePage = Math.min(page, lastPage);
  const visibleTracks = tracks.slice(visiblePage * PAGE_SIZE, (visiblePage + 1) * PAGE_SIZE);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [visiblePage]);
  const changePage = (direction: number, fromButton = false) => {
    if (Math.max(0, Math.min(lastPage, visiblePage + direction)) === visiblePage) return;
    setPage(current => Math.max(0, Math.min(lastPage, current + direction)));
    if (fromButton) {
      setPageFocusRequest(0);
      focusTop(direction);
    } else {cancelFocus();setPageFocusRequest(current => current + 1);}
    resetPaginationScroll(listRef.current);
  };
  const pageControls = (top = false) => tracks.length > PAGE_SIZE && <Focusable flow-children="horizontal" className="ytm-playlist-pagination">
    <DialogButton ref={top?topPrevious:undefined} className="ytm-button" aria-disabled={visiblePage === 0} disabled={!top && visiblePage === 0} onClick={() => changePage(-1, true)}>{t('common.previous')}</DialogButton>
    <span>{visiblePage + 1}/{lastPage + 1}</span>
    <DialogButton ref={top?topNext:undefined} className="ytm-button" aria-disabled={visiblePage === lastPage} disabled={!top && visiblePage === lastPage} onClick={() => changePage(1, true)}>{t('common.next')}</DialogButton>
  </Focusable>;

  return <Focusable ref={rootRef} flow-children="vertical" className="ytm-ui ytm-playlist-page"
    onCancel={cancelBack} onCancelButton={cancelBack} onCancelActionDescription={t('playlist.back')}
    onButtonDown={event => {
      if (event.detail.is_repeat || tracks.length <= PAGE_SIZE) return;
      const direction = event.detail.button === GamepadButton.TRIGGER_LEFT ? -1 : event.detail.button === GamepadButton.TRIGGER_RIGHT ? 1 : 0;
      if (direction) { event.preventDefault(); event.stopPropagation(); changePage(direction); }
    }}>
    <ThemeScope />
    <Focusable flow-children="vertical" className="ytm-playlist-shell">
      <div className="ytm-playlist-top"><span className="ytm-eyebrow">{t('playlist.crumb')}</span><DialogButton className="ytm-button" onClick={back}><FaArrowLeft /> {t('playlist.back')}</DialogButton></div>
      {playlist ? <Focusable flow-children="horizontal" className="ytm-playlist-hero" style={{ '--ytm-playlist-accent':accent } as React.CSSProperties}>
        <div className="ytm-playlist-cover">{playlist.thumbnail ? <img src={playlist.thumbnail} alt="" /> : <FaMusic size={36} />}</div>
        <div className="ytm-playlist-details"><div className="ytm-eyebrow">{t('playlist.type')}</div><OverflowTextGroup textKey={playlist.playlistId + playlist.title}><h2><OverflowText text={playlist.title} /></h2></OverflowTextGroup><p>{t('common.songs',{count:playlist.count ?? tracks.length})}</p></div>
        <Focusable flow-children="horizontal" className="ytm-playlist-actions" aria-label={t('playlist.actions')}>
          <DialogButton ref={playRef} preferredFocus={!browse.returning} className="ytm-button" aria-label={t('playlist.playAll')} onOKActionDescription={t('playlist.playAll')} disabled={!!pending} onClick={() => void actPlaylist('play')}><span className="ytm-playlist-action-icon"><MdPlayArrow /></span></DialogButton>
          <DialogButton className="ytm-button" aria-label={t('playlist.shuffle')} onOKActionDescription={t('playlist.shuffle')} disabled={!!pending} onClick={() => void actPlaylist('shuffle')}><span className="ytm-playlist-action-icon"><IoShuffleOutline /></span></DialogButton>
          <DialogButton className="ytm-button" aria-label={t('playlist.playNext')} onOKActionDescription={t('playlist.playNext')} disabled={!!pending} onClick={() => void actPlaylist('next')}><span className="ytm-playlist-action-icon"><MdPlaylistPlay /></span></DialogButton>
          <DialogButton className="ytm-button" aria-label={t('playlist.addAll')} onOKActionDescription={t('playlist.addAll')} disabled={!!pending} onClick={() => void actPlaylist('append')}><span className="ytm-playlist-action-icon"><MdPlaylistAdd /></span></DialogButton>
        </Focusable>
      </Focusable> : <div className="ytm-empty">Choose a playlist in Library.</div>}
      {error && <div role="alert" className="ytm-error">{error}</div>}
      {notice && <div role="status" className="ytm-collection-note">{notice}</div>}
      {loading && <div className="ytm-empty" role="status">{t('playlist.opening')}</div>}
      {!loading && !tracks.length && !error && playlist && <div className="ytm-empty">{t('playlist.empty')}</div>}
      {loadingMore && <div className="ytm-collection-note" role="status">{t('playlist.loadingRest')}</div>}
      {pageControls(true)}
      <div ref={listRef} className="ytm-playlist-tracks">
        {visibleTracks.map((song, index) => <MediaRow key={`${song.videoId}-${visiblePage * PAGE_SIZE + index}`} image={song.albumArt}
          title={song.title} subtitle={song.artist} disabled={!!pending} focusRequest={index === 0 ? pageFocusRequest : undefined} onPlay={() => void actSong(song, 'play')}
          actions={<><span className="ytm-track-duration">{timeLabel(song.duration)}</span>
            <RowAction label={t('playlist.playNext')} disabled={!!pending} onClick={() => void actSong(song, 'next')}><MdPlaylistPlay size={21} /></RowAction>
            <RowAction label={t('playlist.addQueue')} disabled={!!pending} onClick={() => void actSong(song, 'append')}><MdPlaylistAdd size={21} /></RowAction></>} />)}
        {pageControls()}
      </div>
    </Focusable>
  </Focusable>;
};

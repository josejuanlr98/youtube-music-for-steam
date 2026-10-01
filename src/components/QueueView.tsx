import { call } from '@decky/api';
import { DialogButton, Focusable, GamepadButton } from '@decky/ui';
import { useEffect, useRef, useState } from 'react';
import { MdSwapVert, MdPlaylistPlay, MdArrowUpward, MdArrowDownward, MdDone, MdClose } from 'react-icons/md';
import { playTrack, type TrackInfo, getIsCastConnected, getQueue, addQueueListener, addTrackChangeListener, addCastConnectionListener, castRequest } from '../services/audioManager';
import { usePlayer } from '../context/PlayerContext';
import { ThemeScope } from './ThemeScope';
import { MediaRow, RowAction } from './MediaRow';
import { useI18n } from '../services/i18n';
export const QueueView = () => {
  const { t } = useI18n();
  const { updateState, castConnected } = usePlayer();
  const [queue, setQueue] = useState<TrackInfo[]>([]);
  const [position, setPosition] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [moving, setMoving] = useState<number | null>(null);
  const [moveFocus, setMoveFocus] = useState({direction:'up', sequence:0});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [pageFocusRequest, setPageFocusRequest] = useState(0);
  const pageSize = 40;
  const lastPage = Math.max(0, Math.ceil(queue.length / pageSize) - 1);
  const visiblePage = Math.min(page, lastPage);
  const changePage = (direction:number) => {
    if (busy || moving !== null || Math.max(0, Math.min(lastPage, visiblePage + direction)) === visiblePage) return;
    setPage(visiblePage + direction);
    setPageFocusRequest(current => current + 1);
  };
  const inFlight = useRef(false), alive = useRef(true), revision = useRef(0);
  const visibleIds = queue.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map(track => track.videoId).join(',');
  useEffect(() => {
    if (!castConnected || !visibleIds) return;
    void castRequest('/api/queue/metadata', {videoIds:visibleIds.split(',')}).catch(() => {});
  }, [castConnected, visibleIds]);
  const loadQueue = async (silent = false) => {
    const id = ++revision.current;
    if (!silent) setLoading(true);
    try {
      const data = getIsCastConnected() ? await castRequest('/api/queue')
        : await call<[], { tracks:TrackInfo[]; position:number; loading?:boolean; loadError?:string }>('get_queue');
      if (alive.current && id === revision.current) { setQueue(data.tracks ?? []); setPosition(data.position ?? -1); setCompleting(!!data.loading); if (data.loadError) setError(data.loadError); }
    } catch { if (alive.current && id === revision.current) setError('Could not refresh the queue. Please retry.'); }
    finally { if (alive.current && id === revision.current) setLoading(false); }
  };
  useEffect(() => {
    alive.current = true;
    const initial = getQueue();
    if (getIsCastConnected() && initial.tracks.length) { setQueue(initial.tracks); setPosition(initial.position); setLoading(false); }
    else void loadQueue();
    const removeTrack = addTrackChangeListener(() => { if (!getIsCastConnected() && !inFlight.current) void loadQueue(true); });
    const removeConnection = addCastConnectionListener(() => { setMoving(null); void loadQueue(true); });
    const removeQueue = addQueueListener((tracks, pos) => {
      if (getIsCastConnected() || tracks.length === 0) {
        revision.current++;
        if (!inFlight.current) setMoving(null);
        setQueue(tracks); setPosition(pos); setLoading(false);
      }
    });
    return () => { alive.current = false; revision.current++; removeTrack(); removeQueue(); removeConnection(); };
  }, []);
  useEffect(() => {
    if (!completing) return;
    const timer = setInterval(() => { if (!document.hidden && !inFlight.current) void loadQueue(true); }, 1500);
    return () => clearInterval(timer);
  }, [completing]);
  const act = async (index: number, action: 'up' | 'down' | 'next' | 'jump' | 'remove') => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const expectedIds = queue.map(t => t.videoId);
      if (getIsCastConnected()) {
        if (action === 'remove') throw new Error('Remove songs from your casting device.');
        if (action === 'jump') await castRequest('/api/queue/jump', { videoId:queue[index]?.videoId, index, expectedIds });
        else await castRequest('/api/queue/edit', { index, action, expectedIds });
      } else if (action === 'jump') {
        const result = await call<[number, string[]], TrackInfo & {error?:string}>('jump_to_queue', index, expectedIds);
        if (result.error || !result.url) throw new Error(result.error || 'Could not play this song.');
        await playTrack(result);
      } else if (action === 'remove') {
        const result = await call<[number, string[]], {success?:boolean;error?:string}>('remove_from_queue', index, expectedIds);
        if (!result.success) throw new Error(result.error || 'Could not remove song.');
      } else {
        const result = await call<[number, string, string[]], {success?:boolean;error?:string;repeat:'NONE'|'ALL'|'ONE'}>('edit_queue', index, action, expectedIds);
        if (!result.success) throw new Error(result.error || 'Could not update queue.');
        updateState({ repeat:result.repeat });
      }
      if (alive.current) {
        if (action === 'up' || action === 'down') {
          const target = index + (action === 'up' ? -1 : 1);
          setMoving(target);
          setPage(Math.floor(target / pageSize));
          setMoveFocus(previous => ({direction:target === 0 ? 'down' : target === queue.length - 1 ? 'up' : action, sequence:previous.sequence + 1}));
        } else setMoving(null);
      }
    } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : 'Could not update queue.'); setMoving(null); } }
    finally { await loadQueue(true); inFlight.current = false; if (alive.current) setBusy(false); }
  };
  const occurrences = new Map<string, number>();
  return <Focusable flow-children="vertical" className="ytm-ui ytm-collection" onCancelButton={moving !== null ? event => { event.preventDefault(); event.stopPropagation(); setMoving(null); } : undefined}
    onButtonDown={event => {
      if (event.detail.is_repeat || busy || moving !== null || lastPage === 0) return;
      const direction = event.detail.button === GamepadButton.TRIGGER_LEFT ? -1 : event.detail.button === GamepadButton.TRIGGER_RIGHT ? 1 : 0;
      if (direction) { event.preventDefault(); event.stopPropagation(); changePage(direction); }
    }}><ThemeScope />
    <div className="ytm-collection-heading"><span>{t('queue.title')}</span><span className="ytm-muted">{t('common.songs',{count:queue.length})}</span></div>
    {error && <div role="alert" className="ytm-error">{error}</div>}
    {completing && <div role="status" className="ytm-collection-note">{t('queue.loadingRest')}</div>}
    {loading && <div className="ytm-empty">{t('queue.loading')}</div>}
    {!loading && !queue.length && <div className="ytm-empty"><strong>{t('queue.empty')}</strong><p>{t('queue.emptyHint')}</p></div>}
    {queue.length > pageSize && <Focusable flow-children="horizontal" style={{ display:'flex', gap:6, alignItems:'center', marginBottom:8 }}>
      <DialogButton className="ytm-button" style={{ padding:6, flex:1 }} disabled={visiblePage === 0 || busy} onClick={() => changePage(-1)}>{t('common.previous')}</DialogButton>
      <span style={{ fontSize:11 }}>{visiblePage + 1}/{lastPage + 1}</span>
      <DialogButton className="ytm-button" style={{ padding:6, flex:1 }} disabled={visiblePage === lastPage || busy} onClick={() => changePage(1)}>{t('common.next')}</DialogButton>
    </Focusable>}
    {queue.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map((track, offset) => {
      const index = visiblePage * pageSize + offset;
      const occurrence = occurrences.get(track.videoId) ?? 0;
      occurrences.set(track.videoId, occurrence + 1);
      const editing = moving === index;
      return <MediaRow key={`${track.videoId}-${occurrence}`} title={track.title || 'Unknown'} focusRequest={moving === null && offset === 0 ? pageFocusRequest : undefined}
        subtitle={editing ? `Position ${index + 1} of ${queue.length}` : track.artist}
        image={track.albumArt} selected={index === position} editing={editing} disabled={busy}
        onPlay={() => void act(index, 'jump')} actions={editing ? <>
          <RowAction label={t('queue.moveUp')} focusRequest={moveFocus.direction === 'up' ? moveFocus.sequence : undefined} preferredFocus={index > 0} disabled={busy || index === 0} onClick={() => void act(index, 'up')}><MdArrowUpward /></RowAction>
          <RowAction label={t('queue.moveDown')} focusRequest={moveFocus.direction === 'down' ? moveFocus.sequence : undefined} preferredFocus={index === 0} disabled={busy || index === queue.length - 1} onClick={() => void act(index, 'down')}><MdArrowDownward /></RowAction>
          <RowAction label={t('queue.done')} disabled={busy} onClick={() => setMoving(null)}><MdDone /></RowAction>
        </> : <>
          <RowAction label={t('queue.move')} disabled={busy || queue.length < 2} onClick={() => setMoving(index)}><MdSwapVert size={19} /></RowAction>
          <RowAction label={t('playlist.playNext')} disabled={busy || index === position || position < 0} onClick={() => void act(index, 'next')}><MdPlaylistPlay size={19} /></RowAction>
          <RowAction label={t('queue.remove')} disabled={busy || castConnected || index === position} onClick={() => void act(index, 'remove')}><MdClose size={17} /></RowAction>
        </>} />;
    })}
  </Focusable>;
};

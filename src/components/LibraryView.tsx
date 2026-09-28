import { DialogButton, Navigation, Focusable } from '@decky/ui';
import { call } from '@decky/api';
import { useEffect, useRef, useState } from 'react';
import { FaSearch } from 'react-icons/fa';
import { MdPlaylistAdd, MdPlaylistPlay, MdRefresh, MdSort, MdEdit, MdCheck, MdArrowUpward, MdArrowDownward } from 'react-icons/md';
import { IoShuffleOutline as MdShuffle } from 'react-icons/io5';
import { playTrack, getIsCastConnected, castRequest, type TrackInfo } from '../services/audioManager';
import { usePlayer } from '../context/PlayerContext';
import { ThemeScope } from './ThemeScope';
import { MediaRow, RowAction } from './MediaRow';

interface PlaylistEntry { playlistId: string; title: string; count: number | null; thumbnail: string | null }
const LIKED_SONGS_ART = 'https://www.gstatic.com/youtube/media/ytm/images/pbg/liked-songs-delhi-1200.png';
const orderKey = 'ytm-library-order-v1';
function savedOrder(): { mode:number; ids:string[] } {
  try {
    const data = JSON.parse(localStorage.getItem(orderKey) || '{}');
    return { mode:[0,1,2,3].includes(data.mode) ? data.mode : 0, ids:Array.isArray(data.ids) ? data.ids.filter((id:unknown) => typeof id === 'string') : [] };
  } catch { return { mode:0, ids:[] }; }
}
export const LibraryView = ({ onSwitchToPlayer }: { onSwitchToPlayer?: () => void }) => {
  const { authenticated, authReady } = usePlayer();
  return <div className="ytm-ui ytm-collection"><ThemeScope />
    {!authReady ? <div className="ytm-empty" role="status" aria-live="polite" /> : authenticated ? <AccountLibrary onSwitchToPlayer={onSwitchToPlayer} /> : <div className="ytm-empty">
      <strong>Cast only</strong><p>Sign in to access your library, search and likes.</p>
      <DialogButton className="ytm-button" onClick={() => { Navigation.CloseSideMenus(); Navigation.Navigate('/youtube-music-settings/auth'); }}>Sign in to YouTube Music</DialogButton>
    </div>}
  </div>;
};
const AccountLibrary = ({ onSwitchToPlayer }: { onSwitchToPlayer?: () => void }) => {
  const { updateState } = usePlayer();
  const [playlists, setPlaylists] = useState<PlaylistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sort, setSort] = useState(() => savedOrder().mode);
  const [manualIds, setManualIds] = useState<string[]>(() => savedOrder().ids);
  const [editingOrder, setEditingOrder] = useState(false);
  const [moveFocus, setMoveFocus] = useState({id:'', direction:0, sequence:0});
  const rank = new Map(manualIds.map((id,index) => [id,index]));
  const orderedPlaylists = sort === 0 ? playlists : sort === 3 ? [...playlists].sort((a,b) => (rank.get(a.playlistId) ?? Infinity) - (rank.get(b.playlistId) ?? Infinity)) : [...playlists].sort((a,b) =>
    (sort === 1 ? 1 : -1) * a.title.localeCompare(b.title, undefined, { numeric:true, sensitivity:'base' }));
  const saveOrder = (mode:number, ids:string[]) => {
    try { localStorage.setItem(orderKey, JSON.stringify({mode,ids})); }
    catch { setNotice('Order changed for this session; could not save it.'); }
  };
  const changeOrder = () => { const mode = (sort + 1) % 4; setSort(mode); setEditingOrder(false); saveOrder(mode,manualIds); };
  const movePlaylist = (id:string, direction:number) => {
    const ids = orderedPlaylists.map(playlist => playlist.playlistId), index = ids.indexOf(id), target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setManualIds(ids); saveOrder(3,ids);
    setMoveFocus(previous => ({id, direction:target === 0 ? 1 : target === ids.length - 1 ? -1 : direction, sequence:previous.sequence + 1}));
  };
  const busy = useRef(false);
  const alive = useRef(true);
  const fetchPlaylists = async (refresh = false) => {
    setLoading(true); setError('');
    try {
      const result = await call<[boolean], { playlists?: PlaylistEntry[]; error?: string }>('get_library_playlists', refresh);
      if (!alive.current) return;
      if (result.error) setError(result.error); else setPlaylists(result.playlists ?? []);
    } catch { if (alive.current) setError('Could not load your library. Check your connection and retry.'); }
    finally { if (alive.current) setLoading(false); }
  };
  useEffect(() => { alive.current = true; void fetchPlaylists(); return () => { alive.current = false; }; }, []);
  const act = async (playlist: PlaylistEntry, mode: 'play' | 'shuffle' | 'append' | 'next') => {
    if (busy.current) return;
    busy.current = true; setPending(playlist.playlistId); setError(''); setNotice('');
    try {
      if (mode === 'append' || mode === 'next') {
        if (getIsCastConnected()) {
          const data = await call<[string], { tracks?: TrackInfo[]; error?: string }>('get_playlist_tracks', playlist.playlistId);
          if (data.error) throw new Error(data.error);
          const result = await castRequest('/api/queue/append', { tracks:data.tracks, next:mode === 'next' });
          if (alive.current) setNotice(`Added ${result.added} songs to the Cast queue.`);
        } else {
          const result = await call<[string], { added?: number; error?: string }>(mode === 'next' ? 'queue_playlist_next' : 'append_playlist', playlist.playlistId);
          if (result.error) throw new Error(result.error);
          if (alive.current) setNotice(`Added ${result.added} songs to the queue.`);
        }
      } else {
        const result = await call<[string, boolean], TrackInfo & { error?: string; initialIds?:string[] }>('start_playlist', playlist.playlistId, mode === 'shuffle');
        if (result.error || !result.url) throw new Error(result.error || 'Could not play this playlist.');
        await playTrack(result);
        if (result.initialIds) void call<[string, string[], boolean], unknown>('complete_playlist', playlist.playlistId, result.initialIds, mode === 'shuffle').catch(() => {});
        updateState({ shuffle:mode === 'shuffle' });
        if (alive.current) onSwitchToPlayer?.();
      }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not load playlist. Please retry.'); }
    finally { busy.current = false; if (alive.current) setPending(null); }
  };
  return <Focusable flow-children="vertical"
    onSecondaryActionDescription={sort === 3 ? (editingOrder ? 'Done reordering' : 'Edit order') : undefined}
    onSecondaryButton={sort === 3 ? event => { event.preventDefault(); event.stopPropagation(); setEditingOrder(value => !value); } : undefined}
    onCancelActionDescription={editingOrder ? 'Done reordering' : undefined}
    onCancelButton={editingOrder ? event => { event.preventDefault(); event.stopPropagation(); setEditingOrder(false); } : undefined}>
    <div className="ytm-collection-heading"><span>Your library <span className="ytm-muted" style={{fontSize:10}}>{['', 'A–Z', 'Z–A', 'Custom'][sort]}</span></span><Focusable flow-children="horizontal" style={{display:'flex',gap:4}}>
      {sort === 3 && <RowAction label={editingOrder ? 'Done reordering' : 'Edit custom order'} onClick={() => setEditingOrder(value => !value)}>{editingOrder ? <MdCheck size={18} /> : <MdEdit size={17} />}</RowAction>}
      <RowAction label={`Change order: ${['YouTube Music','A–Z','Z–A','Custom'][sort]}`} disabled={editingOrder} onClick={changeOrder}><MdSort size={18} /></RowAction>
      <RowAction label="Refresh library" disabled={loading || !!pending || editingOrder} onClick={() => void fetchPlaylists(true)}><MdRefresh size={18} /></RowAction></Focusable></div>
    {!editingOrder && <MediaRow title="Search" subtitle="Find your next song" icon={<FaSearch size={20} style={{color:'#fff'}} />} onPlay={() => { Navigation.CloseSideMenus(); Navigation.Navigate('/youtube-music-search'); }} />}
    {error && <div role="alert" className="ytm-error">{error}</div>}
    {notice && <div role="status" className="ytm-collection-note">{notice}</div>}
    {loading && <div className="ytm-empty">Loading your library…</div>}
    {!loading && !error && !playlists.length && <div className="ytm-empty">Your playlists will appear here.</div>}
    {orderedPlaylists.map(playlist => <MediaRow tintFocus key={playlist.playlistId}
      title={pending === playlist.playlistId ? 'Loading…' : playlist.title}
      subtitle={playlist.count == null ? 'Your favorite songs' : `${playlist.count} songs`}
      image={playlist.playlistId === 'LM' ? LIKED_SONGS_ART : playlist.thumbnail} icon={undefined}
      editing={editingOrder} disabled={!!pending} onPlay={() => { if (!editingOrder) void act(playlist, 'play'); }}
      actions={editingOrder ? <>
        <RowAction label="Move playlist up" focusRequest={moveFocus.id === playlist.playlistId && moveFocus.direction === -1 ? moveFocus.sequence : undefined} disabled={orderedPlaylists[0]?.playlistId === playlist.playlistId} onClick={() => movePlaylist(playlist.playlistId,-1)}><MdArrowUpward size={18} /></RowAction>
        <RowAction label="Move playlist down" focusRequest={moveFocus.id === playlist.playlistId && moveFocus.direction === 1 ? moveFocus.sequence : undefined} disabled={orderedPlaylists.at(-1)?.playlistId === playlist.playlistId} onClick={() => movePlaylist(playlist.playlistId,1)}><MdArrowDownward size={18} /></RowAction>
      </> : <>
        <RowAction label="Shuffle playlist" disabled={!!pending} onClick={() => void act(playlist, 'shuffle')}><MdShuffle size={20} /></RowAction>
        <RowAction label="Play playlist next" disabled={!!pending} onClick={() => void act(playlist, 'next')}><MdPlaylistPlay size={21} /></RowAction>
        <RowAction label="Add playlist to queue" disabled={!!pending} onClick={() => void act(playlist, 'append')}><MdPlaylistAdd size={21} /></RowAction>
      </>} />)}
  </Focusable>;
};

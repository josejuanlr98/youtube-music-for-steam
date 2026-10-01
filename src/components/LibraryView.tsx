import { DialogButton, Navigation, Focusable } from '@decky/ui';
import { call } from '@decky/api';
import { useEffect, useRef, useState } from 'react';
import { FaSearch } from 'react-icons/fa';
import { MdPlayArrow, MdChevronRight, MdRefresh, MdSort, MdEdit, MdCheck, MdArrowUpward, MdArrowDownward } from 'react-icons/md';
import { IoShuffleOutline as MdShuffle } from 'react-icons/io5';
import { usePlayer } from '../context/PlayerContext';
import { ThemeScope } from './ThemeScope';
import { MediaRow, RowAction } from './MediaRow';
import { performPlaylistAction, type PlaylistAction } from '../services/playlistActions';
import { PLAYLIST_ROUTE, LIBRARY_RETURN_EVENT, selectPlaylist, consumeLibraryReturn, libraryReturnPending, selectedPlaylist } from '../services/playlistNavigation';
import { useI18n } from '../services/i18n';

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
  const { t } = useI18n();
  const { authenticated, authReady } = usePlayer();
  return <div className="ytm-ui ytm-collection"><ThemeScope />
    {!authReady ? <div className="ytm-empty" role="status" aria-live="polite" /> : authenticated ? <AccountLibrary onSwitchToPlayer={onSwitchToPlayer} /> : <div className="ytm-empty">
      <strong>{t('library.castOnly')}</strong><p>{t('library.signInHint')}</p>
      <DialogButton className="ytm-button" onClick={() => { Navigation.CloseSideMenus(); Navigation.Navigate('/youtube-music-settings/auth'); }}>{t('library.signIn')}</DialogButton>
    </div>}
  </div>;
};
const AccountLibrary = ({ onSwitchToPlayer }: { onSwitchToPlayer?: () => void }) => {
  const { t } = useI18n();
  const { updateState } = usePlayer();
  const [playlists, setPlaylists] = useState<PlaylistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sort, setSort] = useState(() => savedOrder().mode);
  const [manualIds, setManualIds] = useState<string[]>(() => savedOrder().ids);
  const [editingOrder, setEditingOrder] = useState(false);
  const [returnRequest, setReturnRequest] = useState(() => libraryReturnPending() ? 1 : 0);
  const [moveFocus, setMoveFocus] = useState({id:'', direction:0, sequence:0});
  const rootRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    const onReturn = () => setReturnRequest(value => value + 1);
    window.addEventListener(LIBRARY_RETURN_EVENT, onReturn);
    return () => window.removeEventListener(LIBRARY_RETURN_EVENT, onReturn);
  }, []);
  useEffect(() => {
    if (loading || !libraryReturnPending()) return;
    const scroll = rootRef.current?.closest<HTMLElement>('[class*="TabContentsScroll"]');
    if (!scroll) return;
    const snapshot = consumeLibraryReturn();
    if (!snapshot) return;
    const view = scroll.ownerDocument.defaultView;
    const frame = view?.requestAnimationFrame(() => { scroll.scrollTop = snapshot.libraryScrollTop; });
    return () => { if (frame) view?.cancelAnimationFrame(frame); };
  }, [loading, playlists, returnRequest]);
  const openPlaylist = (playlist: PlaylistEntry) => {
    const scroll = rootRef.current?.closest<HTMLElement>('[class*="TabContentsScroll"]');
    selectPlaylist({ ...playlist, thumbnail:playlist.playlistId === 'LM' ? LIKED_SONGS_ART : playlist.thumbnail, libraryScrollTop:scroll?.scrollTop ?? 0 });
    Navigation.CloseSideMenus();
    Navigation.Navigate(PLAYLIST_ROUTE);
  };
  const act = async (playlist: PlaylistEntry, mode: PlaylistAction) => {
    if (busy.current) return;
    busy.current = true; setPending(playlist.playlistId); setError(''); setNotice('');
    try {
      const result = await performPlaylistAction(playlist.playlistId, mode);
      if (result.started) {
        updateState({ shuffle:mode === 'shuffle' });
        if (alive.current) onSwitchToPlayer?.();
      } else if (alive.current) setNotice(`Added ${result.added} songs to the ${result.cast ? 'Cast queue' : 'queue'}.`);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not load playlist. Please retry.'); }
    finally { busy.current = false; if (alive.current) setPending(null); }
  };
  return <Focusable ref={rootRef} flow-children="vertical"
    onSecondaryActionDescription={sort === 3 ? (editingOrder ? 'Done reordering' : 'Edit order') : undefined}
    onSecondaryButton={sort === 3 ? event => { event.preventDefault(); event.stopPropagation(); setEditingOrder(value => !value); } : undefined}
    onCancelActionDescription={editingOrder ? 'Done reordering' : undefined}
    onCancelButton={editingOrder ? event => { event.preventDefault(); event.stopPropagation(); setEditingOrder(false); } : undefined}>
    <div className="ytm-collection-heading"><span>{t('library.title')} <span className="ytm-muted" style={{fontSize:10}}>{['', 'A–Z', 'Z–A', 'Custom'][sort]}</span></span><Focusable flow-children="horizontal" style={{display:'flex',gap:4}}>
      {sort === 3 && <RowAction label={editingOrder ? t('library.done') : t('library.edit')} onClick={() => setEditingOrder(value => !value)}>{editingOrder ? <MdCheck size={18} /> : <MdEdit size={17} />}</RowAction>}
      <RowAction label={`Change order: ${['YouTube Music','A–Z','Z–A','Custom'][sort]}`} disabled={editingOrder} onClick={changeOrder}><MdSort size={18} /></RowAction>
      <RowAction label={t('library.refresh')} disabled={loading || !!pending || editingOrder} onClick={() => void fetchPlaylists(true)}><MdRefresh size={18} /></RowAction></Focusable></div>
    {!editingOrder && <MediaRow title={t('library.search')} subtitle={t('library.searchHint')} icon={<FaSearch size={20} style={{color:'#fff'}} />} onPlay={() => { Navigation.CloseSideMenus(); Navigation.Navigate('/youtube-music-search'); }} />}
    {error && <div role="alert" className="ytm-error">{error}</div>}
    {notice && <div role="status" className="ytm-collection-note">{notice}</div>}
    {loading && <div className="ytm-empty">{t('library.loading')}</div>}
    {!loading && !error && !playlists.length && <div className="ytm-empty">{t('library.empty')}</div>}
    {orderedPlaylists.map(playlist => <MediaRow tintFocus key={playlist.playlistId}
      title={pending === playlist.playlistId ? 'Loading…' : playlist.title}
      subtitle={playlist.count == null ? 'Your favorite songs' : `${playlist.count} songs`}
      image={playlist.playlistId === 'LM' ? LIKED_SONGS_ART : playlist.thumbnail} icon={undefined}
      editing={editingOrder} disabled={!!pending} onPlay={() => { if (!editingOrder) openPlaylist(playlist); }}
      playDescription={t('library.open')} endIcon={<MdChevronRight size={20} />} focusRequest={libraryReturnPending() && selectedPlaylist()?.playlistId === playlist.playlistId ? returnRequest : undefined}
      actions={editingOrder ? <>
        <RowAction label={t('library.moveUp')} focusRequest={moveFocus.id === playlist.playlistId && moveFocus.direction === -1 ? moveFocus.sequence : undefined} disabled={orderedPlaylists[0]?.playlistId === playlist.playlistId} onClick={() => movePlaylist(playlist.playlistId,-1)}><MdArrowUpward size={18} /></RowAction>
        <RowAction label={t('library.moveDown')} focusRequest={moveFocus.id === playlist.playlistId && moveFocus.direction === 1 ? moveFocus.sequence : undefined} disabled={orderedPlaylists.at(-1)?.playlistId === playlist.playlistId} onClick={() => movePlaylist(playlist.playlistId,1)}><MdArrowDownward size={18} /></RowAction>
      </> : <>
        <RowAction label={t('library.play')} disabled={!!pending} onClick={() => void act(playlist, 'play')}><MdPlayArrow size={21} /></RowAction>
        <RowAction label={t('library.shuffle')} disabled={!!pending} onClick={() => void act(playlist, 'shuffle')}><MdShuffle size={20} /></RowAction>
      </>} />)}
  </Focusable>;
};

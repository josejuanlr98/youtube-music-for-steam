import { DialogButton, Navigation, Focusable } from '@decky/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FaSearch } from 'react-icons/fa';
import { MdPlayArrow, MdChevronRight, MdEdit, MdCheck, MdArrowUpward, MdArrowDownward } from 'react-icons/md';
import { IoShuffleOutline as MdShuffle } from 'react-icons/io5';
import { usePlayer } from '../context/PlayerContext';
import { ThemeScope } from './ThemeScope';
import { MediaRow, RowAction } from './MediaRow';
import { performPlaylistAction, type PlaylistAction } from '../services/playlistActions';
import { PLAYLIST_ROUTE, LIBRARY_RETURN_EVENT, selectPlaylist, consumeLibraryReturn, libraryReturnPending, selectedPlaylist } from '../services/playlistNavigation';
import { useI18n } from '../services/i18n';
import { LibraryToolbar } from './LibraryToolbar';
import { openSearch } from '../services/searchState';
import { CatalogLibrary } from './CatalogLibrary';
import type { CatalogFilter } from '../services/catalog';
import { cachedPlaylistLibrary, loadPlaylistLibrary, type PlaylistEntry } from '../services/playlistLibrary';
import { useBrowseReturn } from '../services/browseState';
import { clearPlaylistData } from '../services/playlistData';

const LIKED_SONGS_ART = 'https://www.gstatic.com/youtube/media/ytm/images/pbg/liked-songs-delhi-1200.png';
const orderKey = 'ytm-library-order-v1';
let libraryCategory:CatalogFilter = 'playlists';
function savedOrder(): { mode:number; ids:string[] } {
  try {
    const data = JSON.parse(localStorage.getItem(orderKey) || '{}');
    return { mode:[0,1,2,3].includes(data.mode) ? data.mode : 0, ids:Array.isArray(data.ids) ? data.ids.filter((id:unknown) => typeof id === 'string') : [] };
  } catch { return { mode:0, ids:[] }; }
}
export const LibraryView = ({ onSwitchToPlayer }: { onSwitchToPlayer?: () => void }) => {
  const { t } = useI18n();
  const { authenticated, authReady } = usePlayer();
  const [category,setCategory] = useState(libraryCategory);
  const [categoryFocus,setCategoryFocus] = useState(0);
  const changeCategory=(value:CatalogFilter)=>{libraryCategory=value;setCategory(value);setCategoryFocus(current=>current+1);};
  useEffect(() => {
    const reset = (event:Event) => { if ((event as CustomEvent).detail?.preserveCategory) return; libraryCategory='playlists'; setCategory('playlists'); };
    window.addEventListener(LIBRARY_RETURN_EVENT,reset);
    return () => window.removeEventListener(LIBRARY_RETURN_EVENT,reset);
  },[]);
  return <div className="ytm-ui ytm-collection"><ThemeScope />
    {!authReady ? <div className="ytm-empty" role="status" aria-live="polite" /> : authenticated ? <>
      {category==='playlists' ? <AccountLibrary onSwitchToPlayer={onSwitchToPlayer} categoryFocusRequest={categoryFocus} onCategoryChange={changeCategory} /> : <CatalogLibrary key={category} category={category} categoryFocusRequest={categoryFocus} onCategoryChange={changeCategory} onPlay={onSwitchToPlayer} />}
    </> : <div className="ytm-empty">
      <strong>{t('library.castOnly')}</strong><p>{t('library.signInHint')}</p>
      <DialogButton className="ytm-button" onClick={() => { Navigation.CloseSideMenus(); Navigation.Navigate('/youtube-music-settings/auth'); }}>{t('library.signIn')}</DialogButton>
    </div>}
  </div>;
};
const AccountLibrary = ({ onSwitchToPlayer, onCategoryChange, categoryFocusRequest }: { onSwitchToPlayer?: () => void; onCategoryChange:(value:CatalogFilter)=>void; categoryFocusRequest?:number }) => {
  const { t } = useI18n();
  const { updateState } = usePlayer();
  const [playlists, setPlaylists] = useState<PlaylistEntry[]>(()=>cachedPlaylistLibrary()?.playlists||[]);
  const [loading, setLoading] = useState(()=>!cachedPlaylistLibrary());
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sort, setSort] = useState(() => savedOrder().mode);
  const [manualIds, setManualIds] = useState<string[]>(() => savedOrder().ids);
  const [editingOrder, setEditingOrder] = useState(false);
  const [returnRequest, setReturnRequest] = useState(() => libraryReturnPending() ? 1 : 0);
  const [moveFocus, setMoveFocus] = useState({id:'', direction:0, sequence:0});
  const rootRef = useRef<HTMLDivElement>(null);
  const [fetching,setFetching]=useState(false);
  const browse=useBrowseReturn('library:playlists',rootRef,undefined,undefined,!loading,playlists);
  // Keep sorting independent of focus, notices and playback pending state.
  const orderedPlaylists = useMemo(() => {
    if (sort === 0) return playlists;
    if (sort === 3) {
      const rank = new Map(manualIds.map((id,index) => [id,index]));
      return [...playlists].sort((a,b) => (rank.get(a.playlistId) ?? Infinity) - (rank.get(b.playlistId) ?? Infinity));
    }
    return [...playlists].sort((a,b) => (sort === 1 ? 1 : -1) * a.title.localeCompare(b.title, undefined, { numeric:true, sensitivity:'base' }));
  }, [playlists, sort, manualIds]);
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
  const fetchGeneration=useRef(0);
  const fetchPlaylists = async (refresh = false) => {
    const id=++fetchGeneration.current;
    setFetching(true); setError('');
    if(refresh)clearPlaylistData();
    try {
      const first=await loadPlaylistLibrary(true,refresh);
      if(!alive.current||id!==fetchGeneration.current)return;
      if(first.error){setError(first.error);return;}
      setPlaylists(first.playlists||[]);setLoading(false);
      if(first.hasMore){
        const complete=await loadPlaylistLibrary();
        if(!alive.current||id!==fetchGeneration.current)return;
        if(complete.error)setError(complete.error);else setPlaylists(complete.playlists||[]);
      }
    } catch { if (alive.current) setError('Could not load your library. Check your connection and retry.'); }
    finally { if (alive.current&&id===fetchGeneration.current){setLoading(false);setFetching(false);} }
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
    const parentView=browse.capture({},'entry:playlist:'+playlist.playlistId);
    selectPlaylist({ ...playlist, thumbnail:playlist.playlistId === 'LM' ? LIKED_SONGS_ART : playlist.thumbnail, libraryScrollTop:scroll?.scrollTop ?? 0,parentView });
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
    <LibraryToolbar category="playlists" onCategoryChange={onCategoryChange} categoryFocusRequest={categoryFocusRequest} sort={sort} onSort={changeOrder} sortDisabled={editingOrder} refreshDisabled={fetching || !!pending || editingOrder} onRefresh={() => void fetchPlaylists(true)}>
      {sort === 3 && <RowAction label={editingOrder ? t('library.done') : t('library.edit')} onClick={() => setEditingOrder(value => !value)}>{editingOrder ? <MdCheck size={18} /> : <MdEdit size={17} />}</RowAction>}
    </LibraryToolbar>
    {!editingOrder && <MediaRow focusId="search" title={t('library.search')} subtitle={t('library.searchHint')} icon={<FaSearch size={20} style={{color:'#fff'}} />} onPlay={() => openSearch('playlists',browse.capture({},'search'))} />}
    {error && <div role="alert" className="ytm-error">{error}</div>}
    {notice && <div role="status" className="ytm-collection-note">{notice}</div>}
    {loading && <div className="ytm-empty">{t('library.loading')}</div>}
    {!loading&&fetching&&<div className="ytm-collection-note" role="status">{t('catalog.loadingRest')}</div>}
    {!loading && !error && !playlists.length && <div className="ytm-empty">{t('library.empty')}</div>}
    {orderedPlaylists.map(playlist => <MediaRow tintFocus key={playlist.playlistId}
      focusId={'entry:playlist:'+playlist.playlistId} title={pending === playlist.playlistId ? 'Loading…' : playlist.title}
      subtitle={playlist.count == null ? 'Your favorite songs' : `${playlist.count} songs`}
      image={playlist.playlistId === 'LM' ? LIKED_SONGS_ART : playlist.thumbnail} icon={undefined}
      editing={editingOrder} disabled={!!pending} onPlay={() => { if (!editingOrder) openPlaylist(playlist); }}
      playDescription={t('library.open')} endIcon={<MdChevronRight size={20} />} focusRequest={!selectedPlaylist()?.parentView&&libraryReturnPending() && selectedPlaylist()?.playlistId === playlist.playlistId ? returnRequest : undefined}
      actions={editingOrder ? <>
        <RowAction label={t('library.moveUp')} focusRequest={moveFocus.id === playlist.playlistId && moveFocus.direction === -1 ? moveFocus.sequence : undefined} disabled={orderedPlaylists[0]?.playlistId === playlist.playlistId} onClick={() => movePlaylist(playlist.playlistId,-1)}><MdArrowUpward size={18} /></RowAction>
        <RowAction label={t('library.moveDown')} focusRequest={moveFocus.id === playlist.playlistId && moveFocus.direction === 1 ? moveFocus.sequence : undefined} disabled={orderedPlaylists.at(-1)?.playlistId === playlist.playlistId} onClick={() => movePlaylist(playlist.playlistId,1)}><MdArrowDownward size={18} /></RowAction>
      </> : <>
        <RowAction label={t('library.play')} disabled={!!pending} onClick={() => void act(playlist, 'play')}><MdPlayArrow size={21} /></RowAction>
        <RowAction label={t('library.shuffle')} disabled={!!pending} onClick={() => void act(playlist, 'shuffle')}><MdShuffle size={20} /></RowAction>
      </>} />)}
  </Focusable>;
};

import { DialogButton, TextField, Focusable, Navigation, QuickAccessTab } from '@decky/ui';
import { call } from '@decky/api';
import { useEffect, useRef, useState } from 'react';
import { FaSearch, FaArrowLeft } from 'react-icons/fa';
import { MdPlaylistPlay, MdPlaylistAdd } from 'react-icons/md';
import { playTrack, getIsCastConnected, castRequest, type TrackInfo } from '../services/audioManager';
import { ThemeScope } from './ThemeScope';
import { MediaRow, RowAction } from './MediaRow';
interface SearchResult { videoId: string; title: string; artist: string; albumArt: string; duration: string }
export const SearchPage = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingSong, setLoadingSong] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [queued, setQueued] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const busy = useRef(false), request = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  const handleSearch = async () => {
    if (!query.trim()) return;
    const id = ++request.current;
    setError(''); setSearching(true); setHasSearched(true); setQueued(null);
    try {
      const result = await call<[string], { results?: SearchResult[]; error?: string }>('search_songs', query.trim());
      if (!alive.current || id !== request.current) return;
      if (result.error) { setError(result.error); setResults([]); }
      else setResults(result.results ?? []);
    } catch { if (alive.current && id === request.current) setError('Search could not connect. Please retry.'); }
    finally { if (alive.current && id === request.current) setSearching(false); }
  };
  const act = async (song: SearchResult, mode: 'play' | 'next' | 'append') => {
    if (busy.current) return;
    busy.current = true; setLoadingSong(song.videoId); setError(''); setQueued(null);
    try {
      if (mode !== 'play') {
        if (getIsCastConnected()) {
          if (mode === 'next') await castRequest('/api/queue/next', song);
          else {
            const duration = song.duration.split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0);
            await castRequest('/api/queue/append', { tracks:[{ ...song, duration }] });
          }
        }
        else {
          const result = await call<[SearchResult], {success?:boolean;error?:string}>(mode === 'next' ? 'queue_song_next' : 'queue_song_append', song);
          if (!result.success) throw new Error(result.error || 'Could not queue song.');
        }
        if (alive.current) setQueued(`${mode === 'next' ? 'Up next' : 'Added to queue'}: ${song.title}`);
      } else {
        const result = await call<[string, SearchResult], TrackInfo & {error?:string}>('play_song', song.videoId, song);
        if (result.error || !result.url) throw new Error(result.error || 'Could not play this song.');
        await playTrack(result);
        if (alive.current) { Navigation.NavigateBack(); Navigation.OpenQuickAccessMenu(QuickAccessTab.Decky); }
      }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Could not complete this action.'); }
    finally { busy.current = false; if (alive.current) setLoadingSong(null); }
  };
  return <Focusable flow-children="vertical" className="ytm-ui ytm-search-page" onCancelButton={() => Navigation.NavigateBack()} onCancelActionDescription="Back">
    <ThemeScope />
    <Focusable flow-children="vertical" className="ytm-search-content">
      <div className="ytm-search-header"><div><div className="ytm-eyebrow">Your music</div><h2>Find your next song</h2></div>
        <DialogButton className="ytm-button" onClick={() => Navigation.NavigateBack()}><FaArrowLeft /> Back</DialogButton></div>
      <Focusable flow-children="horizontal" className="ytm-search-form">
        <div className="ytm-search-input"><TextField value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleSearch(); } }} /></div>
        <DialogButton className="ytm-button" disabled={searching || !query.trim()} onClick={() => void handleSearch()}><FaSearch style={{color:'#fff'}} /> {searching ? 'Searching…' : 'Search'}</DialogButton>
      </Focusable>
      {error && <div role="alert" className="ytm-error">{error}</div>}
      {queued && <div role="status" className="ytm-collection-note">{queued}</div>}
      <Focusable flow-children="vertical" className="ytm-search-results">
        {!hasSearched && <div className="ytm-empty">Search by song or artist.</div>}
        {hasSearched && !searching && !results.length && !error && <div className="ytm-empty">No songs found. Try another title or artist.</div>}
        {results.map((song, index) => <MediaRow key={`${song.videoId}-${index}`} image={song.albumArt}
          title={loadingSong === song.videoId ? 'Loading…' : song.title} subtitle={song.artist}
          disabled={!!loadingSong} onPlay={() => void act(song, 'play')} actions={<>
            <span className="ytm-track-duration">{song.duration}</span>
            <RowAction label="Play next" disabled={!!loadingSong} onClick={() => void act(song, 'next')}><MdPlaylistPlay size={22} /></RowAction>
            <RowAction label="Add to queue" disabled={!!loadingSong} onClick={() => void act(song, 'append')}><MdPlaylistAdd size={22} /></RowAction>
          </>} />)}
      </Focusable>
    </Focusable>
  </Focusable>;
};

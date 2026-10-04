import { call } from '@decky/api';
import { Navigation } from '@decky/ui';
import { castRequest, getIsCastConnected, playTrack, type TrackInfo } from './audioManager';
import { nextBrowseDepth } from './browseNavigation';
import { selectPlaylist, PLAYLIST_ROUTE } from './playlistNavigation';
import { performPlaylistAction, type PlaylistAction } from './playlistActions';

export type CatalogKind = 'song'|'playlist'|'album'|'artist';
export type CatalogFilter = 'all'|'songs'|'playlists'|'albums'|'artists'|'singles';
export interface CatalogEntry { kind:CatalogKind; id:string; title:string; subtitle?:string; image?:string; count?:number|null; track?:TrackInfo; section?:string; playlistId?:string }
export interface CatalogResult { entries?:CatalogEntry[]; error?:string; hasMore?:boolean; limit?:number|null; title?:string; image?:string; playlistId?:string }
export const CATALOG_ROUTE='/youtube-music-browse/:key';
const selection=new Map<string,{entry:CatalogEntry; origin:'library'|'route'; returnDepth:number; parentView?:string}>();
let sequence=0;
const cache=new Map<string,{time:number;data:CatalogResult}>();
const pending=new Map<string,Promise<CatalogResult>>();
let epoch=0;
export const cachedCatalog=(key:string) => {
  const value=cache.get(key); return value && Date.now()-value.time<300000 ? value.data : undefined;
};
export function clearCatalogCache() { epoch++; cache.clear(); pending.clear(); selection.clear(); }
async function read(key:string, method:string, args:unknown[], refresh=false):Promise<CatalogResult> {
  if (!refresh && cachedCatalog(key)) return cachedCatalog(key)!;
  if (pending.has(key)) return pending.get(key)!;
  const generation=epoch;
  const task=call<unknown[],CatalogResult>(method,...args).then(data => {
    if (generation!==epoch) return {error:'Account changed. Reload Library.'};
    if (!data.error) { if(cache.size>=24) cache.delete(cache.keys().next().value!); cache.set(key,{time:Date.now(),data}); }
    return data;
  }).finally(() => { if(pending.get(key)===task) pending.delete(key); });
  pending.set(key,task);
  return task;
}
export const libraryKey=(category:CatalogFilter,limit:number|null) => `library:${category}:${limit}`;
export function cachedLibraryCategory(category:CatalogFilter) {
  let best:CatalogResult|undefined;
  for(const key of cache.keys()) {
    if(!key.startsWith(`library:${category}:`))continue;
    const data=cachedCatalog(key);
    if(data && (!best || (data.entries?.length||0)>(best.entries?.length||0) || data.hasMore===false))best=data;
  }
  return best;
}
export const detailKey=(kind:CatalogKind,id:string,filter:CatalogFilter) => JSON.stringify(['detail',kind,id,filter]);
export const loadLibraryCategory=(category:CatalogFilter,limit:number|null=100,refresh=false) => {
  if(refresh)for(const key of cache.keys())if(key.startsWith(`library:${category}:`))cache.delete(key);
  return read(libraryKey(category,limit),'get_library_items',[category,refresh,limit],refresh);
};
export const searchCatalog=(query:string,filter:CatalogFilter) => read(JSON.stringify(['search',query,filter]),'search_catalog',[query,filter]);
export const loadCatalogDetail=(kind:CatalogKind,id:string,filter:CatalogFilter) => read(detailKey(kind,id,filter),'get_catalog_detail',[kind,id,filter]);
export const selectedCatalog=(key:string) => selection.get(key);
export async function actCatalogCollection(entry:CatalogEntry,mode:PlaylistAction) {
  let playlistId=entry.kind==='playlist'?entry.id:entry.playlistId;
  if(!playlistId && (entry.kind==='album'||entry.kind==='artist')) {
    // Internal overview resolves the playable collection without fetching the
    // complete artist discography; metadata and simultaneous reads are cached.
    const result=await loadCatalogDetail(entry.kind,entry.id,'all');
    if(result.error)throw new Error(result.error);
    playlistId=result.playlistId;
  }
  if(!playlistId)throw new Error('No playable collection is available for this selection.');
  return performPlaylistAction(playlistId,mode);
}
export function openCatalog(entry:CatalogEntry,origin:'library'|'route'='route',parentView?:string) {
  if(entry.kind==='playlist') {
    selectPlaylist({playlistId:entry.id,title:entry.title,count:entry.count??null,thumbnail:entry.image||null,libraryScrollTop:0,origin,returnDepth:nextBrowseDepth(origin),parentView});
    Navigation.CloseSideMenus(); Navigation.Navigate(PLAYLIST_ROUTE); return;
  }
  const key=String(++sequence);
  // Retain every ancestor while nested routes are mounted; clear on unload.
  selection.set(key,{entry,origin,returnDepth:nextBrowseDepth(origin),parentView});
  Navigation.CloseSideMenus(); Navigation.Navigate(CATALOG_ROUTE.replace(':key',key));
}
export async function actCatalogSong(entry:CatalogEntry,mode:'play'|'next'|'append') {
  const track=entry.track;
  if(!track) throw new Error('No song selected.');
  if(mode==='play') {
    const result=await call<[string,TrackInfo],TrackInfo & {error?:string}>('play_song',track.videoId,track);
    if(result.error||!result.url) throw new Error(result.error||'Could not play this song.');
    await playTrack(result); return;
  }
  if(getIsCastConnected()) {
    await castRequest(mode==='next'?'/api/queue/next':'/api/queue/append',mode==='next'?track:{tracks:[track]});
  } else {
    const result=await call<[TrackInfo],{success?:boolean;error?:string}>(mode==='next'?'queue_song_next':'queue_song_append',track);
    if(!result.success) throw new Error(result.error||'Could not queue this song.');
  }
}

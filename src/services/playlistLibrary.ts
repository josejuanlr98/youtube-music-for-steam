import { call } from '@decky/api';
export interface PlaylistEntry { playlistId:string; title:string; count:number|null; thumbnail:string|null }
type LibraryResult={playlists?:PlaylistEntry[];error?:string;hasMore?:boolean};
let cached:LibraryResult|undefined, time=0, epoch=0;
const pending=new Map<string,Promise<LibraryResult>>();
export function cachedPlaylistLibrary(){return Date.now()-time<300000?cached:undefined;}
export function clearPlaylistLibrary(){epoch++;cached=undefined;time=0;pending.clear();}
export function loadPlaylistLibrary(preview=false,refresh=false):Promise<LibraryResult>{
  if(refresh)clearPlaylistLibrary();
  const value=cachedPlaylistLibrary();
  if(!refresh&&value&&(preview||!value.hasMore))return Promise.resolve(value);
  const key=String(preview),generation=epoch;
  if(pending.has(key))return pending.get(key)!;
  const task=call<[boolean,number|null],LibraryResult>('get_library_playlists',refresh,preview?0:null).then(result=>{
    if(generation!==epoch)return{error:'Account changed or Library refreshed. Please retry.'};
    if(!result.error&&(!preview||cached?.hasMore!==false)) {cached=result;time=Date.now();}
    return result;
  }).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
  pending.set(key,task);return task;
}

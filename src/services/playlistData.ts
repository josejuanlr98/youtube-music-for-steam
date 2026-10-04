import { call } from '@decky/api';
import type { TrackInfo } from './audioManager';
type PlaylistData={tracks?:TrackInfo[];error?:string;complete?:boolean};
const cache=new Map<string,{time:number;data:PlaylistData}>();
const pending=new Map<string,Promise<PlaylistData>>();
let epoch=0;
export function clearPlaylistData(){epoch++;cache.clear();pending.clear();}
export function cachedPlaylistData(id:string){
  const value=cache.get(id);
  return value&&Date.now()-value.time<300000?value.data:undefined;
}
export async function loadPlaylistData(id:string,preview=false):Promise<PlaylistData>{
  const cached=cachedPlaylistData(id);
  if(cached&&(preview||cached.complete))return cached;
  const key=id+':'+preview;
  if(pending.has(key))return pending.get(key)!;
  const generation=epoch;
  const task=call<[string,number|null],PlaylistData>('get_playlist_tracks',id,preview?0:null).then(data=>{
    if(generation!==epoch)return{error:'Account changed. Reload Library.'};
    if(data.error)return data;
    const result={...data,complete:data.complete??!preview};
    // A slower preview must never replace a complete response.
    if(!preview||!cachedPlaylistData(id)?.complete){
      if(cache.size>=8)cache.delete(cache.keys().next().value!);
      cache.set(id,{time:Date.now(),data:result});
    }
    return result;
  }).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
  pending.set(key,task);return task;
}

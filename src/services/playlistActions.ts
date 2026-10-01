import { call } from '@decky/api';
import { castRequest, getIsCastConnected, playTrack, type TrackInfo } from './audioManager';

export type PlaylistAction = 'play' | 'shuffle' | 'next' | 'append';

export async function performPlaylistAction(playlistId: string, mode: PlaylistAction) {
  if (mode === 'next' || mode === 'append') {
    if (getIsCastConnected()) {
      const data = await call<[string], { tracks?: TrackInfo[]; error?: string }>('get_playlist_tracks', playlistId);
      if (data.error) throw new Error(data.error);
      const result = await castRequest('/api/queue/append', { tracks:data.tracks ?? [], next:mode === 'next' });
      return { started:false, added:Number(result.added) || 0, cast:true };
    }
    const result = await call<[string], { added?: number; error?: string }>(mode === 'next' ? 'queue_playlist_next' : 'append_playlist', playlistId);
    if (result.error) throw new Error(result.error);
    return { started:false, added:result.added ?? 0, cast:false };
  }
  const result = await call<[string, boolean], TrackInfo & { error?: string; initialIds?: string[] }>('start_playlist', playlistId, mode === 'shuffle');
  if (result.error || !result.url) throw new Error(result.error || 'Could not play this playlist.');
  await playTrack(result);
  if (result.initialIds) void call<[string, string[], boolean], unknown>('complete_playlist', playlistId, result.initialIds, mode === 'shuffle').catch(() => {});
  return { started:true, added:0, cast:false };
}

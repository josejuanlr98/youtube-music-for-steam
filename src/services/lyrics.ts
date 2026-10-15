import { call } from '@decky/api';
import type { TrackInfo } from '../types';
export type TimedLine = { text: string; start: number; end: number };

export type LyricsResult = {
  lyrics?: string | null;
  source?: string | null;
  error?: string;
  timedLines?: TimedLine[];
  timingSource?: 'youtube' | 'lrclib' | null;
  timingPending?: boolean;
};
// Bounded caches + in-flight deduplication for instant lyrics and translations.
const cache = new Map<string, LyricsResult>();
const videoCache = new Map<string, LyricsResult>();
const lyricsPending = new Map<string, Promise<LyricsResult>>();
const translationCache = new Map<string, string[]>();
export type TranslationResult = {translatedLines?:string[]; error?:string; complete?:boolean};
const translationPending = new Map<string, Promise<TranslationResult>>();
let epoch=0;

export function cachedTranslatedLyrics(lyrics: string, target: string): string[] | undefined {
  return translationCache.get(JSON.stringify([lyrics, target]));
}

export async function loadTranslatedLyrics(lyrics: string, target: string): Promise<TranslationResult> {
  const key = JSON.stringify([lyrics, target]);
  const cached = translationCache.get(key);
  if (cached) return {translatedLines:cached, complete:true};
  if (translationPending.has(key)) return translationPending.get(key)!;
  const generation=epoch;
  const request = call<[string,string], TranslationResult>('translate_lyrics', lyrics, target)
    .catch(() => ({error:'Translation is temporarily unavailable'} as TranslationResult))
    .then(result => {
      if(generation!==epoch)return {error:'Translation cancelled'};
      if (result.translatedLines && result.complete !== false && !result.error) {
        if (translationCache.size >= 16) translationCache.delete(translationCache.keys().next().value!);
        translationCache.set(key, result.translatedLines);
      }
      return result;
    }).finally(() => {if(translationPending.get(key)===request)translationPending.delete(key);});
  translationPending.set(key, request);
  return request;
}

export function cachedLyrics(videoId: string, track?: TrackInfo): LyricsResult | undefined {
  const metadata = track ? { title:track.title, artist:track.artist, album:track.album, duration:track.duration } : undefined;
  const key = JSON.stringify([videoId, metadata]);
  const exact = cache.get(key);
  if (exact) return exact;
  const byVideo = videoCache.get(videoId);
  if (byVideo && (byVideo.timedLines?.length || !track?.duration)) return byVideo;
  return undefined;
}

export async function loadLyrics(videoId: string, track?: TrackInfo): Promise<LyricsResult> {
  const metadata = track ? { title:track.title, artist:track.artist, album:track.album, duration:track.duration } : undefined;
  const key = JSON.stringify([videoId, metadata]);
  const cached = cache.get(key);
  if (cached) return cached;
  const byVideo = videoCache.get(videoId);
  if (byVideo && (byVideo.timedLines?.length || !metadata?.duration)) return byVideo;
  if (lyricsPending.has(key)) return lyricsPending.get(key)!;
  const generation=epoch;
  const request = call<[string, typeof metadata], LyricsResult>('get_lyrics', videoId, metadata)
    .catch(() => ({ error: 'Could not load lyrics. Please try again.' } as LyricsResult))
    .then(result => {
      if(generation!==epoch)return {error:'Lyrics cancelled'};
      if (!result.error && result.lyrics && !result.timingPending) {
        if (cache.size >= 6) cache.delete(cache.keys().next().value!);
        cache.set(key, result);
        if (result.timedLines?.length || (metadata?.title && metadata.title !== 'Loading...')) {
          if (videoCache.size >= 6) videoCache.delete(videoCache.keys().next().value!);
          videoCache.set(videoId, result);
        }
      }
      return result;
    })
    .finally(() => {
      if (lyricsPending.get(key) === request) lyricsPending.delete(key);
    });
  lyricsPending.set(key, request);
  return request;
}
export function clearLyricsCache() {
  epoch++;
  cache.clear();
  videoCache.clear();
  lyricsPending.clear();
  translationCache.clear();
  translationPending.clear();
}

let readers = 0;
export function retainLyricsReader() {
  readers++;
  let released=false;
  return () => { if(!released){released=true;readers=Math.max(0,readers-1);} };
}
/** Only prefetch while a lyrics reader is open; never translate unheard queue items. */
export function prefetchTrackLyrics(track?: TrackInfo | null) {
  if (!readers || !track?.videoId || !track.title || track.title === 'Loading...' || !track.artist) return;
  void loadLyrics(track.videoId, track);
}

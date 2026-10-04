import { call } from '@decky/api';
import type { TrackInfo } from '../types';
export type TimedLine = { text: string; start: number; end: number };

export type LyricsResult = {
  lyrics?: string | null;
  source?: string | null;
  error?: string;
  timedLines?: TimedLine[];
  timingSource?: 'youtube' | 'lrclib' | null;
};
// Small bounded cache; populated only when the lyrics screen is opened.
const cache = new Map<string, LyricsResult>();
const translationCache = new Map<string, string[]>();
export type TranslationResult = {translatedLines?:string[]; error?:string; complete?:boolean};
const translationPending = new Map<string, Promise<TranslationResult>>();
let epoch=0;
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
        if (translationCache.size >= 12) translationCache.delete(translationCache.keys().next().value!);
        translationCache.set(key, result.translatedLines);
      }
      return result;
    }).finally(() => {if(translationPending.get(key)===request)translationPending.delete(key);});
  translationPending.set(key, request);
  return request;
}
export async function loadLyrics(videoId: string, track?: TrackInfo): Promise<LyricsResult> {
  const metadata = track ? { title:track.title, artist:track.artist, album:track.album, duration:track.duration } : undefined;
  const key = JSON.stringify([videoId, metadata]);
  const cached = cache.get(key);
  if (cached) return cached;
  const generation=epoch;
  const result = await call<[string, typeof metadata], LyricsResult>('get_lyrics', videoId, metadata)
    .catch(() => ({ error: 'Could not load lyrics. Please try again.' } as LyricsResult));
  if(generation!==epoch)return {error:'Lyrics cancelled'};
  if (!result.error && result.lyrics) {
    if (cache.size >= 6) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
  }
  return result;
}
export function clearLyricsCache() { epoch++; cache.clear(); translationCache.clear(); translationPending.clear(); }

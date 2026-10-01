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
export async function loadTranslatedLyrics(lyrics: string, target: string): Promise<string[] | null> {
  const key = JSON.stringify([lyrics, target]);
  const cached = translationCache.get(key);
  if (cached) return cached;
  const result: {translatedLines?:string[];error?:string} = await call<[string,string], {translatedLines?:string[];error?:string}>('translate_lyrics', lyrics, target)
    .catch(() => ({error:'Translation unavailable'}));
  if (!result.translatedLines) throw new Error(result.error || 'Translation is temporarily unavailable');
  if (translationCache.size >= 6) translationCache.delete(translationCache.keys().next().value!);
  translationCache.set(key, result.translatedLines);
  return result.translatedLines;
}
export async function loadLyrics(videoId: string, track?: TrackInfo): Promise<LyricsResult> {
  const metadata = track ? { title:track.title, artist:track.artist, album:track.album, duration:track.duration } : undefined;
  const key = JSON.stringify([videoId, metadata]);
  const cached = cache.get(key);
  if (cached) return cached;
  const result = await call<[string, typeof metadata], LyricsResult>('get_lyrics', videoId, metadata)
    .catch(() => ({ error: 'Could not load lyrics. Please try again.' } as LyricsResult));
  if (!result.error && result.lyrics) {
    if (cache.size >= 6) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
  }
  return result;
}
export function clearLyricsCache() { cache.clear(); translationCache.clear(); }

import { useEffect, useState } from 'react';
import { call, fetchNoCors } from '@decky/api';
import { recordVisualDiagnostic } from './visualDiagnostics';

export const defaultAccent = '180, 202, 220';
export type ArtworkPalette = [string, string, string];
export const defaultPalette: ArtworkPalette = [defaultAccent, '72, 101, 137', '43, 66, 96'];
const cache = new Map<string, ArtworkPalette>();
const pendingPalettes = new Map<string, Promise<ArtworkPalette>>();
const localArtwork = new Map<string, Promise<string | undefined>>();
export function loadLocalArtwork(url: string): Promise<string | undefined> {
  const cached = localArtwork.get(url);
  if (cached) return cached;
  const request = call<[string], { dataUrl?: string }>('get_artwork_data_url', url)
    .then(result => result.dataUrl).catch(() => undefined);
  if (localArtwork.size >= 12) localArtwork.delete(localArtwork.keys().next().value!);
  localArtwork.set(url, request);
  void request.then(value => { if (!value && localArtwork.get(url) === request) localArtwork.delete(url); });
  return request;
}

/** A tiny, quantized palette: one 32px sample per cover, never per frame. */
export function extractPalette(pixels: Uint8ClampedArray): ArtworkPalette {
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = pixels.subarray(i, i + 4);
    if (a < 128 || Math.max(r, g, b) < 35 || Math.min(r, g, b) > 235) continue;
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bin.count++; bin.r += r; bin.g += g; bin.b += b;
    bins.set(key, bin);
  }
  const ranked = [...bins.values()].map(bin => {
    const rgb = [bin.r, bin.g, bin.b].map(v => v / bin.count);
    const saturation = (Math.max(...rgb) - Math.min(...rgb)) / 255;
    return { rgb, weight:bin.count * (1 + saturation * 2) };
  }).sort((a, b) => b.weight - a.weight);
  if (!ranked.length) return [...defaultPalette];
  const chosen: number[][] = [];
  for (const { rgb } of ranked) {
    // Prefer genuinely different cover colors over three neighboring bins.
    if (chosen.every(other => Math.hypot(...rgb.map((v, i) => v - other[i])) > 70)) chosen.push(rgb);
    if (chosen.length === 3) break;
  }
  const readable = (rgb: number[]) => {
    const boost = Math.max(1, 185 / Math.max(1, ...rgb));
    return rgb.map(v => Math.round(Math.min(255, v * boost) * .84 + 255 * .16)).join(', ');
  };
  const colors = chosen.map(readable);
  // Monochrome covers use shades of their own color, never unrelated hues.
  while (colors.length < 3) colors.push(chosen[0].map(v => Math.round(v * (colors.length === 1 ? .65 : .4))).join(', '));
  return colors as ArtworkPalette;
}

export function extractAccent(pixels: Uint8ClampedArray): string {
  return extractPalette(pixels)[0];
}

function sampleArtwork(source: string, doc: Document) {
  return new Promise<ArtworkPalette>((resolve, reject) => {
    const image = doc.createElement('img');
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error('Artwork load timeout')); }, 5000);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = doc.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Canvas unavailable');
        context.drawImage(image, 0, 0, 32, 32);
        resolve(extractPalette(context.getImageData(0, 0, 32, 32).data));
      } catch (error) { reject(error); }
    };
    image.onerror = error => { clearTimeout(timer); reject(error); };
    image.src = source;
  });
}

export function paletteArtworkUrl(original: string) {
  try {
    const url = new URL(original);
    if (url.hostname.endsWith('.googleusercontent.com') || url.hostname.endsWith('.ggpht.com'))
      return original.replace(/=(?:w\d+|s\d+)[^?]*/, '=w128-h128-l90-rj');
    if (url.hostname.endsWith('.ytimg.com') && /^\/vi(?:_webp)?\/[^/]+\/[^/]+\.(?:jpg|webp)$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/[^/]+\.(jpg|webp)$/, '/hqdefault.$1');
      url.search = '';
      return url.href;
    }
  } catch { /* Unrecognized artwork uses its original URL. */ }
  return original;
}

export async function artworkPalette(original: string, doc: Document) {
  const url = paletteArtworkUrl(original);
  const host = (() => { try { return new URL(original).hostname; } catch { return 'embedded'; } })();
  recordVisualDiagnostic('Palette', `loading ${host}`);
  // Use Decky's documented CORS-safe fetch and a local blob in the visible
  // window. A remote <img> displaying successfully does not make canvas readable.
  if (/^https:\/\//.test(url)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let blobUrl: string | undefined;
    const urls = doc.defaultView?.URL || URL;
    try {
      const response = await fetchNoCors(url, { signal:controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!/^image\/(jpeg|png|webp)$/.test(blob.type) || blob.size > 2097152) throw new Error('Invalid image');
      blobUrl = urls.createObjectURL(blob);
      const color = await sampleArtwork(blobUrl, doc);
      recordVisualDiagnostic('Palette', `Decky image OK; rgb(${color[0]})`);
      return color;
    } catch (error) {
      recordVisualDiagnostic('Palette', `Decky image failed (${error instanceof Error ? error.name : 'load error'})`);
    } finally {
      clearTimeout(timer);
      if (blobUrl) urls.revokeObjectURL(blobUrl);
    }
  }
  try {
    const color = await sampleArtwork(url, doc);
    recordVisualDiagnostic('Palette', `direct image OK; rgb(${color[0]})`);
    return color;
  }
  catch {
    // Steam's browser sometimes displays Google artwork but blocks canvas
    // sampling. Ask the local backend for the same small, allow-listed image.
    const dataUrl = await loadLocalArtwork(url);
    const color = dataUrl ? await sampleArtwork(dataUrl, doc).catch(() => defaultPalette) : defaultPalette;
    recordVisualDiagnostic('Palette', dataUrl ? `backend image; rgb(${color[0]})` : 'all image methods failed');
    return color;
  }
}

export function preloadArtworkPalette(original: string, doc: Document): Promise<ArtworkPalette> {
  const cached = cache.get(original);
  if (cached) return Promise.resolve(cached);
  let pending = pendingPalettes.get(original);
  if (!pending) {
    pending = artworkPalette(original, doc).then(color => {
      if (color !== defaultPalette) {
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(original, color);
      }
      return color;
    }).finally(() => pendingPalettes.delete(original));
    pendingPalettes.set(original, pending);
  }
  return pending;
}

export function useArtworkPalette(url?: string, view?: { current: HTMLElement | null }) {
  const [value, setValue] = useState({ url, palette:url ? cache.get(url) || defaultPalette : defaultPalette });
  useEffect(() => {
    // Keep the last resolved palette while the new cover is sampled: no neutral flash.
    setValue(previous => ({ url, palette:url ? cache.get(url) || previous.palette : defaultPalette }));
    if (!url || cache.has(url)) return;
    let alive = true;
    const pending = preloadArtworkPalette(url, view?.current?.ownerDocument || document);
    void pending.then(color => {
      if (alive) setValue(previous => ({ url, palette:color === defaultPalette ? previous.palette : color }));
    });
    return () => { alive = false; };
  }, [url]);
  return value.url === url ? value.palette : url ? cache.get(url) || value.palette : defaultPalette;
}

export async function artworkAccent(original: string, doc: Document) {
  return (await artworkPalette(original, doc))[0];
}

export function useArtworkAccent(url?: string, view?: { current: HTMLElement | null }) {
  return useArtworkPalette(url, view)[0];
}

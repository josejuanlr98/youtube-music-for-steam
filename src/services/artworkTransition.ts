/** Two decoded cover layers, bounded even during rapid Cast skips. */
export type ArtworkFrame = { current: string; previous: string };
export type ArtworkLoad = { ready: Promise<string>; cancel(): void };
export function prepareArtwork(source: string, fallback: string | undefined, doc: Document): ArtworkLoad {
  let cancelled = false;
  let image: HTMLImageElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ready = new Promise<string>((resolve, reject) => {
    const load = (url: string, alternative?: string) => {
      if (cancelled) return;
      image = doc.createElement('img');
      image.decoding = 'async';
      image.onload = async () => {
        try { await image?.decode?.(); } catch { /* Loaded images can still render if decode is unsupported. */ }
        if (!cancelled) { clearTimeout(timer); resolve(url); }
      };
      image.onerror = () => {
        if (alternative && alternative !== url) load(alternative);
        else { clearTimeout(timer); reject(new Error('Artwork unavailable')); }
      };
      image.src = url;
    };
    timer = setTimeout(() => { cancelled = true; reject(new Error('Artwork timed out')); }, 8000);
    load(source, fallback);
  });
  return { ready, cancel() { cancelled = true; clearTimeout(timer); if (image) { image.onload = null; image.onerror = null; } } };
}

export function createArtworkTransition(onFrame: (frame: ArtworkFrame) => void,
  load: (source: string, fallback?: string) => ArtworkLoad) {
  let frame: ArtworkFrame = { current: '', previous: '' };
  let requested = '', generation = 0, disposed = false;
  let pending: ArtworkLoad | undefined;
  let retire: ReturnType<typeof setTimeout> | undefined;
  return {
    setSource(source: string, fallback?: string) {
      if (disposed || source === requested) return;
      requested = source;
      const request = ++generation;
      pending?.cancel();
      if (!source) return; // Cast can temporarily send metadata without a cover.
      pending = load(source, fallback);
      void pending.ready.then(loaded => {
        if (disposed || request !== generation) return;
        if (loaded === frame.current) return;
        clearTimeout(retire);
        frame = { current: loaded, previous: frame.current };
        onFrame(frame);
        retire = setTimeout(() => {
          if (!disposed && frame.current === loaded) { frame = { current: loaded, previous: '' }; onFrame(frame); }
        }, 480);
      }).catch(() => { /* Keep the last valid image when a remote cover fails. */ });
    },
    dispose() { disposed = true; generation++; pending?.cancel(); clearTimeout(retire); },
  };
}

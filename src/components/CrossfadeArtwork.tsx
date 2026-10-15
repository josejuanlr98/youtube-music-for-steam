import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createArtworkTransition, prepareArtwork, type ArtworkFrame } from '../services/artworkTransition';
const crop = (url: string) => /\.ytimg\.com\//.test(url) && /\/(?:hq|sd)default\./.test(url) && !url.includes('sqp=') ? 'scale(1.35)' : undefined;
export function CrossfadeArtwork({ src, fallback, style }: { src: string; fallback?: string; style?: CSSProperties }) {
  const root = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<ArtworkFrame>({ current: '', previous: '' });
  const transition = useRef<ReturnType<typeof createArtworkTransition> | null>(null);
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (!doc) return;
    transition.current = createArtworkTransition(setFrame, (source, alternative) => prepareArtwork(source, alternative, doc));
    return () => { transition.current?.dispose(); transition.current = null; };
  }, []);
  useEffect(() => { transition.current?.setSource(src, fallback); }, [src, fallback]);
  const image: CSSProperties = { position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', display:'block' };
  return <div ref={root} className="ytm-crossfade-artwork" style={{ position:'relative', overflow:'hidden', ...style }}>
    {frame.previous && <img src={frame.previous} alt="" aria-hidden="true" style={{ ...image, transform:crop(frame.previous) }} />}
    {frame.current && <img key={frame.current} src={frame.current} alt="Album art" className="ytm-cover-current" style={{ ...image, transform:crop(frame.current), animation:frame.previous ? 'ytm-cover-crossfade 420ms ease-in-out both' : undefined }} />}
  </div>;
}

import { DialogButton, Focusable } from '@decky/ui';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { useArtworkAccent, defaultAccent, defaultPalette, preloadArtworkPalette } from '../services/artworkPalette';
import { FaMusic } from 'react-icons/fa';
import { focusLyricsReader } from '../services/focus';

/** One card, with separated controls so focus never creates scalloped joins. */
export function MediaRow({ title, subtitle, image, icon, actions, selected, disabled, onPlay, editing, tintFocus = true, playDescription = 'Play', endIcon, focusRequest, imageFit='cover', focusId }: {
  title: string; subtitle?: string; image?: string | null; icon?: ReactNode;
  actions?: ReactNode; selected?: boolean; disabled?: boolean; onPlay: () => void; editing?: boolean; tintFocus?:boolean;
  playDescription?:string; endIcon?:ReactNode; focusRequest?:number;
  imageFit?:'contain'|'cover';
  focusId?:string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [sample, setSample] = useState(false);
  const [paletteStatus, setPaletteStatus] = useState<{ image:string; status:'ready'|'fallback' } | null>(null);
  useEffect(() => {
    if (!tintFocus || !image || !ref.current) return;
    const Observer = ref.current.ownerDocument.defaultView?.IntersectionObserver;
    if (!Observer) { setSample(true); return; }
    const observer = new Observer(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setSample(true); observer.disconnect(); }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [image, tintFocus]);
  useEffect(() => {
    if (!tintFocus || !image || !sample) return;
    let active = true, settled = false;
    const timer = setTimeout(() => {
      if (active && !settled) { settled = true; setPaletteStatus({ image, status:'fallback' }); }
    }, 700);
    void preloadArtworkPalette(image, ref.current?.ownerDocument || document).then(color => {
      if (!active || settled) return;
      settled = true; clearTimeout(timer);
      setPaletteStatus({ image, status:color.every((channel,index) => channel === defaultPalette[index]) ? 'fallback' : 'ready' });
    }).catch(() => {
      if (!active || settled) return;
      settled = true; clearTimeout(timer); setPaletteStatus({ image, status:'fallback' });
    });
    return () => { active = false; clearTimeout(timer); };
  }, [image, sample, tintFocus]);
  const paletteResolved = !tintFocus || !image || paletteStatus?.image === image;
  useEffect(() => focusRequest && !disabled && paletteResolved ? focusLyricsReader(mainRef.current) : undefined, [focusRequest, disabled, paletteResolved]);
  const useTint = !tintFocus || !image || paletteStatus?.image === image && paletteStatus.status === 'ready';
  const accent = useArtworkAccent(useTint && tintFocus && sample ? image || undefined : undefined, ref);
  return <Focusable ref={ref} onFocusCapture={() => { if (tintFocus) setSample(true); }}
    style={{ '--ytm-row-accent':accent !== defaultAccent ? accent : '125,145,165', visibility:paletteResolved ? undefined : 'hidden' } as CSSProperties}
    className={`ytm-media-row${selected ? ' ytm-media-current' : ''}${tintFocus ? ' ytm-library-tint' : ''}`} flow-children="horizontal">
    {editing ? <div className="ytm-media-copy"><div className="ytm-media-title">{title}</div><div className="ytm-media-subtitle">{subtitle}</div></div> :
    <DialogButton ref={mainRef} data-ytm-focus-id={focusId} className="ytm-button ytm-media-main" style={{ minWidth:0, width:0, flex:'1 1 0', padding:0, margin:0, display:'flex', alignItems:'center', gap:8, height:58, minHeight:58, border:0 }} disabled={disabled} onClick={onPlay} onOKActionDescription={playDescription}>
      <div className="ytm-media-art">{image ? <img src={image} alt="" loading="lazy" style={{objectFit:imageFit}} /> : icon || <FaMusic size={20} />}</div>
      <div className="ytm-media-copy"><div className="ytm-media-title">{title}</div>
        {subtitle && <div className="ytm-media-subtitle">{subtitle}</div>}</div>
      {endIcon && <span className="ytm-media-end-icon" aria-hidden="true">{endIcon}</span>}
    </DialogButton>}
    {actions && <div className="ytm-media-actions">{actions}</div>}
  </Focusable>;
}

export function RowAction({ label, disabled, onClick, children, preferredFocus, focusRequest }: {
  label: string; disabled?: boolean; onClick: () => void; children: ReactNode; preferredFocus?: boolean; focusRequest?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusRequest && !disabled) return focusLyricsReader(ref.current);
    return undefined;
  }, [focusRequest, disabled]);
  return <DialogButton ref={ref} className="ytm-button ytm-row-action" aria-label={label} onOKActionDescription={label}
    style={{ width:30, minWidth:30, maxWidth:30, flex:'0 0 30px', height:34, minHeight:34, padding:0, margin:0, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, border:0 }}
    disabled={disabled} preferredFocus={preferredFocus} onClick={onClick}><span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:22, height:22, flexShrink:0 }}>{children}</span></DialogButton>;
}

import { useEffect, useRef } from 'react';
import type { ArtworkPalette } from '../services/artworkPalette';
import { recordVisualDiagnostic } from '../services/visualDiagnostics';

/** CSS owns the animation in the rendered document (including Steam portals). */
export function startArtworkMotion(element: HTMLElement, reverse = false) {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const reduced = view?.matchMedia('(prefers-reduced-motion: reduce)');
  const style = doc.createElement('style');
  style.textContent = `@keyframes ytm-artwork-drift {
    0% { transform:translate(-7%, 10%) scale(1.04, .96) rotate(-5deg); }
    25% { transform:translate(3%, 7%) scale(.98, 1.08) rotate(-1deg); }
    52% { transform:translate(8%, -5%) scale(1.1, 1.02) rotate(4deg); }
    78% { transform:translate(-4%, -8%) scale(1.03, .94) rotate(1deg); }
    100% { transform:translate(-7%, 10%) scale(1.04, .96) rotate(-5deg); }
  }`;
  doc.head.appendChild(style);
  const update = () => {
    element.style.setProperty('animation', reduced?.matches ? 'none' : `ytm-artwork-drift ${reverse ? 44 : 36}s cubic-bezier(.45,0,.55,1) ${reverse ? '-22s' : '-9s'} infinite ${reverse ? 'reverse' : 'normal'}`, 'important');
    recordVisualDiagnostic('Motion', reduced?.matches ? 'reduced motion enabled' : 'CSS drift started');
  };
  reduced?.addEventListener('change', update);
  const visibility = () => element.style.setProperty('animation-play-state', doc.hidden ? 'paused' : 'running', 'important');
  doc.addEventListener?.('visibilitychange', visibility);
  update();
  visibility();
  // Observe real elapsed time, not a manually scrubbed animation. Two samples,
  // no permanent polling or per-frame React updates.
  let before = '';
  let beforeTime: number | null = null;
  const first = setTimeout(() => {
    before = view?.getComputedStyle(element).transform || '';
    beforeTime = Number(element.getAnimations?.()[0]?.currentTime ?? NaN);
  }, 500);
  const second = setTimeout(() => {
    const transform = view?.getComputedStyle(element).transform || '';
    const animation = element.getAnimations?.()[0];
    const advanced = Number(animation?.currentTime) > Number(beforeTime);
    recordVisualDiagnostic('Motion', `changed=${!!before && before !== transform}; clock=${advanced}; state=${animation?.playState || 'none'}; document=${doc.visibilityState}`);
  }, 2500);
  return () => {
    clearTimeout(first); clearTimeout(second);
    element.style.removeProperty('animation');
    element.style.removeProperty('animation-play-state');
    doc.removeEventListener?.('visibilitychange', visibility);
    style.remove();
    reduced?.removeEventListener('change', update);
  };
}

export function ArtworkBackdrop({ palette, animated = false }: { palette: ArtworkPalette; animated?: boolean }) {
  const artRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!animated || !artRef.current || !secondRef.current) return;
    const stopFirst = startArtworkMotion(artRef.current);
    const stopSecond = startArtworkMotion(secondRef.current, true);
    return () => { stopFirst(); stopSecond(); };
  }, [animated]);
  const [primary, secondary, tertiary] = palette;
  // Lift the base enough that the cover's color reads across the whole screen.
  const darkBase = primary.split(',').map((channel) => {
    const value = Number(channel.trim());
    return Math.round((Number.isFinite(value) ? value : 8) * .34);
  }).join(',');
  return <div className="ytm-atmosphere" aria-hidden="true" style={{ position:'absolute', inset:0, overflow:'hidden', zIndex:0, pointerEvents:'none', background:`linear-gradient(125deg, rgba(${primary},.2), rgba(${secondary},.14)), rgb(${darkBase})` }}>
    <div ref={artRef} className="ytm-atmosphere-art"
      style={{ position:'absolute', inset:'-26%', filter:'none', opacity:.9, transform:'scale(1.12)', willChange:'transform',
        backgroundImage:`radial-gradient(ellipse 31% 39% at 27% 65%, rgba(${primary},.9) 0%, rgba(${primary},.72) 36%, rgba(${primary},.24) 65%, transparent 82%), radial-gradient(ellipse 28% 35% at 71% 34%, rgba(${secondary},.86) 0%, rgba(${secondary},.65) 38%, rgba(${secondary},.2) 67%, transparent 84%)` }} />
    <div ref={secondRef} className="ytm-atmosphere-flow"
      style={{ position:'absolute', inset:'-26%', opacity:.76, transform:'scale(1.12)', willChange:'transform',
        backgroundImage:`radial-gradient(ellipse 31% 39% at 56% 63%, rgba(${tertiary},.9) 0%, rgba(${tertiary},.68) 38%, rgba(${tertiary},.2) 68%, transparent 84%), radial-gradient(ellipse 22% 30% at 31% 28%, rgba(${primary},.78) 0%, rgba(${primary},.42) 46%, transparent 80%)` }} />
    <div className="ytm-atmosphere-shade" style={{ position:'absolute', inset:0,
      background:'linear-gradient(90deg,rgba(5,8,14,.20),rgba(5,8,14,.38) 62%,rgba(5,8,14,.44)),radial-gradient(ellipse at 50% 50%,transparent 25%,rgba(5,8,14,.32))' }} />
  </div>;
}

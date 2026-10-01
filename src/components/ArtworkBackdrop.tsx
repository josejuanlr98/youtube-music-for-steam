import { useEffect, useRef } from 'react';
import type { ArtworkPalette } from '../services/artworkPalette';
import { recordVisualDiagnostic } from '../services/visualDiagnostics';

// Two feathered color fields drift slowly behind the cover and lyrics.
// Only transforms animate: gradients paint once, with no blur filter,
// canvas loop or per-frame React work while a game is running.
const KEYFRAMES = `@keyframes ytm-artwork-drift {
  0%, 100% { transform:translate(-12%, 8%) scale(.98, 1.08) rotate(-7deg); }
  30% { transform:translate(7%, -8%) scale(1.14, .96) rotate(2deg); }
  65% { transform:translate(12%, 7%) scale(1.02, .92) rotate(7deg); }
}
@keyframes ytm-artwork-counterdrift {
  0%, 100% { transform:translate(11%, -9%) scale(1.08, .96) rotate(6deg); }
  35% { transform:translate(-8%, 8%) scale(.94, 1.13) rotate(-3deg); }
  70% { transform:translate(-12%, -5%) scale(1.12, .98) rotate(-7deg); }
}`;

const sharedStyles = new WeakMap<Document, { style: HTMLStyleElement; users: number }>();

/** CSS owns animation in the document that actually renders Steam's fullscreen route. */
export function startArtworkMotion(element: HTMLElement, reverse = false, diagnose = true) {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const reduced = view?.matchMedia('(prefers-reduced-motion: reduce)');
  let shared = sharedStyles.get(doc);
  if (!shared) {
    const style = doc.createElement('style');
    style.textContent = KEYFRAMES;
    doc.head.appendChild(style);
    shared = { style, users:0 };
    sharedStyles.set(doc, shared);
  }
  shared.users++;
  const update = () => {
    const animation = reverse
      ? 'ytm-artwork-counterdrift 34s cubic-bezier(.45,0,.55,1) -16s infinite'
      : 'ytm-artwork-drift 28s cubic-bezier(.45,0,.55,1) -8s infinite';
    element.style.setProperty('animation', reduced?.matches ? 'none' : animation, 'important');
    if (diagnose) recordVisualDiagnostic('Motion', reduced?.matches ? 'reduced motion enabled' : 'CSS drift started');
  };
  const visibility = () => element.style.setProperty('animation-play-state', doc.hidden ? 'paused' : 'running', 'important');
  reduced?.addEventListener('change', update);
  doc.addEventListener?.('visibilitychange', visibility);
  update();
  visibility();
  // A short, one-off diagnostic confirms animation in Steam's portal document.
  let before = '';
  let beforeTime: number | null = null;
  const first = diagnose ? setTimeout(() => {
    before = view?.getComputedStyle(element).transform || '';
    beforeTime = Number(element.getAnimations?.()[0]?.currentTime ?? NaN);
  }, 500) : undefined;
  const second = diagnose ? setTimeout(() => {
    const transform = view?.getComputedStyle(element).transform || '';
    const animation = element.getAnimations?.()[0];
    const advanced = Number(animation?.currentTime) > Number(beforeTime);
    recordVisualDiagnostic('Motion', `changed=${!!before && before !== transform}; clock=${advanced}; state=${animation?.playState || 'none'}; document=${doc.visibilityState}`);
  }, 2500) : undefined;
  return () => {
    if (first !== undefined) clearTimeout(first);
    if (second !== undefined) clearTimeout(second);
    element.style.removeProperty('animation');
    element.style.removeProperty('animation-play-state');
    doc.removeEventListener?.('visibilitychange', visibility);
    reduced?.removeEventListener('change', update);
    if (shared && --shared.users === 0) { shared.style.remove(); sharedStyles.delete(doc); }
  };
}

const channels = (color: string) => color.split(',').map(value => Number(value.trim()));

export function ArtworkBackdrop({ palette, animated = false }: { palette: ArtworkPalette; animated?: boolean }) {
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!animated || !firstRef.current || !secondRef.current) return;
    const stopFirst = startArtworkMotion(firstRef.current);
    const stopSecond = startArtworkMotion(secondRef.current, true, false);
    return () => { stopFirst(); stopSecond(); };
  }, [animated]);
  const [primary, secondary, tertiary] = palette;
  const dark = (color: string) => channels(color).map(value => Math.round(value * .27 + 9)).join(', ');
  const surface = { position:'absolute', inset:'-18%', pointerEvents:'none', willChange:'transform' } as const;
  return <div className="ytm-atmosphere" aria-hidden="true" style={{ position:'absolute', inset:0, overflow:'hidden', zIndex:0, pointerEvents:'none',
    background:`radial-gradient(ellipse 85% 90% at 18% 50%, rgba(${primary},.32), transparent 78%), linear-gradient(125deg, rgb(${dark(primary)}), rgb(${dark(tertiary)}))` }}>
    <div ref={firstRef} className="ytm-atmosphere-art" style={{ ...surface,
      backgroundImage:`radial-gradient(ellipse 33% 43% at 29% 52%, rgba(${primary},.78) 0%, rgba(${primary},.38) 40%, transparent 79%), radial-gradient(ellipse 29% 35% at 68% 26%, rgba(${secondary},.6) 0%, rgba(${secondary},.28) 45%, transparent 78%)` }} />
    <div ref={secondRef} className="ytm-atmosphere-flow" style={{ ...surface,
      backgroundImage:`radial-gradient(ellipse 31% 39% at 71% 68%, rgba(${tertiary},.7) 0%, rgba(${tertiary},.33) 43%, transparent 80%), radial-gradient(ellipse 27% 32% at 42% 80%, rgba(${secondary},.5) 0%, rgba(${secondary},.22) 47%, transparent 79%)` }} />
    <div className="ytm-atmosphere-shade" style={{ position:'absolute', inset:0,
      background:'linear-gradient(90deg,rgba(5,8,14,.10),rgba(5,8,14,.30) 58%,rgba(5,8,14,.38)),radial-gradient(ellipse at 50% 50%,transparent 46%,rgba(5,8,14,.22))' }} />
  </div>;
}

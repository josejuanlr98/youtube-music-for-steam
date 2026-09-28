import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

export function OverflowText({ text }: { text:string }) {
  return <div title={text} data-scroll-text style={{ overflow:'hidden', whiteSpace:'nowrap', width:'100%' }}><span style={{ display:'inline-block', minWidth:'100%' }}>{text}</span></div>;
}

/** One clock for both labels; the shorter line waits for the longer one. */
export function OverflowTextGroup({ children, textKey, style }: { children:ReactNode; textKey:string; style?:CSSProperties }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const doc = container.ownerDocument, view = doc.defaultView;
    const reduced = view?.matchMedia('(prefers-reduced-motion: reduce)');
    const labels = Array.from(container.querySelectorAll<HTMLElement>('[data-scroll-text]'));
    let animations: Animation[] = [], visible = true;
    const pause = () => animations.forEach(animation => { if (doc.hidden || !visible) animation.pause(); else animation.play(); });
    const measure = () => {
      animations.forEach(animation => animation.cancel()); animations = [];
      if (reduced?.matches) return;
      const lines = labels.map(box => ({ inner:box.firstElementChild as HTMLElement, distance:Math.max(0, (box.firstElementChild as HTMLElement).scrollWidth - box.clientWidth) })).filter(line => line.distance >= 2);
      if (!lines.length) return;
      const longest = Math.max(...lines.map(line => Math.max(2500, line.distance / 22 * 1000)));
      const duration = longest + 2500;
      const startTime = doc.timeline.currentTime;
      animations = lines.flatMap(({inner,distance}) => {
        if (!inner.animate) return [];
        const travel = Math.max(2500, distance / 22 * 1000);
        const animation = inner.animate([
          { transform:'translateX(0)', opacity:1, offset:0 },
          { transform:'translateX(0)', opacity:1, offset:1000 / duration },
          { transform:`translateX(-${distance}px)`, opacity:1, offset:(1000 + travel) / duration },
          { transform:`translateX(-${distance}px)`, opacity:1, offset:(2000 + longest) / duration },
          { transform:`translateX(-${distance}px)`, opacity:0, offset:(2250 + longest) / duration },
          { transform:'translateX(0)', opacity:0, offset:(2250 + longest) / duration },
          { transform:'translateX(0)', opacity:1, offset:1 },
        ], { duration, iterations:Infinity, easing:'linear' });
        if (startTime != null) animation.startTime = startTime;
        return [animation];
      });
      pause();
    };
    const resize = view?.ResizeObserver ? new view.ResizeObserver(measure) : undefined;
    labels.forEach(box => { resize?.observe(box); if (box.firstElementChild) resize?.observe(box.firstElementChild); });
    const observer = view?.IntersectionObserver ? new view.IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); pause(); }) : undefined;
    observer?.observe(container);
    doc.addEventListener('visibilitychange', pause); reduced?.addEventListener('change', measure);
    measure();
    return () => { animations.forEach(animation => animation.cancel()); resize?.disconnect(); observer?.disconnect(); doc.removeEventListener('visibilitychange', pause); reduced?.removeEventListener('change', measure); };
  }, [textKey]);
  return <div ref={root} style={style}>{children}</div>;
}

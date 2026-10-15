/** Accumulate repeated stick input instead of restarting native smooth-scroll. */
export function createReaderScroller(element: HTMLElement) {
  const view = element.ownerDocument.defaultView!;
  let frame = 0, target = element.scrollTop, pos = element.scrollTop, last = 0;
  const step = (now:number) => {
    const elapsed = last ? Math.min(40, Math.max(1, now-last)) : 16;
    last = now;
    const delta = target - pos;
    if (Math.abs(delta) < 0.5) { pos = target; element.scrollTop = target; frame = 0; last = 0; return; }
    pos += delta * (1 - Math.exp(-elapsed / 58));
    element.scrollTop = pos;
    frame = view.requestAnimationFrame(step);
  };
  return {
    cancel() { view.cancelAnimationFrame(frame); frame = 0; last = 0; pos = target = element.scrollTop; },
    scroll(distance:number) {
      if (!frame) pos = target = element.scrollTop;
      target = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, target + distance));
      if (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { pos = element.scrollTop = target; return; }
      if (!frame) frame = view.requestAnimationFrame(step);
    },
    scrollTo(position:number, instant=false) {
      if (!frame) pos = element.scrollTop;
      target = Math.max(0, Math.min(Math.max(0, element.scrollHeight - element.clientHeight), position));
      if (instant || view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        view.cancelAnimationFrame(frame); frame = 0; last = 0; pos = element.scrollTop = target; return;
      }
      // Manual browsing and automatic following share this one animation.
      if (!frame) frame = view.requestAnimationFrame(step);
    },
    dispose() { view.cancelAnimationFrame(frame); frame = 0; last = 0; },
  };
}

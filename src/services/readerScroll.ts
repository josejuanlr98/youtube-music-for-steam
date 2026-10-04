/** Accumulate repeated stick input instead of restarting native smooth-scroll. */
export function createReaderScroller(element: HTMLElement) {
  const view = element.ownerDocument.defaultView!;
  let frame = 0, target = element.scrollTop, last = 0;
  const step = (now:number) => {
    const elapsed = last ? Math.min(40, now-last) : 16;
    last = now;
    const delta = target-element.scrollTop;
    if (Math.abs(delta) < 1) { element.scrollTop=target; frame=0; last=0; return; }
    const before=element.scrollTop;
    element.scrollTop += delta * (1-Math.exp(-elapsed/55));
    // Steam can quantize scroll offsets to device pixels. Stop at the target
    // if rounding prevents progress instead of leaving a competing RAF alive.
    if(element.scrollTop===before){element.scrollTop=target;frame=0;last=0;return;}
    frame=view.requestAnimationFrame(step);
  };
  return {
    cancel() { view.cancelAnimationFrame(frame); frame=0; last=0; target=element.scrollTop; },
    scroll(distance:number) {
      if (!frame) target=element.scrollTop;
      target=Math.max(0,Math.min(element.scrollHeight-element.clientHeight,target+distance));
      if (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { element.scrollTop=target; return; }
      if (!frame) frame=view.requestAnimationFrame(step);
    },
    scrollTo(position:number, instant=false) {
      target=Math.max(0,Math.min(Math.max(0,element.scrollHeight-element.clientHeight),position));
      if(instant || view.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
        view.cancelAnimationFrame(frame);frame=0;last=0;element.scrollTop=target;return;
      }
      // Manual browsing and automatic following share this one animation.
      if(!frame)frame=view.requestAnimationFrame(step);
    },
    dispose() { view.cancelAnimationFrame(frame); frame=0; last=0; },
  };
}

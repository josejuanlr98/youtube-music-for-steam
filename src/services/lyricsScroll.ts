/** Fullscreen reading motion, deliberately independent of song timing. */
export function startLyricsScroll(element: HTMLElement, initialPauseMs = 2000) {
  let pausedUntil = Date.now() + initialPauseMs;
  let playing = true;
  let previous = Date.now();
  let position = element.scrollTop;
  let restartAt = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.min(100, now - previous);
    previous = now;
    if (!playing || element.ownerDocument.visibilityState !== 'visible' || now < pausedUntil) {
      position = element.scrollTop;
      return;
    }
    const end = element.scrollHeight - element.clientHeight;
    if (end <= 1) return;
    if (restartAt) {
      if (now < restartAt) return;
      element.scrollTop = 0;
      position = 0;
      restartAt = 0;
      pausedUntil = now + 2000;
      return;
    }
    position = Math.min(end, position + elapsed * 0.012);
    element.scrollTop = position;
    if (position >= end) {
      restartAt = now + 5000;
    }
  }, 50);
  return {
    pause() { restartAt = 0; pausedUntil = Date.now() + 3000; position = element.scrollTop; },
    setPlaying(value: boolean) { playing = value; previous = Date.now(); position = element.scrollTop; },
    dispose() { clearInterval(timer); },
  };
}

import type { TimedLine } from './lyrics';

export function currentLyric(lines: TimedLine[], position: number) {
  let low = 0, high = lines.length - 1, anchor = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].start <= position) { anchor = middle; low = middle + 1; }
    else high = middle - 1;
  }
  if (anchor < 0 || !lines[anchor].text.trim()) return { anchor, active: -1 };
  let effectiveEnd = lines[anchor].end;
  // Bridge short vocal breaths (<= 1.15s) between consecutive sung lines so
  // the active highlight transitions directly to the next line without pulsing down.
  if (anchor + 1 < lines.length && lines[anchor + 1].text.trim()) {
    const gap = lines[anchor + 1].start - effectiveEnd;
    if (gap > 0 && gap <= 1.15) effectiveEnd = lines[anchor + 1].start;
  }
  const active = position < effectiveEnd ? anchor : -1;
  return { anchor, active };
}

// Offset the visual cue a fraction of a second to compensate for display
// rendering and the interval between audio clock samples.
const VISUAL_LEAD_SECONDS = 0.12;
const MANUAL_PAUSE_MS = 3000;

/** Follow actual audio positions, never an estimated wall-clock song timeline. */
export function followSyncedLyrics(element: HTMLElement, lines: TimedLine[],
  readPosition: () => number, subscribe: (listener: (position: number) => void) => (() => void),
  onActive: (index: number) => void, move?: (top:number,instant:boolean)=>void) {
  let active = -2, anchor = -2, paused = false, disposed = false;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  let centered = false;
  let resumeAt = 0;
  const update = (position: number, force = false, instant = false) => {
    if (disposed || !Number.isFinite(position)) return;
    // Progress polling also restores following if Steam delays a timer.
    if(paused && Date.now()>=resumeAt){paused=false;force=true;clearTimeout(resumeTimer);}
    const next = currentLyric(lines, position + VISUAL_LEAD_SECONDS);
    if (active !== next.active) { active = next.active; onActive(active); }
    if (!paused && (next.anchor !== anchor || force)) {
      const line = element.querySelector<HTMLElement>(`[data-lyric-index="${Math.max(0, next.anchor)}"]`);
      if (line && element.clientHeight > 0 && line.clientHeight > 0) {
        const top = element.scrollTop + line.getBoundingClientRect().top - element.getBoundingClientRect().top
          - element.clientHeight / 2 + line.clientHeight / 2;
        const immediately=instant || !centered;
        if(move)move(Math.max(0,top),immediately);
        else element.scrollTo({ top: Math.max(0, top), behavior: immediately ? 'auto' : 'smooth' });
        centered = true;
        anchor = next.anchor;
      }
    }
  };
  const unsubscribe = subscribe(position => update(position));
  update(readPosition(), true);
  // Steam focus, fonts and translated rows can settle after the first effect.
  // Re-measure geometry without resetting the user's manual-reading timeout.
  const view = element.ownerDocument?.defaultView;
  let frame = 0;
  const recenter = () => {
    if (!view || disposed) return;
    view.cancelAnimationFrame(frame);
    frame = view.requestAnimationFrame(() => update(readPosition(), true, !centered));
  };
  if (view && !centered) frame = view.requestAnimationFrame(() => recenter());
  const observer = view?.ResizeObserver ? new view.ResizeObserver(recenter) : null;
  observer?.observe(element);
  if (element.firstElementChild) observer?.observe(element.firstElementChild);
  return {
    pause() {
      const wasFollowing=!paused;
      paused = true;
      resumeAt = Date.now()+MANUAL_PAUSE_MS;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => update(readPosition(), true), MANUAL_PAUSE_MS);
      return wasFollowing;
    },
    dispose() { disposed = true; clearTimeout(resumeTimer); view?.cancelAnimationFrame(frame); observer?.disconnect(); unsubscribe(); },
  };
}

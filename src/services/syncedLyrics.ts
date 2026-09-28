import type { TimedLine } from './lyrics';

export function currentLyric(lines: TimedLine[], position: number) {
  let low = 0, high = lines.length - 1, anchor = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].start <= position) { anchor = middle; low = middle + 1; }
    else high = middle - 1;
  }
  const active = anchor >= 0 && position < lines[anchor].end && lines[anchor].text.trim() ? anchor : -1;
  return { anchor, active };
}

/** Follow actual audio positions, never an estimated wall-clock song timeline. */
export function followSyncedLyrics(element: HTMLElement, lines: TimedLine[],
  readPosition: () => number, subscribe: (listener: (position: number) => void) => (() => void),
  onActive: (index: number) => void) {
  let active = -2, anchor = -2, paused = false, disposed = false;
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  const update = (position: number, force = false) => {
    if (disposed || !Number.isFinite(position)) return;
    const next = currentLyric(lines, position);
    if (active !== next.active) { active = next.active; onActive(active); }
    if (!paused && (next.anchor !== anchor || force)) {
      const line = element.querySelector<HTMLElement>(`[data-lyric-index="${Math.max(0, next.anchor)}"]`);
      if (line) {
        const top = element.scrollTop + line.getBoundingClientRect().top - element.getBoundingClientRect().top
          - element.clientHeight / 2 + line.clientHeight / 2;
        element.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
      anchor = next.anchor;
    }
  };
  const unsubscribe = subscribe(position => update(position));
  update(readPosition(), true);
  return {
    pause() {
      paused = true;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { paused = false; update(readPosition(), true); }, 3000);
    },
    dispose() { disposed = true; clearTimeout(resumeTimer); unsubscribe(); },
  };
}

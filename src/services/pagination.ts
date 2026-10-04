import { useEffect, useRef, useState, type RefObject } from 'react';
import { focusLyricsReader } from './focus';

/** Use actual overflow rather than relying on a private Steam CSS class. */
export function resetPaginationScroll(element: HTMLElement | null) {
  if (!element) return;
  element.scrollTop = 0;
  const view = element.ownerDocument?.defaultView;
  if (view?.getComputedStyle) {
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      if (/^(auto|scroll|overlay)$/.test(view.getComputedStyle(ancestor).overflowY)) {
        ancestor.scrollTop = 0;
        return;
      }
    }
  }
  // Older CEF builds/fixtures may not expose computed layout at this point.
  const fallback = element.closest<HTMLElement>('[class*="TabContentsScroll"]');
  if (fallback) fallback.scrollTop = 0;
}

/** A bounded focus handoff shared by every page; never repeatedly steals focus. */
export function usePaginationFocus(scrollRef: RefObject<HTMLElement | null>) {
  const topNext = useRef<HTMLDivElement>(null), topPrevious = useRef<HTMLDivElement>(null);
  const [request, setRequest] = useState({direction:1, sequence:0});
  useEffect(() => request.sequence
    ? focusLyricsReader(request.direction > 0 ? topNext.current : topPrevious.current)
    : undefined, [request]);
  return {
    topNext, topPrevious,
    focusTop(direction: number) {
      resetPaginationScroll(scrollRef.current);
      setRequest(value => ({direction, sequence:value.sequence + 1}));
    },
    cancelFocus() { setRequest(value => value.sequence ? {...value, sequence:0} : value); },
  };
}

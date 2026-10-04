import { getGamepadNavigationTrees } from '@decky/ui';

type FocusNode = { Element?: Element; m_rgChildren?: FocusNode[]; BTakeFocus?: () => boolean };

/** One bounded handoff after React mounts the reader; no persistent focus loop. */
export function focusLyricsReader(element: HTMLElement | null, onFocused?: () => void): () => void {
  const view = element?.ownerDocument.defaultView;
  if (!element || !view) return () => {};
  let frame = 0;
  let attempts = 0;
  let cancelled = false;
  const focus = () => {
    if (cancelled || !element.isConnected) return;
    attempts++;
    try {
      const trees = getGamepadNavigationTrees() as Array<{ Root?: FocusNode }> | undefined;
      const pending = (trees ?? []).flatMap(tree => tree.Root ? [tree.Root] : []);
      const seen = new Set<FocusNode>();
      while (pending.length) {
        const node = pending.pop()!;
        if (seen.has(node)) continue;
        seen.add(node);
        if (node.Element === element && node.BTakeFocus?.()) { onFocused?.(); return; }
        if (node.m_rgChildren) pending.push(...node.m_rgChildren);
      }
    } catch { /* Steam may still be registering the new navigation tree. */ }
    if (attempts < 30) frame = view.requestAnimationFrame(focus);
    else { element.focus({ preventScroll:true }); onFocused?.(); }
  };
  frame = view.requestAnimationFrame(focus);
  return () => { cancelled = true; view.cancelAnimationFrame(frame); };
}

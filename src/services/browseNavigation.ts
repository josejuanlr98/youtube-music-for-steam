import { Navigation, QuickAccessTab, Router } from '@decky/ui';
import { requestPlayerReturn, requestLibraryTabReturn } from './playlistNavigation';

let depth = 0;
let returning = false;
export function setBrowseDepth(value:number) { depth = Math.max(0, value); }
export function nextBrowseDepth(origin:'library'|'route') { return origin === 'library' ? 1 : depth + 1; }

interface History {
  location: { pathname: string; key?: string };
  listen(callback: (location?: unknown, action?: string) => void): () => void;
  goBack(): void;
}
const ownRoute = (path: string) => /^\/youtube-music-(lyrics|settings|search|playlist|browse)(\/|$)/.test(path);
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function fadeOut(root?: HTMLElement | null) {
  if (!root?.isConnected || !root.animate || root.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const animation = root.animate([
    { opacity: 1, transform: 'translateX(0)' },
    { opacity: 0, transform: 'translateX(-8px)' },
  ], { duration: 110, easing: 'ease-out', fill: 'forwards' });
  // Also cover CEF suspending animation callbacks on a hidden view.
  await Promise.race([animation.finished.catch(() => {}), wait(160)]);
  return () => animation.cancel();
}

function routeHistory(): History | undefined {
  try {
    // Capture the main window before B changes Steam's focused window.
    const router = Router as unknown as { WindowStore?: { GamepadUIMainWindowInstance?: { History?: History } } };
    const history = router?.WindowStore?.GamepadUIMainWindowInstance?.History;
    if (typeof history?.listen === 'function' && typeof history.goBack === 'function') return history;
  } catch { /* Older clients use the bounded compatibility delay below. */ }
  return undefined;
}

async function pop(history?: History) {
  if (!history) { Navigation.NavigateBack(); await wait(140); return true; }
  const previous = history.location;
  return new Promise<boolean>(resolve => {
    let unsubscribe: (() => void) | undefined;
    const timer = setTimeout(() => finish(false), 1500);
    const finish = (changed: boolean) => { clearTimeout(timer); unsubscribe?.(); resolve(changed); };
    unsubscribe = history.listen((_location, action) => {
      if (action && action !== 'POP') { finish(false); return; }
      if (history.location !== previous) finish(true);
    });
    try { history.goBack(); }
    catch { finish(false); }
  });
}

async function painted(root?: HTMLElement | null) {
  const view = root?.ownerDocument.defaultView;
  if (!view?.requestAnimationFrame) return;
  // Steam can commit the History event before finishing its route transition.
  // Wait for the old page to leave the document before sliding QAM over it.
  if (root?.isConnected && view.MutationObserver) {
    await new Promise<void>(resolve => {
      const observer = new view.MutationObserver(() => { if (!root.isConnected) finish(); });
      const timer = setTimeout(() => finish(), 350);
      const finish = () => { observer.disconnect(); clearTimeout(timer); resolve(); };
      observer.observe(root.ownerDocument, { childList: true, subtree: true });
      if (!root.isConnected) finish();
    });
  }
  await Promise.race([
    new Promise<void>(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(() => resolve()))),
    wait(100),
  ]);
}

/** One animated back step, or a complete return to the plugin after playback. */
async function back(steps: number, root?: HTMLElement | null, requestReturn?: () => void, unwind = false) {
  if (returning) return;
  returning = true;
  const history = routeHistory();
  let cancelFade: (() => void) | undefined;
  try {
    requestReturn?.();
    cancelFade = await fadeOut(root);
    // Never unwind past our routes if a Steam shortcut changes the page.
    let remaining = history && unwind ? 32 : Math.max(1, steps);
    let changed = false;
    while (remaining-- > 0) {
      if (history && !ownRoute(history.location.pathname)) break;
      changed = await pop(history);
      if (!changed || !unwind) break;
    }
    if (changed) {
      await painted(root);
      if (requestReturn && (!history || !ownRoute(history.location.pathname))) {
        depth = 0;
        requestReturn();
        Navigation.OpenQuickAccessMenu(QuickAccessTab.Decky);
      }
    }
  } catch (error) { console.warn('[YouTube Music] Returning from a page', error); }
  finally { cancelFade?.(); returning = false; }
}

export function returnBrowseToPlayer(pageDepth = 1, root?: HTMLElement | null) {
  return back(pageDepth, root, requestPlayerReturn, true);
}
export function returnBrowseToLibrary(pageDepth = 1, root?: HTMLElement | null) {
  return back(pageDepth, root, requestLibraryTabReturn, true);
}
export function backFromBrowse(root?: HTMLElement | null, requestReturn?: () => void) {
  return back(1, root, requestReturn);
}

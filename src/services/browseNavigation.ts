import { Navigation, QuickAccessTab } from '@decky/ui';
import { requestPlayerReturn, requestLibraryTabReturn } from './playlistNavigation';

let depth = 0;
let returning = false;
export function setBrowseDepth(value:number) { depth = Math.max(0, value); }
export function nextBrowseDepth(origin:'library'|'route') { return origin === 'library' ? 1 : depth + 1; }

/** Unwind our own nested pages, preserving the Steam screen underneath. */
export function returnBrowseToPlayer(pageDepth = 1) {
  returnBrowse(pageDepth, requestPlayerReturn);
}

export function returnBrowseToLibrary(pageDepth = 1) {
  returnBrowse(pageDepth, requestLibraryTabReturn);
}

function returnBrowse(pageDepth: number, requestReturn: () => void) {
  if (returning) return;
  returning = true;
  requestReturn();
  let remaining = Math.max(1, pageDepth);
  const back = () => {
    Navigation.NavigateBack();
    remaining--;
    setTimeout(() => {
      if (remaining) { back(); return; }
      depth = 0;
      returning = false;
      Navigation.OpenQuickAccessMenu(QuickAccessTab.Decky);
      requestReturn();
    }, 180);
  };
  back();
}

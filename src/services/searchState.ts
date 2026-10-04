import { Navigation } from '@decky/ui';
import type { CatalogEntry, CatalogFilter } from './catalog';

let snapshot = { query:'', filter:'songs' as CatalogFilter, entries:[] as CatalogEntry[], searched:false, page:0, parentView:undefined as string|undefined };
export function getSearchState() { return snapshot; }
export function saveSearchState(value: typeof snapshot) { snapshot = value; }
export function clearSearchState() {
  snapshot = { query:'', filter:'songs', entries:[], searched:false, page:0, parentView:undefined };
}
export function openSearch(category: CatalogFilter,parentView?:string) {
  // Once searched, the query, results, filter and page belong to Search.
  if (!snapshot.searched) {
    snapshot = { ...snapshot, filter:category, page:0 };
  }
  snapshot={...snapshot,parentView};
  Navigation.CloseSideMenus();
  Navigation.Navigate('/youtube-music-search');
}

import type { CatalogEntry, CatalogFilter } from './catalog';
export function savedCatalogSort(category:CatalogFilter) {
  try { const value=Number(localStorage.getItem(`ytm-library-sort-${category}`)); return [0,1,2].includes(value)?value:0; }
  catch { return 0; }
}
export function saveCatalogSort(category:CatalogFilter,sort:number) {
  try { localStorage.setItem(`ytm-library-sort-${category}`,String(sort)); } catch { /* Session sorting still works. */ }
}
export function sortCatalog(entries:CatalogEntry[],sort:number) {
  return sort===0?entries:[...entries].sort((a,b)=>(sort===1?1:-1)*a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'}));
}

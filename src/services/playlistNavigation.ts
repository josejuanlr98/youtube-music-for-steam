export const PLAYLIST_ROUTE = '/youtube-music-playlist';
export const LIBRARY_RETURN_EVENT = 'ytm-return-library';

export interface PlaylistSelection {
  playlistId: string;
  title: string;
  count: number | null;
  thumbnail: string | null;
  libraryScrollTop: number;
  origin?: 'library' | 'route';
  returnDepth?: number;
  parentView?: string;
}

let selection: PlaylistSelection | null = null;
let returningToLibrary = false;
let returningToLibraryTab = false;

export function selectPlaylist(value: PlaylistSelection) {
  selection = value;
  returningToLibrary = false;
  returningToLibraryTab = false;
}

export function selectedPlaylist() { return selection; }

export function requestLibraryReturn() {
  returningToLibraryTab = false;
  returningToLibrary = true;
  window.dispatchEvent(new Event(LIBRARY_RETURN_EVENT));
}

// A catalogue page returns to the chosen Library filter, without restoring an
// unrelated playlist selection. This survives a QAM remount and lost UI event.
export function requestLibraryTabReturn() {
  returningToPlayer=false;
  returningToLibrary=false;
  returningToLibraryTab=true;
  window.dispatchEvent(new CustomEvent(LIBRARY_RETURN_EVENT,{detail:{preserveCategory:true}}));
}
export function consumeLibraryTabReturn(){returningToLibraryTab=false;}
export function libraryReturnPending() { return returningToLibrary || returningToLibraryTab; }

export function consumeLibraryReturn() {
  if (!returningToLibrary) return null;
  returningToLibrary = false;
  return selection;
}

let returningToPlayer = false;
export function requestPlayerReturn() {
  returningToLibrary = returningToLibraryTab = false;
  returningToPlayer = true;
  window.dispatchEvent(new Event('ytm-return-player'));
}
export function consumePlayerReturn() { const pending = returningToPlayer; returningToPlayer = false; return pending; }

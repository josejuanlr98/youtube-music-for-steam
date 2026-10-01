export const PLAYLIST_ROUTE = '/youtube-music-playlist';
export const LIBRARY_RETURN_EVENT = 'ytm-return-library';

export interface PlaylistSelection {
  playlistId: string;
  title: string;
  count: number | null;
  thumbnail: string | null;
  libraryScrollTop: number;
}

let selection: PlaylistSelection | null = null;
let returningToLibrary = false;

export function selectPlaylist(value: PlaylistSelection) {
  selection = value;
  returningToLibrary = false;
}

export function selectedPlaylist() { return selection; }

export function requestLibraryReturn() {
  returningToLibrary = true;
  window.dispatchEvent(new Event(LIBRARY_RETURN_EVENT));
}

export function libraryReturnPending() { return returningToLibrary; }

export function consumeLibraryReturn() {
  if (!returningToLibrary) return null;
  returningToLibrary = false;
  return selection;
}

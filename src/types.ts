export type RepeatMode = 'NONE' | 'ALL' | 'ONE';

export interface TrackInfo {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  albumArt: string;
  duration: number;
  url?: string;
  queuePosition?: number;
  queueLength?: number;
}

export interface PlayerState {
  track: TrackInfo | null;
  isPlaying: boolean;
  volume: number;
  repeat: RepeatMode;
  shuffle: boolean;
  authenticated: boolean;
  authReady: boolean;
  hasCredentials: boolean;
  castConnected: boolean;
  castNetwork: { uuid: string | null; name: string | null; trusted: boolean };
  castSenderName: string | null;
  position: number;
  duration: number;
}

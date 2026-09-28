import { createContext, useContext, useEffect, useReducer, useCallback, type FC, type ReactNode } from 'react';
import { call } from '@decky/api';
import type { PlayerState } from '../types';
import {
  addTrackChangeListener,
  addPlayStateListener,
  addCastConnectionListener,
  addNetworkListener,
  getCurrentTrack,
  getIsPlaying,
  getIsCastConnected,
  getNetworkInfo,
  getCastSenderName,
  getProgress,
  addProgressListener,
  type TrackInfo,
} from '../services/audioManager';

const defaultState: PlayerState = {
  track: null,
  isPlaying: false,
  volume: 100,
  repeat: 'NONE',
  shuffle: false,
  authenticated: false,
  authReady: false,
  hasCredentials: false,
  castConnected: false,
  castNetwork: { uuid: null, name: null, trusted: false },
  castSenderName: null,
  position: 0,
  duration: 0,
};

type Action =
  | { type: 'UPDATE'; payload: Partial<PlayerState> }
  | { type: 'SET_TRACK'; payload: TrackInfo | null }
  | { type: 'SET_PLAYING'; payload: boolean };

const reducer = (state: PlayerState, action: Action): PlayerState => {
  switch (action.type) {
    case 'UPDATE':
      return { ...state, ...action.payload };
    case 'SET_TRACK':
      return { ...state, track: action.payload };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.payload };
    default:
      return state;
  }
};

interface PlayerContextValue {
  state: PlayerState;
  updateState: (partial: Partial<PlayerState>) => void;
}

const PlayerContext = createContext<PlayerContextValue>({
  state: defaultState,
  updateState: () => {},
});

export const PlayerProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, defaultState);

  const updateState = useCallback((partial: Partial<PlayerState>) => {
    dispatch({ type: 'UPDATE', payload: partial });
  }, []);

  // Sync with audio manager on mount (panel open)
  useEffect(() => {
    const onAuthChanged = (event: Event) => {
      dispatch({ type:'UPDATE', payload:{ authenticated:(event as CustomEvent<boolean>).detail, authReady:true } });
    };
    window.addEventListener('ytm-auth-changed', onAuthChanged);
    // Restore state from audio manager (survives panel close/open)
    const track = getCurrentTrack();
    const playing = getIsPlaying();
    const castConnected = getIsCastConnected();
    const castNetwork = getNetworkInfo();
    const castSenderName = getCastSenderName();
    const progress = getProgress();
    if (track) dispatch({ type: 'SET_TRACK', payload: track });
    if (playing) dispatch({ type: 'SET_PLAYING', payload: playing });
    dispatch({ type: 'UPDATE', payload: { castConnected, castNetwork, castSenderName, position: progress.position, duration: progress.duration } });

    // Fetch playback state from backend
    void (async () => {
      try {
        const ps = await call<[], {
          is_playing: boolean;
          shuffle: boolean;
          repeat: string;
          volume: number;
        }>('get_playback_state');
        dispatch({
          type: 'UPDATE',
          payload: {
            shuffle: ps.shuffle,
            repeat: ps.repeat as PlayerState['repeat'],
            volume: ps.volume * 100,
          },
        });
      } catch (e) {
        console.error('[YTM] Failed to fetch playback state:', e);
      }

    })();

    // Resolve authentication independently from playback state. Until this
    // succeeds, consumers keep the cast-only/login hint hidden instead of
    // briefly showing a false "no cookies" state on every panel open.
    void call<[], { authenticated: boolean }>('get_auth_state').then(auth => {
      dispatch({ type:'UPDATE', payload:{ authenticated:auth.authenticated, authReady:true } });
    }).catch(e => console.error('[YTM] Failed to fetch auth state:', e));

    // Subscribe to audio manager events
    const removeTrack = addTrackChangeListener((t) => dispatch({ type: 'SET_TRACK', payload: t }));
    const removePlay = addPlayStateListener((p) => dispatch({ type: 'SET_PLAYING', payload: p }));
    const removeCast = addCastConnectionListener((connected, senderName) =>
      dispatch({ type: 'UPDATE', payload: { castConnected: connected, castSenderName: senderName } })
    );
    const removeNetwork = addNetworkListener((network) =>
      dispatch({ type: 'UPDATE', payload: { castNetwork: network } })
    );
    // The compact clock only displays seconds. Lyrics subscribe independently
    // to precise audio progress, so avoid rerendering every context consumer.
    let lastSecond = -1, lastDuration = -1;
    const refreshProgress = (position: number, duration: number) => {
      if (document.hidden) return;
      const second = Math.floor(position);
      if (second === lastSecond && duration === lastDuration) return;
      lastSecond = second; lastDuration = duration;
      dispatch({ type:'UPDATE', payload:{ position, duration } });
    };
    const resumeProgress = () => { const current = getProgress(); refreshProgress(current.position, current.duration); };
    const removeProgress = addProgressListener(refreshProgress);
    document.addEventListener('visibilitychange', resumeProgress);

    return () => {
      window.removeEventListener('ytm-auth-changed', onAuthChanged);
      removeTrack();
      removePlay();
      removeCast();
      removeNetwork();
      removeProgress();
      document.removeEventListener('visibilitychange', resumeProgress);
    };
  }, []);

  return <PlayerContext.Provider value={{ state, updateState }}>{children}</PlayerContext.Provider>;
};

export const usePlayer = () => {
  const { state, updateState } = useContext(PlayerContext);
  return { ...state, updateState };
};

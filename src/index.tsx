import { recoverFullscreenPower, releaseFullscreenPower } from './services/fullscreenPower';
import { staticClasses, DialogButton, Focusable, Navigation, Tabs } from '@decky/ui';
import { call, definePlugin, routerHook } from '@decky/api';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SiYoutubemusic } from 'react-icons/si';
import { BsGearFill } from 'react-icons/bs';

import { PlayerProvider, warmPlayerState, rememberAuthState } from './context/PlayerContext';
import { PlayerView } from './components/PlayerView';
import { QueueView } from './components/QueueView';
import { LibraryView } from './components/LibraryView';
import { SettingsPage } from './components/SettingsPage';
import { themeCss } from './theme';
import { clearLyricsCache } from './services/lyrics';
import { SearchPage, clearSearchState } from './components/SearchPage';
import { CatalogPage } from './components/CatalogPage';
import { CATALOG_ROUTE, clearCatalogCache } from './services/catalog';
import { clearPlaylistData } from './services/playlistData';
import { clearBrowseState } from './services/browseState';
import { clearPlaylistLibrary } from './services/playlistLibrary';
import { PlaylistPage } from './components/PlaylistPage';
import { LyricsPanel, LYRICS_ROUTE } from './components/LyricsPage';
import { LIBRARY_RETURN_EVENT, PLAYLIST_ROUTE, libraryReturnPending, consumeLibraryTabReturn, consumePlayerReturn } from './services/playlistNavigation';
import { initAudio, destroyAudio, addTrackChangeListener, addQueueListener, getIsCastConnected } from './services/audioManager';
import { initNotifications, registerNotificationPanel } from './services/notifications';
import { usePlayer } from './context/PlayerContext';
import { useArtworkAccent, preloadArtworkPalette, artworkPaletteReady } from './services/artworkPalette';
import { initI18nPreferences, useI18n } from './services/i18n';

const SETTINGS_ROUTE = '/youtube-music-settings';
const MUSIC_WORDMARK_PATH = 'M60.06 4.51L60.68 4.50L61.03 4.61L61.30 4.79L61.54 5.23L61.63 5.91L61.54 6.63L61.42 6.92L61.17 7.17L60.95 7.27L60.73 7.32L60.05 7.32L59.70 7.21L59.42 6.99L59.23 6.54L59.18 5.59L59.29 5.11L59.47 4.79L59.65 4.65ZM27.84 4.70L31.44 4.70L32.95 11.14L33.50 14.14L33.77 16.00L33.87 17.04L33.96 17.27L34.08 17.21L34.13 17.00L34.55 14.09L35.09 11.14L36.56 4.74L36.68 4.68L40.21 4.70L40.21 20.16L38.18 20.18L38.09 20.13L38.09 11.00L38.14 10.82L38.14 9.45L38.18 9.27L38.18 8.27L38.27 7.05L38.26 6.93L38.18 6.91L38.01 6.97L37.59 8.55L35.27 19.54L35.13 20.13L35.05 20.18L33.05 20.18L32.92 20.12L30.32 8.09L30.03 6.97L29.95 6.91L29.79 6.93L29.86 9.36L29.91 9.55L29.91 11.05L29.95 11.23L29.95 20.13L29.86 20.18L27.84 20.16ZM53.61 8.61L55.05 8.59L55.41 8.64L56.08 8.83L56.44 9.01L57.01 9.53L57.21 9.83L57.45 10.46L57.59 11.23L57.57 12.30L57.09 12.36L55.68 12.41L55.59 12.36L55.54 11.55L55.35 10.79L55.15 10.44L54.94 10.29L54.68 10.18L54.32 10.14L53.74 10.24L53.47 10.38L53.31 10.53L53.09 10.96L53.09 11.59L53.14 11.82L53.29 12.17L53.58 12.56L54.11 12.99L55.67 14.06L56.60 14.81L56.92 15.12L57.30 15.65L57.53 16.11L57.68 16.59L57.77 17.41L57.72 18.00L57.53 18.71L57.21 19.30L56.76 19.76L56.12 20.12L55.68 20.27L55.00 20.41L53.68 20.41L53.05 20.32L52.47 20.12L52.01 19.89L51.49 19.42L51.29 19.12L51.05 18.54L50.96 18.09L50.95 17.09L51.02 16.88L51.77 16.82L52.98 16.84L53.05 17.68L53.29 18.26L53.61 18.62L54.05 18.82L54.55 18.86L54.99 18.76L55.42 18.47L55.63 18.09L55.68 17.46L55.53 17.06L55.33 16.76L54.56 16.03L52.44 14.51L51.76 13.83L51.38 13.26L51.09 12.50L51.00 11.86L51.00 11.05L51.20 10.24L51.47 9.70L51.67 9.44L52.33 8.97L52.96 8.73ZM66.20 8.61L67.63 8.59L68.50 8.78L68.94 8.97L69.39 9.29L69.71 9.70L69.89 10.06L70.13 10.96L70.18 12.32L70.12 12.80L69.91 12.86L68.59 12.95L68.05 12.95L68.00 12.91L68.00 12.05L67.91 11.28L67.76 10.74L67.58 10.42L67.39 10.24L67.13 10.14L66.64 10.14L66.29 10.29L65.97 10.74L65.82 11.23L65.68 12.36L65.68 16.59L65.82 17.77L65.97 18.21L66.12 18.47L66.29 18.62L66.64 18.77L67.13 18.77L67.39 18.67L67.65 18.47L67.89 17.99L68.00 17.59L68.11 16.11L69.41 16.14L70.18 16.18L70.22 16.23L70.23 17.14L70.13 17.91L69.89 18.71L69.71 19.08L69.51 19.38L69.03 19.85L68.58 20.12L67.86 20.32L67.41 20.36L66.36 20.36L65.96 20.32L65.33 20.17L64.61 19.80L64.40 19.65L64.01 19.21L63.70 18.62L63.46 17.86L63.32 17.09L63.27 15.73L63.23 15.55L63.23 13.18L63.32 12.00L63.61 10.74L64.01 9.88L64.38 9.43L64.62 9.22L65.29 8.83L65.73 8.68ZM42.24 8.79L44.55 8.77L44.63 8.82L44.64 17.45L44.73 18.04L44.88 18.39L45.06 18.58L45.41 18.73L45.82 18.72L46.17 18.62L46.74 18.28L47.00 17.95L47.00 8.82L47.09 8.77L49.44 8.79L49.44 20.16L47.61 20.16L47.54 19.05L47.45 18.78L47.15 19.15L46.39 19.85L45.89 20.12L45.45 20.27L44.95 20.36L44.28 20.36L43.56 20.21L42.99 19.88L42.70 19.53L42.37 18.77L42.23 17.91ZM59.29 8.79L61.50 8.77L61.59 8.82L61.59 20.09L61.54 20.18L59.36 20.18L59.28 20.13Z';
const SEARCH_ROUTE = '/youtube-music-search';
const THEME_STYLE_ID = 'ytm-theme-styles';
const TABS_CSS = `
  #ytm-tabs-container > * { height:100%; display:flex; flex-direction:column; min-height:0; }
  #ytm-tabs-container [class*="TabHeaderRowWrapper"] { flex-shrink:0 !important; min-height:30px !important; padding:0 !important; margin-bottom:2px !important; }
  #ytm-tabs-container [class*="TabContentsScroll"] { flex:1 !important; min-height:0 !important; overflow-y:auto !important; padding:0 0 4px !important; margin-bottom:0 !important; }
  #ytm-tabs-container [class*="Glyphs"] { transform:scale(.65) !important; transform-origin:center center !important; }
  #ytm-tabs-container [role="tab"][aria-selected="true"] { box-shadow:inset 0 -2px rgba(var(--ytm-cover-accent, 78, 108, 132), .55); }
`;

const installThemeStyles = () => {
  let style = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = THEME_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `${themeCss}\n${TABS_CSS}`;
};

const removeThemeStyles = () => document.getElementById(THEME_STYLE_ID)?.remove();

// Keep Decky's Tabs interaction (including L1/R1) while constraining only our
// own panel. The ancestor Quick Access layout is left untouched.
const TabsContainer = memo(() => {
  const panelRef = useRef<HTMLDivElement>(null);
  const { track } = usePlayer();
  const { t, language, resolvedLanguage } = useI18n();
  const coverAccent = useArtworkAccent(track?.albumArt, panelRef);
  const [prepared, setPrepared] = useState(() => artworkPaletteReady(track?.albumArt));
  useLayoutEffect(() => {
    if (artworkPaletteReady(track?.albumArt)) { setPrepared(true); return; }
    let active=true;
    void preloadArtworkPalette(track!.albumArt!, panelRef.current?.ownerDocument||document).then(()=>{if(active)setPrepared(true);});
    return()=>{active=false;};
  }, [track?.albumArt]);
  useEffect(() => panelRef.current ? registerNotificationPanel(panelRef.current) : undefined, []);
  const [activeTab, setActiveTab] = useState(() => consumePlayerReturn() ? 'player' : libraryReturnPending() ? 'library' : 'player');
  const showTab = (tab:string) => {
    setActiveTab(tab);
    if (tab === 'player') requestAnimationFrame(() => window.dispatchEvent(new Event('ytm-return-player')));
  };
  useEffect(() => {
    consumeLibraryTabReturn();
    const returnToPlayer = () => { consumePlayerReturn(); setActiveTab('player'); };
    if (consumePlayerReturn()) setActiveTab('player');
    const returnToLibrary = () => { setActiveTab('library'); consumeLibraryTabReturn(); };
    window.addEventListener('ytm-return-player', returnToPlayer);
    window.addEventListener(LIBRARY_RETURN_EVENT, returnToLibrary);
    return () => { window.removeEventListener('ytm-return-player', returnToPlayer); window.removeEventListener(LIBRARY_RETURN_EVENT, returnToLibrary); };
  }, []);
  const tabItems = useMemo(() => {
    const library = { id:'library', title:t('tabs.library'), content:<LibraryView onSwitchToPlayer={() => showTab('player')} /> };
    const queue = { id:'queue', title:t('tabs.queue'), content:<QueueView /> };
    return [{ id:'player', title:t('tabs.player'), content:<PlayerView /> }, library, queue];
  }, [language, resolvedLanguage]);
  return <div ref={panelRef} id="ytm-tabs-container" className="ytm-ui" style={{
    '--ytm-cover-accent':coverAccent,
    width:'100%',
    maxWidth:'100%',
    minWidth:0,
    // Quick Access gets a different height when Steam is mirrored or attached
    // to an external display. Keep the tabs inside that viewport instead of
    // clipping them at the old fixed 390px height.
    height:'min(620px, calc(100vh - 96px))',
    minHeight:'320px',
    maxHeight:'calc(100vh - 96px)',
    overflow:'hidden',
    boxSizing:'border-box',
    visibility:prepared ? 'visible' : 'hidden',
    background:`linear-gradient(180deg, rgba(${coverAccent}, .30) 0%, rgba(${coverAccent}, .14) 48%, transparent 100%)`,
  } as React.CSSProperties}>
    <Tabs activeTab={activeTab} onShowTab={showTab} tabs={tabItems} />
  </div>;
});
TabsContainer.displayName = 'TabsContainer';

// Cast and its queue are available without a YouTube Music account.
const Content = () => <PlayerProvider><TabsContainer /></PlayerProvider>;

const onSettingsClick = () => {
  Navigation.Navigate(SETTINGS_ROUTE);
  Navigation.CloseSideMenus();
};

export default definePlugin(() => {
  void recoverFullscreenPower();
  const stopI18n = initI18nPreferences();
  installThemeStyles();
  const stopNotifications = initNotifications();
  initAudio();
  warmPlayerState();
  let mounted=true;
  const stopPalettePreload = addTrackChangeListener(track => {
    if (track?.albumArt) void preloadArtworkPalette(track.albumArt, document);
    if(track&&!getIsCastConnected())void call<[],{urls:string[]}>('get_upcoming_artwork')
      .then(result=>{if(mounted)for(const url of result.urls||[])void preloadArtworkPalette(url,document);}).catch(()=>{});
  });
  const stopQueuePreload=addQueueListener((tracks,position)=>{
    for(const track of tracks.slice(Math.max(0,position+1),Math.max(0,position+1)+2)){
      if(track.albumArt)void preloadArtworkPalette(track.albumArt,document);
    }
  });
  const clearAccountData=()=>{clearCatalogCache();clearPlaylistData();clearSearchState();clearLyricsCache();clearBrowseState();clearPlaylistLibrary();};
  const onAuthChange=(event:Event)=>{rememberAuthState((event as CustomEvent<boolean>).detail);clearAccountData();};
  window.addEventListener('ytm-auth-changed',onAuthChange);
  routerHook.addRoute(SETTINGS_ROUTE, () => <SettingsPage />);
  routerHook.addRoute(SEARCH_ROUTE, () => <SearchPage />);
  routerHook.addRoute(PLAYLIST_ROUTE, () => <PlaylistPage />);
  routerHook.addRoute(CATALOG_ROUTE, () => <CatalogPage />);
  routerHook.addRoute(LYRICS_ROUTE, () => <LyricsPanel fullScreen />);

  return {
    name: 'YouTube Music',
    titleView: (
      <Focusable
        style={{
          display: 'flex',
          padding: '0',
          width: '100%',
          boxShadow: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        className={`${staticClasses.Title} ytm-plugin-title`}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', minWidth: 0 }} aria-label="YouTube Music"><SiYoutubemusic size={20} style={{ color: '#ff2c55', display: 'block', flexShrink: 0 }} /><svg viewBox="27.8 0 42.5 24" aria-hidden="true" style={{ display: 'block', height: '20px', width: 'auto', fill: '#f4f6fa', flexShrink: 0 }}><path d={MUSIC_WORDMARK_PATH} /></svg></div>
        <DialogButton
          style={{ height: '28px', width: '40px', minWidth: 0, padding: '10px 12px' }}
          onClick={onSettingsClick}
          onOKActionDescription="Settings"
        >
          <BsGearFill style={{ marginTop: '-4px', display: 'block' }} />
        </DialogButton>
      </Focusable>
    ),
    content: <Content />,
    icon: <SiYoutubemusic />,
    onDismount() {
      mounted=false;
      void releaseFullscreenPower();
      stopNotifications();
      stopI18n();
      stopPalettePreload();
      stopQueuePreload();
      window.removeEventListener('ytm-auth-changed',onAuthChange);
      clearAccountData();
      destroyAudio();
      clearLyricsCache();
      removeThemeStyles();
      routerHook.removeRoute(SETTINGS_ROUTE);
      routerHook.removeRoute(SEARCH_ROUTE);
      routerHook.removeRoute(PLAYLIST_ROUTE);
      routerHook.removeRoute(CATALOG_ROUTE);
      routerHook.removeRoute(LYRICS_ROUTE);
    },
  };
});

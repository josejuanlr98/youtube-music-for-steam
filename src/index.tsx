import { staticClasses, DialogButton, Focusable, Navigation, Tabs } from '@decky/ui';
import { definePlugin, routerHook } from '@decky/api';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { SiYoutubemusic } from 'react-icons/si';
import { BsGearFill } from 'react-icons/bs';

import { PlayerProvider } from './context/PlayerContext';
import { PlayerView } from './components/PlayerView';
import { QueueView } from './components/QueueView';
import { LibraryView } from './components/LibraryView';
import { SettingsPage } from './components/SettingsPage';
import { themeCss } from './theme';
import { clearLyricsCache } from './services/lyrics';
import { SearchPage } from './components/SearchPage';
import { PlaylistPage } from './components/PlaylistPage';
import { LyricsPanel, LYRICS_ROUTE } from './components/LyricsPage';
import { LIBRARY_RETURN_EVENT, PLAYLIST_ROUTE, libraryReturnPending } from './services/playlistNavigation';
import { initAudio, destroyAudio } from './services/audioManager';
import { initNotifications, registerNotificationPanel } from './services/notifications';
import { usePlayer } from './context/PlayerContext';
import { useArtworkAccent } from './services/artworkPalette';
import { useI18n } from './services/i18n';

const SETTINGS_ROUTE = '/youtube-music-settings';
const SEARCH_ROUTE = '/youtube-music-search';
const THEME_STYLE_ID = 'ytm-theme-styles';
const TABS_CSS = `
  #ytm-tabs-container > * { height:100%; display:flex; flex-direction:column; min-height:0; }
  #ytm-tabs-container [class*="TabHeaderRowWrapper"] { flex-shrink:0 !important; min-height:32px !important; padding-left:0 !important; padding-right:0 !important; }
  #ytm-tabs-container [class*="TabContentsScroll"] { flex:1 !important; min-height:0 !important; overflow-y:auto !important; padding-left:0 !important; padding-right:0 !important; }
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
  const { t, language } = useI18n();
  const coverAccent = useArtworkAccent(track?.albumArt, panelRef);
  useEffect(() => panelRef.current ? registerNotificationPanel(panelRef.current) : undefined, []);
  const [activeTab, setActiveTab] = useState(() => libraryReturnPending() ? 'library' : 'player');
  const showTab = (tab:string) => {
    setActiveTab(tab);
    if (tab === 'player') requestAnimationFrame(() => window.dispatchEvent(new Event('ytm-return-player')));
  };
  useEffect(() => {
    const returnToPlayer = () => setActiveTab('player');
    const returnToLibrary = () => setActiveTab('library');
    window.addEventListener('ytm-return-player', returnToPlayer);
    window.addEventListener(LIBRARY_RETURN_EVENT, returnToLibrary);
    return () => { window.removeEventListener('ytm-return-player', returnToPlayer); window.removeEventListener(LIBRARY_RETURN_EVENT, returnToLibrary); };
  }, []);
  const tabItems = useMemo(() => {
    const library = { id:'library', title:t('tabs.library'), content:<LibraryView onSwitchToPlayer={() => showTab('player')} /> };
    const queue = { id:'queue', title:t('tabs.queue'), content:<QueueView /> };
    return [{ id:'player', title:t('tabs.player'), content:<PlayerView /> }, library, queue];
  }, [language]);
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
    background:`linear-gradient(180deg, rgba(${coverAccent}, .30) 0%, rgba(${coverAccent}, .14) 48%, transparent 100%)`,
  } as React.CSSProperties}>
    <Tabs activeTab={activeTab} onShowTab={showTab} tabs={tabItems} />
  </div>;
});
TabsContainer.displayName = 'TabsContainer';

// Cast and its queue are available without a YouTube Music account.
const Content = () => <PlayerProvider><TabsContainer /></PlayerProvider>;

const onSettingsClick = () => {
  Navigation.CloseSideMenus();
  Navigation.Navigate(SETTINGS_ROUTE);
};

export default definePlugin(() => {
  installThemeStyles();
  const stopNotifications = initNotifications();
  initAudio();
  routerHook.addRoute(SETTINGS_ROUTE, () => <SettingsPage />);
  routerHook.addRoute(SEARCH_ROUTE, () => <SearchPage />);
  routerHook.addRoute(PLAYLIST_ROUTE, () => <PlaylistPage />);
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
        <div>YouTube Music</div>
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
      stopNotifications();
      destroyAudio();
      clearLyricsCache();
      removeThemeStyles();
      routerHook.removeRoute(SETTINGS_ROUTE);
      routerHook.removeRoute(SEARCH_ROUTE);
      routerHook.removeRoute(PLAYLIST_ROUTE);
      routerHook.removeRoute(LYRICS_ROUTE);
    },
  };
});

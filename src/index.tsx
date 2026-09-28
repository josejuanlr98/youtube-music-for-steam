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
import { LyricsPanel, LYRICS_ROUTE } from './components/LyricsPage';
import { initAudio, destroyAudio } from './services/audioManager';
import { initNotifications, registerNotificationPanel } from './services/notifications';
import { usePlayer } from './context/PlayerContext';
import { useArtworkAccent } from './services/artworkPalette';

const SETTINGS_ROUTE = '/youtube-music-settings';
const SEARCH_ROUTE = '/youtube-music-search';
const THEME_STYLE_ID = 'ytm-theme-styles';
const TABS_CSS = `
  #ytm-tabs-container > * { height:100%; display:flex; flex-direction:column; min-height:0; }
  #ytm-tabs-container [class*="TabHeaderRowWrapper"] { flex-shrink:0 !important; min-height:32px !important; padding-left:0 !important; padding-right:0 !important; }
  #ytm-tabs-container [class*="TabContentsScroll"] { flex:1 !important; min-height:0 !important; overflow-y:auto !important; padding-left:0 !important; padding-right:0 !important; }
  #ytm-tabs-container [class*="Glyphs"] { transform:scale(.65) !important; transform-origin:center center !important; }
  /* Steam owns the Back button around our title view; scope the soft corner
     treatment to that title row so other Quick Access controls stay native. */
  div:has(> .ytm-plugin-title) > button { border-radius:8px !important; }
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
  const coverAccent = useArtworkAccent(track?.albumArt, panelRef);
  useEffect(() => panelRef.current ? registerNotificationPanel(panelRef.current) : undefined, []);
  useEffect(() => {
    const doc = panelRef.current?.ownerDocument;
    if (!doc) return;
    const root = doc.documentElement;
    const previous = root.style.getPropertyValue('--ytm-cover-deep');
    root.style.setProperty('--ytm-cover-deep', coverAccent);
    return () => {
      if (root.style.getPropertyValue('--ytm-cover-deep') !== coverAccent) return;
      if (previous) root.style.setProperty('--ytm-cover-deep', previous);
      else root.style.removeProperty('--ytm-cover-deep');
    };
  }, [coverAccent]);
  const [activeTab, setActiveTab] = useState('player');
  useEffect(() => {
    const returnToPlayer = () => setActiveTab('player');
    window.addEventListener('ytm-return-player', returnToPlayer);
    return () => window.removeEventListener('ytm-return-player', returnToPlayer);
  }, []);
  const tabItems = useMemo(() => [
    { id:'player', title:'Player', content:<PlayerView /> },
    { id:'queue', title:'Queue', content:<QueueView /> },
    { id:'library', title:'Library', content:<LibraryView onSwitchToPlayer={() => setActiveTab('player')} /> },
  ], []);
  return <div ref={panelRef} id="ytm-tabs-container" className="ytm-ui" style={{
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
    background:'linear-gradient(180deg, rgba(var(--ytm-cover-deep, 42, 82, 118), .16) 0%, rgba(var(--ytm-cover-deep, 42, 82, 118), .08) 48%, transparent 100%)',
  }}>
    <Tabs activeTab={activeTab} onShowTab={(tab: string) => setActiveTab(tab)} tabs={tabItems} />
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
          style={{ height: '28px', width: '40px', minWidth: 0, padding: '10px 12px', borderRadius: '8px' }}
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
      routerHook.removeRoute(LYRICS_ROUTE);
    },
  };
});

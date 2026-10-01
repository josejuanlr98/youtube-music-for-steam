import { ButtonItem, TextField, DialogButton, Focusable, SidebarNavigation } from '@decky/ui';
import { call } from '@decky/api';
import { useEffect, useState } from 'react';
import { apiGetNetwork, apiTrustNetwork, apiUntrustNetwork } from '../services/audioManager';
import { loadNotificationSettings, saveNotificationSettings, type NotificationSettings } from '../services/notifications';
import { ThemeScope } from './ThemeScope';
import { MdCookie, MdPublic } from 'react-icons/md';
import { SiFirefoxbrowser, SiZenbrowser, SiLibrewolf, SiFloorp } from 'react-icons/si';
import { languageOptions, useI18n, type Language, type TranslationLanguage } from '../services/i18n';
const SettingsToggle = ({label, description, checked, disabled, onChange}: {
  label:string; description?:string; checked:boolean; disabled?:boolean; onChange:(value:boolean) => void;
}) => <DialogButton className="ytm-settings-toggle" aria-label={`${label}: ${checked ? '✓' : '○'}`} aria-pressed={checked}
  disabled={disabled} onClick={() => onChange(!checked)}
  style={{width:'100%',minWidth:0,height:'auto',padding:'14px 16px',display:'flex',alignItems:'center',gap:20,textAlign:'left',marginBottom:8}}>
  <span style={{flex:1,minWidth:0}}><span style={{display:'block',fontSize:14,fontWeight:600}}>{label}</span>
    {description && <span style={{display:'block',fontSize:12,lineHeight:1.5,opacity:.72,marginTop:4}}>{description}</span>}
  </span>
  <span aria-hidden="true" className="ytm-switch" data-checked={checked}><span /></span>
</DialogButton>;
const NotificationsContent = () => {
  const { t } = useI18n();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const load = () => { setError(''); void loadNotificationSettings().then(setSettings).catch(() => setError('Could not load preferences. Please retry.')); };
  useEffect(load, []);
  const update = async (key: keyof NotificationSettings, value: boolean) => {
    if (!settings || saving) return;
    setSaving(true); setError('');
    try { setSettings(await saveNotificationSettings({ ...settings, [key]:value })); }
    catch { setError('Could not save preferences. Please try again.'); }
    finally { setSaving(false); }
  };
  return <div className="ytm-ui ytm-card ytm-settings" style={{ padding:20 }}><ThemeScope />
    <div className="ytm-eyebrow" style={{ marginBottom:12 }}>{t('settings.notifications')}</div>
    <div className="ytm-muted" style={{ fontSize:12, marginBottom:12 }}>{t('notifications.description')}</div>
    {settings ? <>
      <SettingsToggle label={t('notifications.device')} description={t('notifications.deviceHint')} checked={settings.connections} disabled={saving} onChange={value => void update('connections', value)} />
      <SettingsToggle label={t('notifications.connectionSound')} checked={settings.connectionSound} disabled={saving || !settings.connections} onChange={value => void update('connectionSound', value)} />
      <SettingsToggle label={t('notifications.nowPlaying')} description={t('notifications.nowPlayingHint')} checked={settings.tracks} disabled={saving} onChange={value => void update('tracks', value)} />
      <SettingsToggle label={t('notifications.songSound')} checked={settings.trackSound} disabled={saving || !settings.tracks} onChange={value => void update('trackSound', value)} />
    </> : <ButtonItem onClick={load}>{t('notifications.reload')}</ButtonItem>}
    {error && <div role="alert" className="ytm-error">{error}</div>}
  </div>;
};

const LanguageContent = () => {
  const { t, language, setLanguage, translateLyrics, setTranslateLyrics, translationLanguage, setTranslationLanguage } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [translationExpanded, setTranslationExpanded] = useState(false);
  return <div className="ytm-ui ytm-card ytm-settings" style={{ padding:20 }}><ThemeScope />
    <div className="ytm-eyebrow" style={{ marginBottom:8 }}>{t('language.title')}</div>
    <div className="ytm-muted" style={{ fontSize:12, lineHeight:1.5, marginBottom:14 }}>{t('language.description')}</div>
    <Focusable flow-children="vertical">
      <DialogButton className="ytm-button" aria-label={t('language.choose')} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
        style={{width:'100%',minWidth:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',marginBottom:7}}>
        <span>{language === 'system' ? t('language.system') : languageOptions.find(option => option.id === language)?.name}</span><span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </DialogButton>
      {expanded && <Focusable flow-children="vertical" style={{padding:'4px 0 10px 12px'}}>
        {languageOptions.map(option => <DialogButton key={option.id} className="ytm-button" aria-pressed={language === option.id}
          onClick={() => { setLanguage(option.id as Language); setExpanded(false); }} style={{width:'100%',minWidth:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',marginBottom:4}}>
          <span>{option.id === 'system' ? t('language.system') : option.name}</span><span aria-hidden="true">{language === option.id ? '✓' : ''}</span>
        </DialogButton>)}
      </Focusable>}
      <SettingsToggle label={t('language.translate')} description={t('language.translateHint')} checked={translateLyrics} onChange={setTranslateLyrics} />
      {translateLyrics && <>
        <div className="ytm-eyebrow" style={{margin:'16px 0 8px'}}>{t('language.translationLanguage')}</div>
        <DialogButton className="ytm-button" aria-label={t('language.translationLanguage')} aria-expanded={translationExpanded} onClick={() => setTranslationExpanded(value => !value)}
          style={{width:'100%',minWidth:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',marginBottom:7}}>
          <span>{translationLanguage === 'follow' ? t('language.follow') : languageOptions.find(option => option.id === translationLanguage)?.name}</span><span aria-hidden="true">{translationExpanded ? '▴' : '▾'}</span>
        </DialogButton>
        {translationExpanded && <Focusable flow-children="vertical" style={{padding:'4px 0 10px 12px'}}>
          {([{id:'follow' as TranslationLanguage,name:t('language.follow')}, ...languageOptions.filter(option => option.id !== 'system').map(option => ({id:option.id as TranslationLanguage,name:option.name}))]).map(option =>
            <DialogButton key={option.id} className="ytm-button" aria-pressed={translationLanguage === option.id} onClick={() => { setTranslationLanguage(option.id); setTranslationExpanded(false); }}
              style={{width:'100%',minWidth:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 12px',marginBottom:4}}><span>{option.name}</span><span aria-hidden="true">{translationLanguage === option.id ? '✓' : ''}</span></DialogButton>)}
        </Focusable>}
      </>}
    </Focusable>
  </div>;
};

type AuthState = { authenticated: boolean };

type NetworkState = { uuid: string | null; name: string | null; trusted: boolean };

const AuthContent = () => {
  const { t } = useI18n();
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [filePath, setFilePath] = useState('/home/deck/yt-music-headers.txt');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imported, setImported] = useState('');
  const [showFileImport, setShowFileImport] = useState(false);
  const importBrowser = async () => {
    if (saving) return;
    setSaving(true); setError(''); setImported('');
    try {
      const result = await call<[], {success?:boolean; error?:string; browser?:string}>('import_browser_session');
      if (!result.success) setError(result.error || 'Could not import browser session.');
      else { setImported(result.browser ? `Connected from ${result.browser}.` : 'Connected. Your session is saved on this Deck.'); await refresh(); }
    } catch { setError('Could not import browser session. Please retry.'); }
    finally { setSaving(false); }
  };

  const refresh = async () => {
    try {
      const next = await call<[], AuthState>('get_auth_state');
      setAuthState(next);
      window.dispatchEvent(new CustomEvent('ytm-auth-changed', { detail:next.authenticated }));
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => { void refresh(); }, []);

  const handleLoadFile = async () => {
    if (!filePath.trim()) {
      setError('Please enter a file path.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const result = await call<[string], { success?: boolean; error?: string }>(
        'load_headers_from_file', filePath.trim()
      );
      if (result.error) {
        setError(result.error);
      } else {
        await refresh();
      }
    } catch (e) {
      setError(String(e));
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    try {
      await call<[], { success: boolean }>('sign_out');
      await refresh();
    } catch (e) {
      setError(`Sign out failed: ${String(e)}`);
    }
  };

  if (!authState) {
    return <div style={{ padding: '16px', color: 'var(--gpSystemLighterGrey)' }}>Loading...</div>;
  }

  return (
    <div className="ytm-ui ytm-card ytm-settings" style={{ padding:20 }}><ThemeScope />
      <div className="ytm-eyebrow" style={{ marginBottom:16 }}>{t('settings.accountTitle')}</div>
      <div style={{padding:16,marginBottom:16,borderRadius:8,background:'#29323d'}}>
        <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>{t('settings.importTitle')}</div>
        <div className="ytm-muted" style={{fontSize:12,lineHeight:1.6,marginBottom:10}}>
          {t('settings.importHint')}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:6,marginBottom:12,fontSize:11}} aria-label={t('settings.supported')}>
          {[
            {name:'Firefox',icon:<SiFirefoxbrowser color="#ed7b30" />},
            {name:'Zen',icon:<SiZenbrowser color="#a5b8e7" />},
            {name:'LibreWolf',icon:<SiLibrewolf color="#8bb7df" />},
            {name:'Waterfox',icon:<MdPublic color="#75b9ca" />},
            {name:'Floorp',icon:<SiFloorp color="#dba36d" />},
          ].map(browser => <span key={browser.name} style={{display:'flex',alignItems:'center',gap:6,minWidth:0,padding:'5px 7px',borderRadius:6,background:'rgba(255,255,255,.055)',whiteSpace:'nowrap'}}>{browser.icon}<span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{browser.name}</span></span>)}
        </div>
        <div className="ytm-muted" style={{fontSize:11,lineHeight:1.45,marginBottom:12}}>{t('settings.manualAvailable')}</div>
        <DialogButton className="ytm-button" disabled={saving} onClick={() => void importBrowser()}
          style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,minWidth:0,width:'100%'}}>
          <MdCookie size={22} style={{color:'#d9a66c'}} />{saving ? t('settings.importing') : t('settings.import')}
        </DialogButton>
        {imported && <div role="status" style={{fontSize:12,color:'#b9dbc3',marginTop:10}}>{imported}</div>}
      </div>
      {error && <div style={{ padding: '8px 0', color: '#ff6b6b', fontSize: '12px' }}>{error}</div>}
      {authState.authenticated ? (
        <Focusable flow-children="horizontal" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0'
        }}>
          <span style={{ color: '#4caf50', fontSize: '14px' }}>{t('settings.authenticated')}</span>
          <DialogButton
            disabled={saving}
            style={{ width: 'auto', minWidth: '100px', padding: '8px 16px', fontSize: '13px' }}
            onClick={() => void handleSignOut()}
          >
            {t('settings.signOut')}
          </DialogButton>
        </Focusable>
      ) : (
        <>
          <div role="status" style={{ fontSize:13, lineHeight:1.5, marginBottom:16 }}>
            {t('settings.castOnlyHint')}
          </div>
        </>
      )}
      <DialogButton className="ytm-button" disabled={saving} onClick={() => setShowFileImport(value => !value)}
            style={{width:'100%',minWidth:0,fontSize:12,marginBottom:12}}>
        {showFileImport ? t('settings.hideManual') : t('settings.showManual')}
      </DialogButton>
      {showFileImport && <><div style={{
            fontSize: '13px', color: 'var(--gpSystemLighterGrey)', lineHeight: '1.6', marginBottom: '16px'
          }}>
            <div style={{ marginBottom: '8px' }}>{t('settings.manual1')}</div>
            <div style={{ marginBottom: '8px' }}>{t('settings.manual2')}</div>
            <div style={{ marginBottom: '8px' }}>{t('settings.manual3')}</div>
            <div style={{ margin:'12px 0 5px',color:'white',fontWeight:600 }}>Chrome, Chromium, Brave, Edge, Opera or Vivaldi</div>
            <div style={{ marginBottom: '8px' }}>{t('settings.manual4')}</div>
            <div style={{ margin:'12px 0 5px',color:'white',fontWeight:600 }}>Firefox and Firefox-based browsers</div>
            <div style={{ marginBottom: '8px' }}>{t('settings.manual4')}</div>
            <div style={{ marginBottom: '8px' }}>{t('settings.manual5')}</div>
            <div style={{ marginBottom: '8px' }}>{t('settings.manual6')}</div>
            <div>{t('settings.manual7')}</div>
          </div>
          <TextField value={filePath} onChange={(e) => setFilePath(e.target.value)} />
          <div style={{ marginTop: '8px' }}>
            <ButtonItem disabled={saving} onClick={() => void handleLoadFile()}>
              {saving ? t('common.loading') : t('settings.loadConnect')}
            </ButtonItem>
          </div></>}
    </div>
  );
};

const CastContent = () => {
  const { t } = useI18n();
  const [deviceName, setDeviceName] = useState('SteamDeck');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [network, setNetwork] = useState<NetworkState | null>(null);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    try {
      const value = await apiGetNetwork();
      setNetwork(value);
    } catch (e) {
      setMessage(String(e));
    }
    try {
      const value = await call<[], { name: string }>('get_cast_device_name');
      setDeviceName(value.name);
      setDeviceNameInput(value.name);
    } catch (e) {
      setMessage(String(e));
    }
  };

  useEffect(() => { void refresh(); }, []);

  const saveDeviceName = async () => {
    const value = deviceNameInput.trim();
    if (!value) return;
    setSavingName(true);
    setMessage('');
    try {
      const result = await call<[string], { success?: boolean; name?: string; error?: string }>(
        'set_cast_device_name', value
      );
      if (result.success) {
        setDeviceName(result.name ?? value);
        setDeviceNameInput(result.name ?? value);
        setMessage('Device name updated.');
      } else {
        setMessage(result.error ?? 'Could not update device name.');
      }
    } catch (e) {
      setMessage(String(e));
    }
    setSavingName(false);
  };

  const toggleTrust = async () => {
    setMessage('');
    try {
      const result = network?.trusted ? await apiUntrustNetwork() : await apiTrustNetwork();
      if (result?.ok) await refresh();
      else setMessage('Could not update network trust.');
    } catch (e) {
      setMessage(String(e));
    }
  };

  return (
    <div className="ytm-ui ytm-card ytm-settings" style={{ padding:20 }}><ThemeScope />
      <div className="ytm-eyebrow" style={{ marginBottom:8 }}>{t('settings.castTitle')}</div>
      <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', color: 'var(--gpSystemLighterGrey)', marginBottom: '6px' }}>{t('settings.deviceName')}</div>
        <TextField value={deviceNameInput} onChange={(e) => setDeviceNameInput(e.target.value)} />
        <ButtonItem disabled={savingName} onClick={() => void saveDeviceName()}>
          {savingName ? t('common.loading') : t('settings.saveDeviceName')}
        </ButtonItem>
        <div style={{ fontSize: '11px', color: 'var(--gpSystemLighterGrey)' }}>{t('settings.advertised',{name:deviceName})}</div>
      </div>
      <div style={{ fontSize: '13px', color: 'var(--gpSystemLighterGrey)', lineHeight: '1.5', marginBottom: '16px' }}>
        {t('settings.castHint')}
      </div>
      <div style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: '12px', color: 'var(--gpSystemLighterGrey)' }}>{t('settings.network')}</div>
        <div style={{ marginTop: '4px', fontSize: '14px' }}>{network?.name ?? t('settings.notDetected')}</div>
      </div>
      <ButtonItem onClick={() => void toggleTrust()}>
        {network?.trusted ? t('settings.untrust') : t('settings.trust')}
      </ButtonItem>
      {network?.trusted && <div style={{ color: '#4caf50', fontSize: '12px', padding: '8px 0' }}>{t('settings.castEnabled')}</div>}
      <div style={{fontSize:12,lineHeight:1.5,color:'var(--gpSystemLighterGrey)',margin:'14px 0 5px'}}>
        {t('settings.restartHint')}
      </div>
      <ButtonItem onClick={async () => {
        setMessage('Restarting Cast receiver…');
        try {
          const result = await call<[], {success?:boolean; error?:string}>('hard_reset');
          setMessage(result.success ? 'Cast receiver restarted.' : (result.error || 'Could not restart Cast receiver.'));
        } catch { setMessage('Could not restart Cast receiver.'); }
      }}>{t('settings.restart')}</ButtonItem>
      {message && <div role="status" style={{ color: '#c5d5e8', fontSize: '12px', padding: '8px 0' }}>{message}</div>}
    </div>
  );
};

export const SettingsPage = () => {
  const { t } = useI18n();
  return <SidebarNavigation
    title="YouTube Music"
    showTitle
    pages={[
      { title: t('settings.account'), content: <AuthContent />, route: '/youtube-music-settings/auth', visible: true },
      { title: t('settings.cast'), content: <CastContent />, route: '/youtube-music-settings/cast', visible: true },
      { title: t('settings.notifications'), content: <NotificationsContent />, route: '/youtube-music-settings/notifications', visible: true },
      { title: t('settings.language'), content: <LanguageContent />, route: '/youtube-music-settings/language', visible: true },
    ]}
  />;
};

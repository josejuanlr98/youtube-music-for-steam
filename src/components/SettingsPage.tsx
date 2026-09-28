import { ButtonItem, TextField, DialogButton, Focusable, SidebarNavigation } from '@decky/ui';
import { call } from '@decky/api';
import { useEffect, useState } from 'react';
import { apiGetNetwork, apiTrustNetwork, apiUntrustNetwork, disconnectCast } from '../services/audioManager';
import { loadNotificationSettings, saveNotificationSettings, type NotificationSettings } from '../services/notifications';
import { ThemeScope } from './ThemeScope';
import { SiFirefoxbrowser } from 'react-icons/si';
const SettingsToggle = ({label, description, checked, disabled, onChange}: {
  label:string; description?:string; checked:boolean; disabled?:boolean; onChange:(value:boolean) => void;
}) => <DialogButton className="ytm-settings-toggle" aria-label={`${label}: ${checked ? 'On' : 'Off'}`} aria-pressed={checked}
  disabled={disabled} onClick={() => onChange(!checked)}
  style={{width:'100%',minWidth:0,height:'auto',padding:'14px 16px',display:'flex',alignItems:'center',gap:20,textAlign:'left',marginBottom:8}}>
  <span style={{flex:1,minWidth:0}}><span style={{display:'block',fontSize:14,fontWeight:600}}>{label}</span>
    {description && <span style={{display:'block',fontSize:12,lineHeight:1.5,opacity:.72,marginTop:4}}>{description}</span>}
  </span>
  <span aria-hidden="true" className="ytm-switch" data-checked={checked}><span /></span>
</DialogButton>;
const NotificationsContent = () => {
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
    <div className="ytm-eyebrow" style={{ marginBottom:12 }}>Notifications</div>
    <div className="ytm-muted" style={{ fontSize:12, marginBottom:12 }}>Steam notifications while you listen or play. Sound is off by default.</div>
    {settings ? <>
      <SettingsToggle label="Device connected" description="Show the name of the device connecting to Cast." checked={settings.connections} disabled={saving} onChange={value => void update('connections', value)} />
      <SettingsToggle label="Connection sound" checked={settings.connectionSound} disabled={saving || !settings.connections} onChange={value => void update('connectionSound', value)} />
      <SettingsToggle label="Now playing" description="Show album cover, song title and artist when a song starts." checked={settings.tracks} disabled={saving} onChange={value => void update('tracks', value)} />
      <SettingsToggle label="Song change sound" checked={settings.trackSound} disabled={saving || !settings.tracks} onChange={value => void update('trackSound', value)} />
    </> : <ButtonItem onClick={load}>Reload preferences</ButtonItem>}
    {error && <div role="alert" className="ytm-error">{error}</div>}
  </div>;
};

type AuthState = { authenticated: boolean };

type NetworkState = { uuid: string | null; name: string | null; trusted: boolean };

const AuthContent = () => {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [filePath, setFilePath] = useState('/home/deck/yt-music-headers.txt');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imported, setImported] = useState(false);
  const [showFileImport, setShowFileImport] = useState(false);
  const importFirefox = async () => {
    if (saving) return;
    setSaving(true); setError(''); setImported(false);
    try {
      const result = await call<[], {success?:boolean; error?:string}>('import_firefox_session');
      if (!result.success) setError(result.error || 'Could not import Firefox.');
      else { setImported(true); await refresh(); }
    } catch { setError('Could not import Firefox. Please retry.'); }
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
      <div className="ytm-eyebrow" style={{ marginBottom:16 }}>Your account</div>
      <div style={{padding:16,marginBottom:16,borderRadius:8,background:'#29323d'}}>
        <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>Connect with Firefox</div>
        <div className="ytm-muted" style={{fontSize:12,lineHeight:1.6,marginBottom:12}}>
          In Desktop Mode on this Deck, sign in to music.youtube.com in a normal Firefox window, then close Firefox.
          Return here to import your primary account. Your saved session is replaced only after validation.
        </div>
        <DialogButton className="ytm-button" disabled={saving} onClick={() => void importFirefox()}
          style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,minWidth:0,width:'100%'}}>
          <SiFirefoxbrowser size={22} style={{color:'#ff9752'}} />{saving ? 'Connecting…' : 'Import from Firefox'}
        </DialogButton>
        {imported && <div role="status" style={{fontSize:12,color:'#b9dbc3',marginTop:10}}>Connected. Your session is saved on this Deck.</div>}
      </div>
      {error && <div style={{ padding: '8px 0', color: '#ff6b6b', fontSize: '12px' }}>{error}</div>}
      {authState.authenticated ? (
        <Focusable flow-children="horizontal" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0'
        }}>
          <span style={{ color: '#4caf50', fontSize: '14px' }}>Authenticated ✓</span>
          <DialogButton
            disabled={saving}
            style={{ width: 'auto', minWidth: '100px', padding: '8px 16px', fontSize: '13px' }}
            onClick={() => void handleSignOut()}
          >
            Sign Out
          </DialogButton>
        </Focusable>
      ) : (
        <>
          <div role="status" style={{ fontSize:13, lineHeight:1.5, marginBottom:16 }}>
            Cast only is available without signing in. Add your account below to unlock your library, search, likes and lyrics.
          </div>
          <DialogButton className="ytm-button" disabled={saving} onClick={() => setShowFileImport(value => !value)}
            style={{width:'100%',minWidth:0,fontSize:12,marginBottom:12}}>
            {showFileImport ? 'Hide file import' : 'Advanced: import a headers file'}
          </DialogButton>
          {showFileImport && <><div style={{
            fontSize: '13px', color: 'var(--gpSystemLighterGrey)', lineHeight: '1.6', marginBottom: '16px'
          }}>
            <div style={{ marginBottom: '8px' }}>1. On your PC, open <span style={{ color: 'white' }}>music.youtube.com</span></div>
            <div style={{ marginBottom: '8px' }}>2. Log in to your YouTube Music account</div>
            <div style={{ marginBottom: '8px' }}>3. Open Developer Tools (F12) → Network tab</div>
            <div style={{ marginBottom: '8px' }}>4. Click around in YouTube Music (for example, Library)</div>
            <div style={{ marginBottom: '8px' }}>5. Find a POST request to <span style={{ color: 'white' }}>/browse</span> with status 200</div>
            <div style={{ marginBottom: '8px' }}>6. Save the request headers as yt-music-headers.txt</div>
            <div style={{ marginBottom: '8px' }}>7. Firefox: right-click → Copy → Copy Request Headers</div>
            <div style={{ marginBottom: '8px' }}>8. Transfer yt-music-headers.txt to /home/deck/</div>
            <div>9. Enter the file path below and click Load &amp; Connect</div>
          </div>
          <TextField value={filePath} onChange={(e) => setFilePath(e.target.value)} />
          <div style={{ marginTop: '8px' }}>
            <ButtonItem disabled={saving} onClick={() => void handleLoadFile()}>
              {saving ? 'Loading...' : 'Load & Connect'}
            </ButtonItem>
          </div></>}
        </>
      )}
    </div>
  );
};

const CastContent = () => {
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

  const stopCast = async () => {
    try {
      await disconnectCast();
      setMessage('Cast session stopped and unlinked.');
    } catch (e) {
      setMessage(String(e));
    }
  };

  return (
    <div className="ytm-ui ytm-card ytm-settings" style={{ padding:20 }}><ThemeScope />
      <div className="ytm-eyebrow" style={{ marginBottom:8 }}>Listen from your phone</div>
      <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', color: 'var(--gpSystemLighterGrey)', marginBottom: '6px' }}>Cast device name</div>
        <TextField value={deviceNameInput} onChange={(e) => setDeviceNameInput(e.target.value)} />
        <ButtonItem disabled={savingName} onClick={() => void saveDeviceName()}>
          {savingName ? 'Saving...' : 'Save device name'}
        </ButtonItem>
        <div style={{ fontSize: '11px', color: 'var(--gpSystemLighterGrey)' }}>Currently advertised as: {deviceName}</div>
      </div>
      <div style={{ fontSize: '13px', color: 'var(--gpSystemLighterGrey)', lineHeight: '1.5', marginBottom: '16px' }}>
        Use YouTube or YouTube Music on your phone and choose your Steam Deck as a Cast device.
        Unlink ends the current session. Your Deck stays available on trusted networks.
      </div>
      <div style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: '12px', color: 'var(--gpSystemLighterGrey)' }}>Current network</div>
        <div style={{ marginTop: '4px', fontSize: '14px' }}>{network?.name ?? 'Not detected'}</div>
      </div>
      <ButtonItem onClick={() => void toggleTrust()}>
        {network?.trusted ? 'Disable Cast on this network' : 'Trust this network'}
      </ButtonItem>
      {network?.trusted && <div style={{ color: '#4caf50', fontSize: '12px', padding: '8px 0' }}>Cast receiver is enabled on this network ✓</div>}
      <ButtonItem onClick={() => void stopCast()}>Stop Cast / Unlink</ButtonItem>
      <ButtonItem onClick={async () => {
        setMessage('Restarting Cast receiver…');
        try {
          const result = await call<[], {success?:boolean; error?:string}>('hard_reset');
          setMessage(result.success ? 'Cast receiver restarted.' : (result.error || 'Could not restart Cast receiver.'));
        } catch { setMessage('Could not restart Cast receiver.'); }
      }}>Restart Cast receiver</ButtonItem>
      {message && <div role="status" style={{ color: '#c5d5e8', fontSize: '12px', padding: '8px 0' }}>{message}</div>}
    </div>
  );
};

export const SettingsPage = () => (
  <SidebarNavigation
    title="YouTube Music"
    showTitle
    pages={[
      { title: 'Account', content: <AuthContent />, route: '/youtube-music-settings/auth', visible: true },
      { title: 'Cast Receiver', content: <CastContent />, route: '/youtube-music-settings/cast', visible: true },
      { title: 'Notifications', content: <NotificationsContent />, route: '/youtube-music-settings/notifications', visible: true },
    ]}
  />
);

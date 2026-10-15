// Steam's October 2026 screensaver is controlled by these native client
// settings, not X11/DPMS. GetClientSetting supplies the protobuf-aware setter.
const KEYS = ['system_idle_screensaver_battery_sec', 'system_idle_screensaver_ac_sec'] as const;
const JOURNAL = 'ytm-fullscreen-power-v1';
type Key = typeof KEYS[number];
type Snapshot = Partial<Record<Key, number>>;
interface SettingsStore { GetClientSetting(key: string): [unknown, (value: number) => unknown]; }
interface Environment {
  store(): SettingsStore | undefined;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  warn(message: string, error: unknown): void;
}

/** Serializes enter/exit/reload, including an exit before native writes finish. */
export function createFullscreenPower(environment: Environment) {
  let leases = 0;
  let generation = 0;
  let active = false;
  let snapshot: Snapshot | undefined;
  let queue = Promise.resolve();
  const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const remember = () => {
    if (snapshot && Object.keys(snapshot).length) environment.storage?.setItem(JOURNAL, JSON.stringify(snapshot));
    else environment.storage?.removeItem(JOURNAL);
  };
  const restore = async () => {
    active = false;
    if (!snapshot) {
      const saved = environment.storage?.getItem(JOURNAL);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      snapshot = {};
      for (const key of KEYS) if (valid(parsed?.[key])) snapshot[key] = parsed[key];
    }
    const store = environment.store();
    if (!store) return; // Keep recovery state until the native store is available.
    let failure: unknown;
    for (const key of KEYS) {
      if (snapshot[key] === undefined) continue;
      try {
        const [current, set] = store.GetClientSetting(key);
        // Respect a setting the user changed themselves while fullscreen was open.
        if (current === 0 && await set(snapshot[key]!) === false) throw new Error(`Steam rejected restoring ${key}`);
        if (!valid(current)) throw new Error(`Steam has not loaded ${key}`);
        delete snapshot[key];
        remember();
      } catch (error) { failure = error; }
    }
    if (failure) throw failure;
    snapshot = undefined;
    remember();
  };
  const enter = async () => {
    if (!leases || active) return;
    await restore();
    if (!leases) return;
    const store = environment.store();
    if (!store) throw new Error('Steam screensaver settings are unavailable');
    const values = KEYS.map(key => store.GetClientSetting(key)[0]);
    if (!values.every(valid)) throw new Error('Steam screensaver settings have not loaded');
    snapshot = {};
    KEYS.forEach((key, index) => { if (values[index] !== 0) snapshot![key] = values[index] as number; });
    // Persist just the two owned values before altering them, so a Steam/plugin
    // restart can recover them. No files, account information or backup folders.
    remember();
    try {
      for (const key of KEYS) {
        if (!leases) break;
        if (snapshot[key] !== undefined && await store.GetClientSetting(key)[1](0) === false)
          throw new Error(`Steam rejected disabling ${key}`);
      }
    } catch (error) { await restore(); throw error; }
    active = true;
    if (!leases) await restore();
  };
  const run = (operation: () => Promise<void>) => {
    queue = queue.then(operation).catch(error => environment.warn('Fullscreen screensaver protection', error));
    return queue;
  };
  return {
    recover: () => run(async () => { if (!leases) await restore(); }),
    acquire() {
      if (++leases === 1) void run(enter);
      const acquiredGeneration = generation;
      let released = false;
      return () => {
        if (released || acquiredGeneration !== generation) return;
        released = true;
        if (--leases === 0) void run(async () => { if (!leases) await restore(); });
      };
    },
    dispose() { generation++; leases = 0; return run(restore); },
    settled: () => queue,
  };
}

let controller: ReturnType<typeof createFullscreenPower> | undefined;
function power() {
  if (!controller) {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Native changes are skipped if recovery cannot be stored. */ }
    controller = createFullscreenPower({
      store: () => storage ? (window as unknown as { settingsStore?: SettingsStore }).settingsStore : undefined,
      storage,
      warn: (message, error) => console.warn(`[YouTube Music] ${message}`, error),
    });
  }
  return controller;
}
export const acquireFullscreenPower = () => power().acquire();
export const recoverFullscreenPower = () => power().recover();
export const releaseFullscreenPower = () => power().dispose();

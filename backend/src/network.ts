import { spawn } from 'node:child_process';
import os from 'node:os';

export interface ActiveNetwork {
  uuid: string;
  name: string;
  type: string;
}

const NMCLI_TIMEOUT_MS = 3000;
let lastInterfaceSig: string | null = null;
let cachedActiveNetwork: ActiveNetwork | null = null;
let hasCachedResult = false;

function getInterfaceSignature(): string {
  try {
    const interfaces = os.networkInterfaces();
    const parts: string[] = [];
    for (const name of Object.keys(interfaces).sort()) {
      for (const addr of interfaces[name] ?? []) {
        if (!addr.internal) {
          parts.push(`${name}:${addr.family}:${addr.address}:${addr.mac}`);
        }
      }
    }
    return parts.join('|');
  } catch {
    return '';
  }
}

export function resetNetworkCache(): void {
  lastInterfaceSig = null;
  cachedActiveNetwork = null;
  hasCachedResult = false;
}

/**
 * Run `nmcli -t -f UUID,NAME,TYPE connection show --active` and parse the
 * first active wifi/ethernet connection. Returns null if no usable network
 * is active or if nmcli isn't available.
 *
 * Terse output uses `:` as a field separator. Field values containing a
 * literal `:` are escaped as `\:`. UUIDs never contain colons, but names
 * can — we split with that escape rule in mind.
 */
export function getCurrentNetwork(forceRefresh = false): Promise<ActiveNetwork | null> {
  const currentSig = getInterfaceSignature();
  if (!forceRefresh && hasCachedResult && currentSig && currentSig === lastInterfaceSig && cachedActiveNetwork !== null) {
    return Promise.resolve(cachedActiveNetwork);
  }
  if (!forceRefresh && hasCachedResult && currentSig === '' && lastInterfaceSig === '') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (v: ActiveNetwork | null, cacheable = true) => {
      if (resolved) return;
      resolved = true;
      if (cacheable) {
        lastInterfaceSig = currentSig;
        cachedActiveNetwork = v;
        hasCachedResult = true;
      } else {
        hasCachedResult = false;
      }
      resolve(v);
    };

    let proc;
    try {
      proc = spawn('nmcli', ['-t', '-f', 'UUID,NAME,TYPE', 'connection', 'show', '--active'], {
        // Strip Decky's LD_LIBRARY_PATH for the same reason we strip it for
        // yt-dlp — it can break linking against system libs.
        env: { ...process.env, LD_LIBRARY_PATH: '', PYTHONPATH: '' },
      });
    } catch {
      finish(null, false);
      return;
    }

    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      finish(null, false);
    }, NMCLI_TIMEOUT_MS);

    let stdout = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.on('error', () => { clearTimeout(timer); finish(null, false); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.warn(`[YTCast] nmcli exited code ${code}; assuming no active network`);
        finish(null, false);
        return;
      }

      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = splitNmcliFields(trimmed);
        if (parts.length < 3) continue;
        const [uuid, name, type] = parts;
        if (!uuid || !name) continue;
        // Wifi or wired ethernet — skip vpn/loopback/bridge/etc.
        if (type === '802-11-wireless' || type === '802-3-ethernet') {
          finish({ uuid, name, type });
          return;
        }
      }
      finish(null);
    });
  });
}

/** Split nmcli terse output respecting `\:` escapes for literal colons in field values. */
function splitNmcliFields(line: string): string[] {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === ':') {
      current += ':';
      i++;
    } else if (ch === ':') {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

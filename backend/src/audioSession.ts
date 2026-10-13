import { readFileSync, statSync, mkdtempSync, chmodSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Copy only the imported YouTube cookie header into a private, scoped jar. */
export function audioSession(path = process.env.YTCAST_BROWSER_AUTH_FILE): { args: string[]; cleanup: () => void } {
  let directory: string | undefined, file: string | undefined;
  const cleanup = () => {
    if (file) { try { unlinkSync(file); } catch {} file = undefined; }
    if (directory) { try { rmdirSync(directory); } catch {} directory = undefined; }
  };
  try {
    if (!path || statSync(path).size > 1024 * 1024) return {args:[], cleanup};
    const headers: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const cookie = headers && typeof headers === 'object'
      ? Object.entries(headers).find(([key]) => key.toLowerCase() === 'cookie')?.[1] : undefined;
    const rows: string[] = [];
    if (typeof cookie === 'string' && !/[\r\n\t]/.test(cookie)) {
      for (const part of cookie.split(';')) {
        const item = part.trim(), split = item.indexOf('=');
        if (split < 1) continue;
        const name = item.slice(0,split), value = item.slice(split+1);
        if (/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) && value && /^[\x20-\x7e]+$/.test(value))
          rows.push(`.youtube.com\tTRUE\t/\tTRUE\t0\t${name}\t${value}`);
      }
    }
    if (!rows.length) return {args:[], cleanup};
    directory = mkdtempSync(join(tmpdir(), 'ytm-audio-session-'));
    chmodSync(directory, 0o700);
    file = join(directory, 'cookies.txt');
    writeFileSync(file, '# Netscape HTTP Cookie File\n' + rows.join('\n') + '\n', {mode:0o600});
    return {args:['--cookies',file], cleanup};
  } catch {
    cleanup();
    return {args:[], cleanup};
  }
}

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioSession } from '../src/audioSession.js';

describe('YouTube session for audio extraction', () => {
  it('uses a scoped private jar without putting cookies in command arguments and cleans up', () => {
    const directory = mkdtempSync(join(tmpdir(), 'audio-session-test-'));
    try {
      const auth = join(directory, 'browser.json');
      writeFileSync(auth, JSON.stringify({cookie:'SID=synthetic; __Secure-3PAPISID=test-key'}));
      const session = audioSession(auth);
      expect(session.args[0]).toBe('--cookies');
      expect(session.args.join(' ')).not.toContain('synthetic');
      const jar = session.args[1];
      expect(readFileSync(jar, 'utf8')).toContain('.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsynthetic');
      expect(readFileSync(jar, 'utf8')).not.toContain('googlevideo');
      session.cleanup(); session.cleanup();
      expect(existsSync(jar)).toBe(false);
      expect(JSON.parse(readFileSync(auth, 'utf8')).cookie).toBe('SID=synthetic; __Secure-3PAPISID=test-key');
    } finally { rmSync(directory, {recursive:true, force:true}); }
  });
  it('keeps guests anonymous and rejects cookie header injections', () => {
    expect(audioSession(join(tmpdir(), 'nonexistent-ytm-session.json')).args).toEqual([]);
    const directory = mkdtempSync(join(tmpdir(), 'audio-session-test-'));
    try {
      const auth = join(directory, 'browser.json');
      writeFileSync(auth, JSON.stringify({cookie:'SID=ok\n.example.com\tTRUE\t/\tTRUE\t0\tbad\tvalue'}));
      expect(audioSession(auth).args).toEqual([]);
    } finally { rmSync(directory, {recursive:true, force:true}); }
  });
});

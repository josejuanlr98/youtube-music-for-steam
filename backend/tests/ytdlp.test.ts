import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAudioInfo, classifyAudioFailure } from '../src/ytdlp.js';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Mock child_process.spawn
vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn(),
  };
});

import { spawn } from 'node:child_process';
const mockSpawn = vi.mocked(spawn);

function createMockProcess(stdout: string, exitCode: number = 0): any {
  const proc = new EventEmitter();
  const stdoutStream = Readable.from([stdout]);
  const stderrStream = Readable.from([]);
  (proc as any).stdout = stdoutStream;
  (proc as any).stderr = stderrStream;
  setTimeout(() => proc.emit('close', exitCode), 10);
  return proc;
}

const sampleYtdlpOutput = JSON.stringify({
  id: 'dQw4w9WgXcQ',
  title: 'Rick Astley - Never Gonna Give You Up',
  uploader: 'Rick Astley',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
  duration: 212,
  url: 'https://rr4---sn-example.googlevideo.com/videoplayback?expire=...',
  ext: 'm4a',
});

describe('extractAudioInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('passes the imported session through a private file and removes it after extraction', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ytm-extraction-test-'));
    try {
      const auth = join(directory, 'browser.json');
      writeFileSync(auth, JSON.stringify({cookie:'SID=synthetic'}));
      vi.stubEnv('YTCAST_BROWSER_AUTH_FILE', auth);
      mockSpawn.mockReturnValue(createMockProcess(sampleYtdlpOutput));
      const pending = extractAudioInfo('song', '/path/to/yt-dlp');
      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args[0]).toBe('--cookies');
      expect(existsSync(args[1])).toBe(true);
      expect(args.join(' ')).not.toContain('synthetic');
      await pending;
      expect(existsSync(args[1])).toBe(false);
    } finally { vi.unstubAllEnvs(); rmSync(directory, {recursive:true, force:true}); }
  });

  it('extracts audio info from yt-dlp JSON output', async () => {
    mockSpawn.mockReturnValue(createMockProcess(sampleYtdlpOutput));

    const result = await extractAudioInfo('dQw4w9WgXcQ', '/path/to/yt-dlp');

    expect(result).toEqual({
      videoId: 'dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
      artist: 'Rick Astley',
      albumArt: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      duration: 212,
      url: 'https://rr4---sn-example.googlevideo.com/videoplayback?expire=...',
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      '/path/to/yt-dlp',
      ['--ignore-config', '--socket-timeout', '15', '--retries', '1', '--js-runtimes', `node:${process.execPath}`, '--remote-components', 'ejs:github', '-f', 'bestaudio[ext=m4a]/bestaudio', '-j', '--no-playlist', '--', 'dQw4w9WgXcQ'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
    );
  });

  it('rejects when yt-dlp exits with non-zero code', async () => {
    mockSpawn.mockReturnValue(createMockProcess('', 1));

    await expect(extractAudioInfo('bad-id', '/path/to/yt-dlp'))
      .rejects.toMatchObject({code:'AUDIO_LOOKUP_FAILED', unavailable:false});
  });

  it('rejects when JSON output is invalid', async () => {
    mockSpawn.mockReturnValue(createMockProcess('not json'));

    await expect(extractAudioInfo('test', '/path/to/yt-dlp'))
      .rejects.toThrow();
  });
  it('rejects missing audio URLs rather than reporting successful playback', async () => {
    mockSpawn.mockReturnValue(createMockProcess(JSON.stringify({id:'song', title:'Song'})));
    await expect(extractAudioInfo('song', '/path/to/yt-dlp')).rejects.toThrow('No playable audio URL');
  });
  it('terminates hung extraction after a bounded wait', async () => {
    vi.useFakeTimers();
    try {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter(); proc.kill = vi.fn();
      mockSpawn.mockReturnValue(proc);
      const result = expect(extractAudioInfo('song', '/path/to/yt-dlp')).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(25000);
      await result;
      expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    } finally { vi.useRealTimers(); }
  });

  it('distinguishes global engine/provider failures from an unavailable song', () => {
    expect(classifyAudioFailure('HTTP Error 429: Too Many Requests').code).toBe('YOUTUBE_BLOCKED');
    expect(classifyAudioFailure('Sign in to confirm you are not a bot').code).toBe('YOUTUBE_VERIFICATION');
    expect(classifyAudioFailure('[youtube] abc429xyz: Requested format is not available').code).toBe('AUDIO_LOOKUP_FAILED');
    for (const text of ['No supported JavaScript runtime could be found', 'HTTP Error 429: Too Many Requests', 'Sign in to confirm you are not a bot', 'Connection timed out', 'Requested format is not available']) {
      expect(classifyAudioFailure(text).unavailable).toBe(false);
    }
    for (const text of ['Private video', 'Video unavailable', 'This video is not available in your country', 'Copyright removal']) {
      expect(classifyAudioFailure(text)).toMatchObject({code:'VIDEO_UNAVAILABLE',unavailable:true});
    }
  });
});

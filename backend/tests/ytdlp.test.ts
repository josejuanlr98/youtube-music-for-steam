import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAudioInfo } from '../src/ytdlp.js';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

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
      .rejects.toThrow('yt-dlp exited with code 1');
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
      await vi.advanceTimersByTimeAsync(45000);
      await result;
      expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    } finally { vi.useRealTimers(); }
  });
});

import { spawn } from 'node:child_process';

export interface AudioInfo {
  videoId: string;
  title: string;
  artist: string;
  albumArt: string;
  duration: number;
  url: string;
}

export function extractAudioInfo(videoId: string, ytdlpPath: string): Promise<AudioInfo> {
  return new Promise((resolve, reject) => {
    // Strip LD_LIBRARY_PATH and PYTHONPATH to avoid conflicts with
    // Decky Loader's environment overriding PyInstaller's bundled libraries
    const env = { ...process.env, LD_LIBRARY_PATH: '', PYTHONPATH: '' };
    const proc = spawn(
      ytdlpPath,
      ['--ignore-config', '--socket-timeout', '15', '--retries', '1',
        '--js-runtimes', `node:${process.execPath}`, '--remote-components', 'ejs:github',
        '-f', 'bestaudio[ext=m4a]/bestaudio', '-j', '--no-playlist', '--', videoId],
      { stdio: ['ignore', 'pipe', 'pipe'], env }
    );

    const timeout = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('Audio lookup timed out. Please retry.')); }, 45000);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        if (typeof data.url !== 'string' || !/^https?:\/\//.test(data.url)) throw new Error('No playable audio URL');
        resolve({
          videoId: data.id ?? videoId,
          title: data.title ?? 'Unknown',
          artist: data.uploader ?? data.channel ?? 'Unknown',
          albumArt: data.thumbnail ?? '',
          duration: data.duration ?? 0,
          url: data.url ?? '',
        });
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp output: ${(err as Error).message}`));
      }
    });
  });
}

export function selfUpdate(ytdlpPath: string): Promise<void> {
  return new Promise((resolve) => {
    const env = { ...process.env, LD_LIBRARY_PATH: '', PYTHONPATH: '' };
    const proc = spawn(ytdlpPath, ['-U'], { stdio: 'ignore', env });
    proc.on('close', () => resolve());
    proc.on('error', () => resolve()); // Fail silently
  });
}

export function cleanArtist(raw?: string): string {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/\s*[-–—]\s*Topic\b/gi, "").replace(/\s*\(Topic\)/gi, "").trim() || raw.trim();
}

import { spawn } from 'node:child_process';
import { audioSession } from './audioSession.js';
import { audioPlaybackUrl } from './audioRelay.js';

export interface AudioInfo {
  videoId: string;
  title: string;
  artist: string;
  albumArt: string;
  duration: number;
  url: string;
}

export class AudioLookupError extends Error {
  constructor(message: string, public code = 'AUDIO_LOOKUP_FAILED', public unavailable = false) {
    super(message);
    this.name = 'AudioLookupError';
  }
}

export function classifyAudioFailure(stderr: string): AudioLookupError {
  const text = stderr.toLowerCase();
  if (text.includes('no supported javascript runtime') || text.includes('unsupported runtime'))
    return new AudioLookupError('The audio engine needs Node 22 or newer. Reinstall the current plugin ZIP.', 'RUNTIME_UNSUPPORTED');
  if (/\b(?:http(?: error)?|status(?: code)?)\s*:?\s*429\b|too many requests/.test(text))
    return new AudioLookupError('YouTube temporarily blocked audio requests. Wait a little and retry.', 'YOUTUBE_BLOCKED');
  if (/not a bot|confirm you['’]re not/.test(text))
    return new AudioLookupError('YouTube requires a browser verification before it will provide audio. Retrying more songs will not fix this.', 'YOUTUBE_VERIFICATION');
  if (text.includes('sign in') && /confirm|required|age/.test(text))
    return new AudioLookupError('YouTube requires a valid signed-in session for this audio.', 'YOUTUBE_AUTH_REQUIRED');
  if (/\bhttp(?: error)?\s*:?\s*403\b/.test(text))
    return new AudioLookupError('YouTube rejected this audio request (HTTP 403). The stream or playback verification may have expired.', 'YOUTUBE_FORBIDDEN');
  if (/timed out|timeout|unable to download|connection|name resolution|network is unreachable/.test(text))
    return new AudioLookupError('Could not connect to the audio provider. Check your connection and retry.', 'AUDIO_NETWORK');
  if (/private video|video unavailable|video is unavailable|removed|not available in your country|age-restricted|members-only|copyright/.test(text))
    return new AudioLookupError('This song is unavailable.', 'VIDEO_UNAVAILABLE', true);
  return new AudioLookupError('The audio provider could not load a compatible stream. Please retry.');
}

export function extractAudioInfo(videoId: string, ytdlpPath: string, useSession = false): Promise<AudioInfo> {
  return new Promise<AudioInfo>((resolve, reject) => {
    if (Number(process.versions.node.split('.')[0]) < 22) {
      reject(new AudioLookupError('The audio engine needs Node 22 or newer. Reinstall the current plugin ZIP.', 'RUNTIME_UNSUPPORTED'));
      return;
    }
    // Strip LD_LIBRARY_PATH and PYTHONPATH to avoid conflicts with
    // Decky Loader's environment overriding PyInstaller's bundled libraries
    const env = {
      ...process.env,
      LD_LIBRARY_PATH: '',
      PYTHONPATH: '',
      XDG_CACHE_HOME: process.env.YTCAST_CACHE_DIR || '/tmp/youtube-music-cast-receiver/cache',
    };
    // Public streams can be rejected when extracted with browser cookies.
    // Library authentication is independent; retry restricted audio with the session.
    const session = useSession ? audioSession() : { args: [] as string[], cleanup() {} };
    let proc: ReturnType<typeof spawn>;
    try { proc = spawn(
      ytdlpPath,
      [...session.args, '--ignore-config', '--socket-timeout', '15', '--retries', '1',
        '--js-runtimes', `node:${process.execPath}`, '--remote-components', 'ejs:github',
        '-f', 'bestaudio[ext=m4a]/bestaudio', '-j', '--no-playlist', '--', videoId],
      { stdio: ['ignore', 'pipe', 'pipe'], env }
    ); } catch {
      session.cleanup();
      reject(new AudioLookupError('Could not start the audio engine.', 'AUDIO_ENGINE_FAILED'));
      return;
    }

    const timeout = setTimeout(() => { proc.kill('SIGKILL'); session.cleanup(); reject(new AudioLookupError('Audio lookup timed out. Please retry.', 'AUDIO_TIMEOUT')); }, 25000);
    let stdout = '';
    let stderr = '';

    proc.stdout!.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', () => {
      clearTimeout(timeout);
      session.cleanup();
      reject(new AudioLookupError('Could not start the audio engine. Reinstall the current plugin ZIP.', 'AUDIO_ENGINE_FAILED'));
    });

    proc.on('close', (code) => {
      if (code !== 0 && /requested format is not available|signature extraction failed|nsig extraction failed|sabr|drm protected/i.test(stderr)) {
        try {
          const retryProc = spawn(
            ytdlpPath,
            [...session.args, '--ignore-config', '--socket-timeout', '15', '--retries', '1',
              '--js-runtimes', `node:${process.execPath}`, '--remote-components', 'ejs:github',
              '--extractor-args', 'youtube:player_client=tv,ios,mweb',
              '-f', 'bestaudio[ext=m4a]/bestaudio', '-j', '--no-playlist', '--', videoId],
            { stdio: ['ignore', 'pipe', 'pipe'], env }
          );
          let retryOut = '', retryErr = '';
          retryProc.stdout?.on('data', (c: Buffer) => { retryOut += c.toString(); });
          retryProc.stderr?.on('data', (c: Buffer) => { retryErr += c.toString(); });
          retryProc.on('error', () => { clearTimeout(timeout); session.cleanup(); reject(classifyAudioFailure(stderr)); });
          retryProc.on('close', (retryCode) => {
            clearTimeout(timeout);
            session.cleanup();
            if (retryCode !== 0) { reject(classifyAudioFailure(retryErr || stderr)); return; }
            try {
              const data = JSON.parse(retryOut);
              if (typeof data.url !== 'string' || !/^https?:\/\//.test(data.url)) throw new Error('No playable audio URL');
              resolve({
                videoId: data.id ?? videoId,
                title: data.title ?? 'Unknown',
                artist: cleanArtist((data.artist || data.creator || data.uploader || data.channel || 'Unknown') as string),
                albumArt: data.thumbnail ?? '',
                duration: data.duration ?? 0,
                url: audioPlaybackUrl(data.url),
              });
            } catch (err) {
              reject(new AudioLookupError(`Failed to parse yt-dlp output: ${(err as Error).message}`));
            }
          });
          return;
        } catch {
          // Fall through to normal error handling
        }
      }
      clearTimeout(timeout);
      session.cleanup();
      if (code !== 0) {
        reject(classifyAudioFailure(stderr));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        if (typeof data.url !== 'string' || !/^https?:\/\//.test(data.url)) throw new Error('No playable audio URL');
        resolve({
          videoId: data.id ?? videoId,
          title: data.title ?? 'Unknown',
          artist: cleanArtist((data.artist || data.creator || data.uploader || data.channel || 'Unknown') as string),
          albumArt: data.thumbnail ?? '',
          duration: data.duration ?? 0,
          url: audioPlaybackUrl(data.url),
        });
      } catch (err) {
        reject(new AudioLookupError(`Failed to parse yt-dlp output: ${(err as Error).message}`));
      }
    });
  }).catch((error: unknown) => {
    if (!useSession && process.env.YTCAST_BROWSER_AUTH_FILE && error instanceof AudioLookupError &&
        !['AUDIO_TIMEOUT', 'RUNTIME_UNSUPPORTED', 'AUDIO_ENGINE_FAILED', 'YOUTUBE_BLOCKED'].includes(error.code)) {
      return extractAudioInfo(videoId, ytdlpPath, true);
    }
    throw error;
  });
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CastPlayer } from './CastPlayer.js';
import type { Player as YtPlayer } from 'yt-cast-receiver';
import { allowedLocalOrigin } from './localOrigin.js';

class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RequestError(`Invalid ${name}`);
  return value;
}

interface NetworkSnapshot {
  uuid: string | null;
  name: string | null;
  trusted: boolean;
}

interface RouteContext {
  castPlayer: CastPlayer;
  libraryPlayer: YtPlayer;
  isConnected: () => boolean;
  senderName: () => string | null;
  disconnectCast: () => Promise<boolean>;
  network: {
    getCurrent(): NetworkSnapshot;
    trust(): Promise<boolean>;
    untrust(): Promise<boolean>;
  };
}

type RouteHandler = (body: any, ctx: RouteContext) => Promise<unknown>;

const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    '/api/health': async () => ({ ready: true }),

    '/api/network/current': async (_body, ctx) => ctx.network.getCurrent(),

    '/api/state': async (_body, ctx) => {
      const trackInfo = ctx.castPlayer.getCurrentTrackInfo();
      const volume = await ctx.libraryPlayer.getVolume();
      const position = await ctx.libraryPlayer.getPosition();
      const duration = await ctx.libraryPlayer.getDuration();

      return {
        track: trackInfo
          ? {
              videoId: trackInfo.videoId,
              title: trackInfo.title,
              artist: trackInfo.artist,
              albumArt: trackInfo.albumArt,
              duration: trackInfo.duration,
              url: trackInfo.url,
              playbackId: ctx.castPlayer.getPlaybackId(),
            }
          : null,
        isPlaying: ctx.castPlayer.isCurrentlyPlaying(),
        volume: volume.level,
        muted: volume.muted,
        position,
        duration,
        connected: ctx.isConnected(),
        senderName: ctx.senderName(),
      };
    },

    '/api/queue': async (_body, ctx) => {
      return ctx.castPlayer.getQueueWithMetadata();
    },
  },

  POST: {
    '/api/queue/metadata': async (body, ctx) => {
      void ctx.castPlayer.loadVisibleMetadata(body?.videoIds);
      return { ok:true };
    },
    '/api/play': async (_body, ctx) => {
      await ctx.libraryPlayer.resume();
      return { ok: true };
    },

    '/api/pause': async (_body, ctx) => {
      await ctx.libraryPlayer.pause();
      return { ok: true };
    },

    '/api/next': async (_body, ctx) => {
      await ctx.libraryPlayer.next();
      return { ok: true };
    },

    '/api/prev': async (_body, ctx) => {
      await ctx.libraryPlayer.previous();
      return { ok: true };
    },

    '/api/seek': async (body, ctx) => {
      const position = finiteNumber(body?.position, 'position');
      if (position < 0) throw new RequestError('Position must be non-negative');
      await ctx.libraryPlayer.seek(position);
      return { ok: true };
    },

    '/api/volume': async (body, ctx) => {
      const level = Math.max(0, Math.min(100, finiteNumber(body?.volume, 'volume')));
      await ctx.libraryPlayer.setVolume({ level, muted:false });
      return { ok: true };
    },

    '/api/queue/jump': async (body, ctx) => {
      const videoId = body?.videoId;
      if (typeof videoId !== 'string' || !/^[\w-]{1,64}$/.test(videoId)) throw new RequestError('Invalid videoId');
      if (body?.expectedIds) {
        const ids = ctx.castPlayer.getQueueWithMetadata().tracks.map(t => t.videoId);
        if (!Array.isArray(body.expectedIds) || JSON.stringify(body.expectedIds) !== JSON.stringify(ids) ||
            ids[body.index] !== videoId)
          return { ok:false, message:'Queue changed. Please try again.' };
      }
      const result = await ctx.castPlayer.playVideoById(videoId);
      return { ok: result };
    },

    '/api/queue/remove': async (_body, _ctx) => ({ ok: false, message: 'Queue is managed from your phone' }),

    '/api/queue/edit': async (body, ctx) => {
      if (!ctx.isConnected()) return { ok:false, message:'Cast session ended. Please refresh the queue.' };
      return ctx.castPlayer.editQueue(body?.index, body?.action, body?.expectedIds);
    },
    '/api/queue/next': async (body, ctx) => {
      if (!ctx.isConnected()) return { ok:false, message:'Cast session ended. Please try again.' };
      return ctx.castPlayer.queueNext(body);
    },
    '/api/queue/append': async (body, ctx) => {
      if (!ctx.isConnected()) return { ok:false, message:'Cast session ended. Please try again.' };
      return ctx.castPlayer.appendTracks(body?.tracks, body?.next === true);
    },

    '/api/stop': async (_body, ctx) => { await ctx.castPlayer.stop(); ctx.castPlayer.clearOnDisconnect(); return { ok: true }; },

    '/api/cast/disconnect': async (_body, ctx) => ({ ok: await ctx.disconnectCast() }),

    '/api/network/trust': async (_body, ctx) => {
      const ok = await ctx.network.trust();
      return { ok };
    },

    '/api/network/untrust': async (_body, ctx) => {
      const ok = await ctx.network.untrust();
      return { ok };
    },
  },
};

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET') {
      resolve({});
      return;
    }

    let body = '';
    let size = 0;
    let oversized = false;
    req.on('error', reject);
    req.on('data', (chunk: Buffer) => {
      if (oversized) return;
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        oversized = true;
        body = ''; // Free memory and reject before the sender finishes uploading.
        req.pause();
        reject(new RequestError('Request body too large', 413));
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      if (oversized) {
        reject(new RequestError('Request body too large', 413));
        return;
      }
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new RequestError('Invalid JSON'));
      }
    });
  });
}

export function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext
): void {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  const origin = req.headers.origin;
  if (!allowedLocalOrigin(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return;
  }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const handler = routes[method]?.[url];

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  void parseBody(req).then(async (body) => {
    const result = await handler(body, ctx);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }).catch((err) => {
    if (err instanceof RequestError && err.status === 413) {
      // Node closes a Connection: close response after flushing it. Destroying
      // the request here would reset the socket before clients receive the 413.
      res.setHeader('Connection', 'close');
    }
    res.writeHead(err instanceof RequestError ? err.status : 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (err as Error).message }));
  });
}

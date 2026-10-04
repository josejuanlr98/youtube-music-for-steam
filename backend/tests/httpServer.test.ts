import { describe, it, expect, vi } from 'vitest';
import { handleRequest } from '../src/httpServer.js';
import { EventEmitter } from 'node:events';

function createMockReq(method: string, url: string, body?: any): any {
  const req = new EventEmitter();
  (req as any).method = method;
  (req as any).url = url;
  (req as any).headers = {};

  if (body) {
    setTimeout(() => {
      req.emit('data', Buffer.from(JSON.stringify(body)));
      req.emit('end');
    }, 1);
  } else {
    setTimeout(() => req.emit('end'), 1);
  }

  return req;
}

function createMockRes(): any {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(code: number, headers?: Record<string, string>) {
      res.statusCode = code;
      if (headers) Object.assign(res.headers, headers);
    },
    setHeader(key: string, value: string) {
      res.headers[key] = value;
    },
    end(data?: string) {
      res.body = data ?? '';
    },
  };
  return res;
}

function createContext() {
  return {
    castPlayer: { getCurrentTrackInfo:() => ({ videoId:'song', url:'https://audio.test/song', duration:180 }),
      getPlaybackId:() => 'playback', isCurrentlyPlaying:() => true } as any,
    libraryPlayer: { getVolume:async () => ({ level:50 }), getPosition:async () => 12, getDuration:async () => 180 } as any,
    isConnected:() => true, senderName:() => 'Phone', disconnectCast:async () => true,
    network:{ getCurrent:() => ({ uuid:null, name:null, trusted:false }), trust:async () => true, untrust:async () => true },
  };
}

describe('HTTP Server', () => {
  it('returns 200 for GET /api/health', async () => {
    const req = createMockReq('GET', '/api/health');
    const res = createMockRes();
    const ctx = createContext();

    handleRequest(req, res, ctx);

    await new Promise((r) => setTimeout(r, 50));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ready: true });
  });

  it('returns 404 for unknown routes', async () => {
    const req = createMockReq('GET', '/api/unknown');
    const res = createMockRes();
    const ctx = createContext();

    handleRequest(req, res, ctx);

    await new Promise((r) => setTimeout(r, 50));

    expect(res.statusCode).toBe(404);
  });

  it('handles OPTIONS preflight requests', async () => {
    const req = createMockReq('OPTIONS', '/api/play');
    const res = createMockRes();
    const ctx = createContext();

    handleRequest(req, res, ctx);

    expect(res.statusCode).toBe(204);
  });
  it('provides the playback identity, stream and position needed to recover after reconnect', async () => {
    const res = createMockRes();
    handleRequest(createMockReq('GET', '/api/state'), res, createContext());
    await vi.waitFor(() => expect(res.statusCode).toBe(200));
    expect(JSON.parse(res.body)).toMatchObject({ connected:true, position:12,
      track:{ videoId:'song', url:'https://audio.test/song', playbackId:'playback' } });
  });
});

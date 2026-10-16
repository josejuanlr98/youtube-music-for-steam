import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { audioPlaybackUrl, relayAudio } from '../src/audioRelay.js';
import { handleRequest } from '../src/httpServer.js';

const source = 'https://rr1.googlevideo.com/videoplayback?clen=1000000&sig=synthetic';
function request(url = source, range?: string): any {
  return {url:'/api/audio?src=' + encodeURIComponent(url), headers:range ? {range} : {}};
}
function response(): any {
  return Object.assign(new EventEmitter(), {status:0, headers:{} as any, body:undefined as any,
    writeHead(status: number, headers: any) { this.status=status; Object.assign(this.headers,headers); },
    setHeader(key: string, value: string) { this.headers[key]=value; },
    end(body: any) { this.body=body; },
  });
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('Googlevideo audio relay', () => {
  it('routes Googlevideo playback locally and leaves other providers unchanged', () => {
    expect(new URL(audioPlaybackUrl(source)).searchParams.get('src')).toBe(source);
    expect(audioPlaybackUrl('https://audio.test/song')).toBe('https://audio.test/song');
  });
  it.each([undefined, 'bytes=400000-', 'bytes=999990-'])('caps ranges and preserves offsets for %s', async range => {
    const start=range ? Number(range.slice(6,-1)) : 0;
    const end=Math.min(start+262143,999999);
    const fetcher=vi.fn(async (url: URL, options: RequestInit) => {
      expect(url.searchParams.get('range')).toBe(`${start}-${end}`);
      expect(options.headers).toEqual({}); // Applying Range again would offset the chunk twice.
      expect(options.redirect).toBe('error');
      return new Response(Buffer.alloc(end-start+1), {status:200, headers:{
        'Content-Type':'audio/mp4', 'Content-Length':String(end-start+1),
      }});
    });
    vi.stubGlobal('fetch',fetcher);
    const res=response(); await relayAudio(request(source,range),res);
    expect(res.status).toBe(206);
    expect(res.headers['Content-Range']).toBe(`bytes ${start}-${end}/1000000`);
    expect(res.body.length).toBe(end-start+1);
  });
  it('falls back to bounded HTTP ranges when total length is absent', async () => {
    vi.stubGlobal('fetch',vi.fn(async (_url,options) => {
      expect(options.headers).toEqual({Range:'bytes=5-9'});
      return new Response(Buffer.alloc(5),{status:206,headers:{'Content-Type':'audio/webm','Content-Range':'bytes 5-9/10'}});
    }));
    const res=response(); await relayAudio(request('https://rr1.googlevideo.com/audio','bytes=5-9'),res);
    expect(res.status).toBe(206);expect(res.headers['Content-Range']).toBe('bytes 5-9/10');
  });
  it.each(['http://rr1.googlevideo.com/a','https://googlevideo.com.attacker.invalid/a',
    'https://user:password@rr1.googlevideo.com/a','https://rr1.googlevideo.com:8443/a','not a URL'])('rejects unsafe source %s',async url => {
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const res=response();await relayAudio(request(url),res);
    expect(res.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['bytes=9-1','bytes=-5','bytes=1-2,5-6','bytes=99999999999999999-','bytes=1000000-'])('rejects invalid range %s',async range => {
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const res=response();await relayAudio(request(source,range),res);
    expect(res.status).toBe(416);expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([403,302])('does not forward provider errors or redirects (%s)', async status => {
    vi.stubGlobal('fetch',vi.fn(async () => new Response('private provider error',{status})));
    const res=response();await relayAudio(request(),res);
    expect(res.status).toBe(status===403?403:502);
    expect(res.body).toBe('Audio stream unavailable');
  });
  it.each([4,262145])('rejects incomplete or oversized bodies (%s bytes)',async length => {
    vi.stubGlobal('fetch',vi.fn(async () => new Response(Buffer.alloc(length),{status:200,headers:{
      'Content-Type':'audio/mp4','Content-Length':'262144',
    }})));
    const res=response();await relayAudio(request(),res);expect(res.status).toBe(502);
  });
  it('serves the relay route to the Steam origin', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => new Response(Buffer.alloc(10),{status:200,headers:{
      'Content-Type':'audio/mp4','Content-Length':'10',
    }})));
    const req=request(source,'bytes=10-19');req.method='GET';req.headers.origin='https://steamloopback.host';
    const res=response();handleRequest(req,res,{} as any);
    await vi.waitFor(() => expect(res.status).toBe(206));
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://steamloopback.host');
    expect(res.headers['Content-Range']).toBe('bytes 10-19/1000000');
    expect(res.body.length).toBe(10);
  });
  it('retains the HTTP server origin guard before relaying', () => {
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    const req=request();req.method='GET';req.headers.origin='https://untrusted.invalid';
    const res=response();handleRequest(req,res,{} as any);
    expect(res.status).toBe(403);expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels the upstream fetch when the player disconnects', async () => {
    const res=response();
    vi.stubGlobal('fetch',vi.fn(async (_url,options) => {
      res.destroyed=true;res.emit('close');expect(options.signal.aborted).toBe(true);
      throw new Error('aborted');
    }));
    await relayAudio(request(),res);expect(res.status).toBe(0);
  });
});

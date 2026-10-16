import type { IncomingMessage, ServerResponse } from 'node:http';

const RELAY_URL = 'http://127.0.0.1:39281/api/audio';
const MAX_RANGE_BYTES = 256 * 1024;

class RelayError extends Error {
  constructor(readonly status: number) { super('Audio stream unavailable'); }
}

export function audioPlaybackUrl(url: string): string {
  const source = new URL(url);
  if (source.protocol !== 'https:' || !source.hostname.endsWith('.googlevideo.com')) return url;
  return `${RELAY_URL}?src=${encodeURIComponent(url)}`;
}

/** Serve bounded Googlevideo ranges while retaining the original file offsets for seeking. */
export async function relayAudio(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12_000);
  res.on('close', () => abort.abort());
  try {
    const src = new URL(req.url ?? '/', RELAY_URL).searchParams.get('src');
    if (!src) throw new RelayError(400);
    let source: URL;
    try { source = new URL(src); } catch { throw new RelayError(400); }
    if (source.protocol !== 'https:' || !source.hostname.endsWith('.googlevideo.com') ||
        source.port || source.username || source.password) throw new RelayError(400);

    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? 'bytes=0-');
    if (!match) throw new RelayError(416);
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : start + MAX_RANGE_BYTES - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || requestedEnd < start)
      throw new RelayError(416);
    const total = Number(source.searchParams.get('clen'));
    const hasTotal = Number.isSafeInteger(total) && total > 0;
    if (hasTotal && start >= total) {
      res.setHeader('Content-Range', `bytes */${total}`);
      throw new RelayError(416);
    }
    const end = Math.min(requestedEnd, start + MAX_RANGE_BYTES - 1, hasTotal ? total - 1 : Infinity);
    // Some CDN links reject HTTP Range headers. YouTube's URL range parameter
    // succeeds, but changes the response into a standalone chunk (HTTP 200).
    // Never also send a Range header: that would apply the offset twice.
    if (hasTotal) source.searchParams.set('range', `${start}-${end}`);
    const upstream = await fetch(source, {
      headers: hasTotal ? {} : { Range: `bytes=${start}-${end}` },
      redirect: 'error', signal: abort.signal,
    });
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(upstream.headers.get('content-range') ?? '');
    const type = upstream.headers.get('content-type') ?? '';
    const queryResponse = hasTotal && upstream.status === 200 &&
      Number(upstream.headers.get('content-length')) === end - start + 1;
    const headerResponse = !hasTotal && upstream.status === 206 && range !== null &&
      Number(range[1]) === start && Number(range[2]) >= start && Number(range[2]) <= end &&
      Number(range[3]) > Number(range[2]);
    if ((!queryResponse && !headerResponse) || !type.startsWith('audio/') || !upstream.body) {
      await upstream.body?.cancel();
      throw new RelayError(upstream.status === 403 ? 403 : 502);
    }
    const expected = queryResponse ? end - start + 1 : Number(range![2]) - start + 1;
    const contentRange = queryResponse ? `bytes ${start}-${end}/${total}` : upstream.headers.get('content-range')!;
    const reader = upstream.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RANGE_BYTES) { await reader.cancel(); throw new RelayError(502); }
      chunks.push(Buffer.from(value));
    }
    if (size !== expected) throw new RelayError(502);
    if (res.destroyed) return;
    res.writeHead(206, {
      'Content-Type': type, 'Content-Range': contentRange, 'Content-Length': size,
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    });
    res.end(Buffer.concat(chunks, size));
  } catch (error) {
    if (!res.destroyed && !res.headersSent) {
      res.writeHead(error instanceof RelayError ? error.status : 502, {
        'Content-Type': 'text/plain', 'Cache-Control': 'no-store',
      });
      // Do not include signed URLs, request headers, or provider errors.
      res.end('Audio stream unavailable');
    }
  } finally { clearTimeout(timeout); }
}

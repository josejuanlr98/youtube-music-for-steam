/** The Decky CEF UI and local development pages may control the loopback API.
 * Python/Node clients do not send Origin; browser pages cannot spoof it. */
export function allowedLocalOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    const url = new URL(origin);
    return url.origin === origin && !url.username && !url.password &&
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['steamloopback.host', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

import { createHash } from 'node:crypto';
/** Read-only response-byte lineage for the explicitly configured local receiver. */
export function captureResources(page, origin) {
  const pending = [], entries = new Map();
  page.on('response', response => {
    const type = response.request().resourceType();
    if (!response.url().startsWith(origin) || !['document', 'script', 'stylesheet', 'font'].includes(type)) return;
    pending.push((async () => {
      const entry = { url: response.url(), type, status: response.status(), mime: response.headers()['content-type'] };
      try { entry.sha256 = createHash('sha256').update(await response.body()).digest('hex'); }
      catch (error) { entry.readFailure = error.message; }
      entries.set(`${entry.url}|${entry.sha256 ?? entry.readFailure}`, entry);
    })());
  });
  return async () => { await Promise.allSettled(pending); return [...entries.values()].sort((a, b) => a.url.localeCompare(b.url)); };
}

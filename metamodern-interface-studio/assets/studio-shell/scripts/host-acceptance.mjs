/** Shared browser proof for generated Vite and Next synthetic consumers. Explicit URL mode never starts/stops a service. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const host = process.env.STUDIO_HOST ?? JSON.parse(readFileSync('studio-shell.lock.json', 'utf8')).host ?? 'vite';
const evidence = resolve(process.env.STUDIO_HOST_EVIDENCE ?? '.acceptance/host');
mkdirSync(evidence, { recursive: true });
let child, url = process.env.STUDIO_HOST_URL;
if (!url) {
  const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r));
  const port = listener.address().port; await new Promise(r => listener.close(r));
  url = `http://127.0.0.1:${port}`;
  child = spawn('npm', ['run', 'dev', '--', '--port', String(port), host === 'next' ? '--hostname' : '--host', '127.0.0.1'], { env: { ...process.env, VITE_STUDIO_ADAPTER: 'library', STUDIO_ADAPTER: 'library' }, stdio: 'inherit', detached: true });
}
const results = [], errors = [];
let browser;
try {
  const deadline = Date.now() + 60000;
while (true) {
  try { const response = await fetch(url); if (response.ok) break; } catch { /* service not listening yet */ }
  if (Date.now() > deadline) throw new Error(`Studio did not respond: ${url}`);
  await new Promise(r => setTimeout(r, 200));
}
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const layoutLabel = `Host layout ${process.pid}`;
  const hostLabel = `Host saved card ${process.pid}`;
  page.on('pageerror', e => errors.push(e.message));
  // Navigation retries only until the task-owned server starts; each flow awaits its declared ready UI.
  await page.goto(url);
  await page.locator('header').waitFor({ timeout: 60000 });
  const ready = async () => { await page.getByText('Ready', { exact: true }).first().waitFor({ timeout: 30000 }); };
  for (const view of ['inspect', 'compare', 'responsive', 'design']) {
    await page.goto(`${url}/?host-check=${view}#view=${view}&scenario=tasks.list`); await ready();
    await page.screenshot({ path: `${evidence}/${host}-${view}.png` }); results.push({ check: view, pass: true });
  }
  const edition = JSON.parse(readFileSync('studio-shell.lock.json', 'utf8')).icons?.edition ?? 'free';
  await page.goto(`${url}/?host-check=icon-profile#view=design&scenario=tasks.list`); await ready();
  await page.getByText(edition === 'pro' ? 'Stroke Rounded (Pro)' : 'Stroke Rounded (Free)', { exact: true }).first().waitFor();
  assert.equal(await page.getByText(edition === 'pro' ? 'Stroke Rounded (Free)' : 'Stroke Rounded (Pro)', { exact: true }).count(), 0);
  results.push({ check: 'active icon profile only', edition, pass: true });
  await page.goto(`${url}/?host-check=reset#view=inspect&scenario=tasks.list`); await ready();
  const frame = page.frameLocator('iframe[title="Tasks: Today preview"]').first();
  await frame.getByRole('button', { name: 'New task', exact: true }).click(); await page.getByText('Modified', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Reset preview', exact: true }).click(); await ready();
  await page.keyboard.press('2'); await page.waitForURL(/view=compare/); results.push({ check: 'preview interaction/reset/keyboard', pass: true });
  await page.goto(`${url}/?host-check=save#view=responsive&scenario=tasks.list`); await ready();
  const save = page.getByRole('button', { name: 'Save as', exact: true });
  if (await save.isEnabled()) {
    await save.click(); await page.getByLabel('Save as a new layout', { exact: true }).fill(layoutLabel);
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    await page.getByText(`Saved ${layoutLabel}`, { exact: true }).waitFor();
    const layoutLink = page.url();
    const layoutId = new URLSearchParams(new URL(layoutLink).hash.slice(1)).get('layout');
    assert.ok(layoutId);
    await page.reload(); await page.getByText(layoutLabel, { exact: true }).first().waitFor();
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('layout'), layoutId);
    const layoutContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const layoutPage = await layoutContext.newPage(); await layoutPage.goto(layoutLink); await layoutPage.locator(`span[title="${layoutLabel}"]`).waitFor();
    await layoutPage.getByText('Ready', { exact: true }).first().waitFor();
    assert.equal(new URLSearchParams(new URL(layoutPage.url()).hash.slice(1)).get('layout'), layoutId);
    await layoutContext.close();
    results.push({ check: 'layout save/reload/fresh link', pass: true });
  } else results.push({ check: 'review mode read-only save', pass: true });
  await page.goto(`${url}/?host-check=scenario#view=inspect&scenario=components.task-card`); await ready();
  await page.locator('[data-properties]').waitFor();
  await page.getByRole('switch', { name: 'Done', exact: true }).click();
  const scenarioSave = page.getByRole('button', { name: 'Save as scenario', exact: true });
  if (await scenarioSave.isEnabled()) {
    await scenarioSave.click(); await page.getByLabel('Name the new state').fill(hostLabel);
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    await page.locator(`[role="treeitem"][title="${hostLabel}"]`).waitFor();
    const savedLink = page.url(); await page.reload(); await ready();
    await page.locator(`[role="treeitem"][title="${hostLabel}"]`).waitFor();
    await page.frameLocator('iframe.opacity-100').first().locator('.task-card.done').waitFor();
    const stored = await page.request.get(`${url}/__studio/scenarios`);
    const saved = (await stored.json()).scenarios.find(state => state.label === hostLabel);
    assert.equal(saved.values.done, true);
    const linkContext = await browser.newContext(); const linked = await linkContext.newPage(); await linked.goto(savedLink); await linked.locator(`[role="treeitem"][title="${hostLabel}"]`).waitFor(); await linked.frameLocator('iframe.opacity-100').first().locator('.task-card.done').waitFor(); assert.equal(new URLSearchParams(new URL(linked.url()).hash.slice(1)).get('scenario'), new URLSearchParams(new URL(savedLink).hash.slice(1)).get('scenario')); await linkContext.close();
    results.push({ check: 'scenario save/reload/link', pass: true });
  } else results.push({ check: 'review mode read-only scenario save', pass: true });
  if (process.env.STUDIO_HOST_LIBRARY !== '0') {
    await page.getByRole('button', { name: 'Library', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Button', exact: true }).first().waitFor();
    await page.locator('iframe').first().waitFor();
    await page.screenshot({ path: `${evidence}/${host}-library.png` }); results.push({ check: 'library', pass: true });
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  if (child) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ } }
  writeFileSync(`${evidence}/${host}-report.json`, JSON.stringify({ host, url, results, errors }, null, 2));
}
console.log(JSON.stringify({ host, results, errors }));

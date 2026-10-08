import { captureResources } from './capture.mjs';
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdirSync, writeFileSync } from 'node:fs';
const outputRoot = process.env.POPOVER_OUTPUT ?? './popover-focus-evidence';
mkdirSync(outputRoot, { recursive: true });
const resourceRuns = [];
const red = process.env.FOCUS_MODE === 'red', results = [];
for (const engine of ['chromium', 'webkit']) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch(engine === 'webkit' ? { executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE } : {});
  for (const [host, root] of [['vite', process.env.STUDIO_VITE_URL ?? 'http://127.0.0.1:4221'], ['next', process.env.STUDIO_NEXT_URL ?? 'http://127.0.0.1:4222']]) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const finishResources = captureResources(page, root);
    await page.goto(`${root}/#view=design&scenario=tasks.list`);
    await page.getByRole('button', { name: 'Directions', exact: true }).waitFor();
    for (const kind of ['palette', 'directions']) {
      if (kind === 'palette' && width === 390 && !await page.getByRole('button', { name: 'Palette picker', exact: true }).isVisible()) await page.getByRole('button', { name: 'Panel', exact: true }).click();
      const opener = page.getByRole('button', { name: kind === 'palette' ? 'Palette picker' : 'Directions', exact: true });
      if (kind === 'directions' && width === 390 && !await opener.isVisible()) await page.keyboard.press('Escape');
      const name = kind === 'palette' ? 'Registered palette' : 'Named directions';
      const popup = page.getByRole('dialog', { name, exact: true });
      const open = async () => { if (!await popup.isVisible()) { await opener.scrollIntoViewIfNeeded(); await opener.click(); } await popup.waitFor(); };
      const handles = async () => {
        const all = await popup.locator('button, input, textarea, select, a[href], [tabindex]').elementHandles(), out = [];
        for (const element of all) if (await element.evaluate(e => e.tabIndex >= 0 && !e.disabled && !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')) out.push(element);
        return out;
      };
      const boundary = async reverse => {
        await open(); const list = await handles(), element = await popup.elementHandle();
        await (reverse ? list[0] : list.at(-1)).focus(); await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const after = await page.evaluate(e => ({ open: e.isConnected && !!e.getClientRects().length, inside: e.contains(document.activeElement), focus: { text: document.activeElement?.textContent, aria: document.activeElement?.getAttribute('aria-label'), role: document.activeElement?.getAttribute('role') } }), element);
        if (red) { if (await popup.count() && await popup.getAttribute('data-open') !== null) await popup.getByRole('button', { name: kind === 'palette' ? 'Close picker' : 'Close directions', exact: true }).click(); await popup.waitFor({ state: 'hidden' }); }
        return after;
      };
      await open(); const close = popup.getByRole('button', { name: kind === 'palette' ? 'Close picker' : 'Close directions', exact: true });
      const closeGeometry = await close.evaluate(e => ({ tag: e.tagName, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height, classes: e.className, nestedButtons: e.querySelectorAll('button').length }));
      await page.screenshot({ path: `${outputRoot}/${red ? 'red' : 'green'}-${engine}-${host}-${width}-${kind}.png` });
      const lastTab = await boundary(false); if (!red && (!lastTab.open || !lastTab.inside)) throw new Error(`${engine}/${host}/${width}/${kind}: last Tab escaped`);
      const firstShiftTab = await boundary(true); if (!red && (!firstShiftTab.open || !firstShiftTab.inside)) throw new Error(`${engine}/${host}/${width}/${kind}: first Shift+Tab escaped`);
      await open(); const list = await handles(); await list[0].focus(); await page.keyboard.press('Tab');
      const interior = await popup.evaluate(e => e.contains(document.activeElement)); if (!interior) throw new Error('Interior Tab escaped');
      await page.keyboard.press('Escape'); await popup.waitFor({ state: 'hidden' });
      await page.waitForFunction(label => document.activeElement?.textContent === label, kind === 'palette' ? 'Palette picker' : 'Directions');
      await open(); await close.click(); await popup.waitFor({ state: 'hidden' });
      await page.waitForFunction(label => document.activeElement?.textContent === label, kind === 'palette' ? 'Palette picker' : 'Directions');
      const sheetSurvived = kind !== 'palette' || width !== 390 || await page.getByRole('button', { name: 'Palette picker', exact: true }).isVisible();
      if (!sheetSurvived) throw new Error('Nested sheet dismissed');
      results.push({ engine, host, width, kind, red, lastTab, firstShiftTab, interior, closeGeometry, escapeFocus: true, clickFocus: true, sheetSurvived, errors: [...errors] });
      if (width === 390 && kind === 'palette') await page.keyboard.press('Escape');
    }
    if (width === 1440) {
      await page.getByRole('button', { name: 'Studio settings', exact: true }).click();
      const popup = page.getByRole('dialog', { name: 'Studio settings', exact: true }); await popup.waitFor();
      const all = await popup.locator('button, input, textarea, select, a[href], [tabindex]').elementHandles(), list = [];
      for (const element of all) if (await element.evaluate(e => e.tabIndex >= 0 && !e.disabled && !!e.getClientRects().length)) list.push(element);
      const handle = await popup.elementHandle(); await list.at(-1).focus(); await page.keyboard.press('Tab');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const after = await page.evaluate(e => ({ open: e.isConnected && !!e.getClientRects().length, inside: e.contains(document.activeElement) }), handle);
      if (!red && after.inside) throw new Error('Legacy nonmodal popover became trapped');
      results.push({ engine, host, width, kind: 'legacy-settings', red, after, errors: [...errors] });
    }
    writeFileSync(`${outputRoot}/${red ? 'red' : 'green'}-progress.json`, JSON.stringify(results, null, 2));
    resourceRuns.push({engine,host,width,resources:await finishResources()});
    writeFileSync(`${outputRoot}/${red?'red':'green'}-resources.json`,JSON.stringify(resourceRuns,null,2));
    await context.close();
  }
  await browser.close();
}
writeFileSync(`${outputRoot}/${red ? 'red' : 'green'}.json`, JSON.stringify(results, null, 2));
if (results.some(r => r.errors.length)) process.exitCode = 1;

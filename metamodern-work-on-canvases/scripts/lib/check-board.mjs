// Opens one board in a Playwright page and reports what went wrong: page errors, console errors,
// failed requests, a runtime that never became ready, and empty mounts (a mounted component host
// that holds nothing, or one the runtime marked with data-canvas-error). Used by the package tests
// and the compatibility check.

/** Waits for the runtime's first commit and the kit's renders to settle. */
async function settle(page, timeout) {
  await page.waitForFunction(() => window.__canvasRuntime && window.__canvasRuntime.__readyFlag === true, null, { timeout }).catch(() => {});
}

export async function openBoard(context, url, { timeout = 15000, viewport, screenshot, fullPage = false } = {}) {
  const page = await context.newPage();
  if (viewport) await page.setViewportSize(viewport);
  const problems = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message.split('\n')[0].slice(0, 300)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text().slice(0, 300)}`);
  });
  page.on('requestfailed', (request) => problems.push(`request failed: ${request.url()} (${request.failure()?.errorText ?? 'failed'})`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.addInitScript(() => {
    const mark = () => {
      const runtime = window.__canvasRuntime;
      if (!runtime) return setTimeout(mark, 10);
      runtime.ready.then(() => { runtime.__readyFlag = true; });
    };
    mark();
  });
  try {
    await page.goto(url, { waitUntil: 'load', timeout });
  } catch (error) {
    problems.push(`navigation failed: ${String(error.message).split('\n')[0].slice(0, 300)}`);
  }
  await settle(page, timeout);
  // Mounted components render on the kit's own schedule (React may spread many roots over several frames):
  // wait until every host holds something, then one more frame pair for effects. A host that stays empty is
  // reported below.
  await page
    .waitForFunction(
      () => [...document.querySelectorAll('[data-canvas-import]')].every((h) => h.hasAttribute('data-canvas-error') || h.querySelector('*') || h.textContent.trim()),
      null,
      { timeout: Math.min(timeout, 10000) },
    )
    .catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const state = await page.evaluate(() => {
    const runtime = window.__canvasRuntime;
    const hosts = [...document.querySelectorAll('[data-canvas-import]')];
    const empty = hosts
      .filter((host) => host.hasAttribute('data-canvas-error') || (!host.querySelector('*') && !host.textContent.trim()))
      .map((host) => host.getAttribute('data-canvas-import') + (host.hasAttribute('data-canvas-error') ? ` (${host.getAttribute('data-canvas-error')})` : ''));
    return {
      ready: !!(runtime && runtime.__readyFlag),
      hosts: hosts.length,
      empty,
      elements: document.body.querySelectorAll('*').length,
      text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
    };
  });
  if (!state.ready) problems.push('the runtime never became ready');
  for (const name of state.empty) problems.push(`empty mount: ${name}`);
  if (state.ready && state.elements < 2 && !state.text) problems.push('the board rendered nothing');
  if (screenshot) await page.screenshot({ path: screenshot, fullPage });
  return { page, problems, state };
}

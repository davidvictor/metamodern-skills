// Compatibility check: runs existing boards, unchanged, on this package's runtime in headless Chromium.
// Local only (never in CI). It reads the boards and kit where they are, writes only to --out, and fails
// on page errors, console errors, failed requests, a runtime that never became ready and empty mounts.
//
//   node scripts/compat-check.mjs --canvas <folder with canvas.json> --kit <namespace>=<kit folder> --out <dir>
//        [--name <canvas id>] [--boards a.dc.html,b.dc.html] [--props '{"theme":"dark"}'] [--max-height 2400]
//
// Needs the tooling with Chromium: node scripts/tooling.mjs install --browser
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from './tooling.mjs';
import { startBoardServer } from './lib/board-server.mjs';
import { openBoard } from './lib/check-board.mjs';

const { values } = parseArgs({
  options: {
    canvas: { type: 'string' },
    kit: { type: 'string' },
    out: { type: 'string' },
    name: { type: 'string' },
    boards: { type: 'string' },
    props: { type: 'string' },
    'max-height': { type: 'string', default: '2400' },
  },
});

if (!values.canvas || !values.kit || !values.out || !values.kit.includes('=')) {
  console.error('Usage: node scripts/compat-check.mjs --canvas <folder> --kit <namespace>=<kit folder> --out <dir> [--name id] [--boards a,b] [--props json]');
  process.exit(2);
}

const canvasDir = path.resolve(values.canvas);
const [namespace, kitPath] = [values.kit.slice(0, values.kit.indexOf('=')), path.resolve(values.kit.slice(values.kit.indexOf('=') + 1))];
const out = path.resolve(values.out);
const id = values.name ?? path.basename(path.dirname(canvasDir)) ?? 'canvas';
const canvas = JSON.parse(await fs.readFile(path.join(canvasDir, 'canvas.json'), 'utf8'));
const files = values.boards
  ? values.boards.split(',').map((b) => b.trim()).filter(Boolean)
  : (await fs.readdir(canvasDir)).filter((f) => f.endsWith('.dc.html')).sort();
const maxHeight = Number(values['max-height']);
const launch = chromium();
if (!launch) {
  console.error('The canvas tooling is not installed: node scripts/tooling.mjs install --browser');
  process.exit(2);
}

await fs.mkdir(path.join(out, 'screens'), { recursive: true });
const config = { schema: 'canvas-config/1', name: 'compatibility check', canvases: '.', kit: { namespace, pinned: kitPath }, skin: 'skin.css', port: 0, groups: ['app'] };
const server = await startBoardServer({ projectRoot: canvasDir, config, canvases: { [id]: canvasDir } });
const browser = await launch.launch();
const context = await browser.newContext({ deviceScaleFactor: 1 });
const results = [];
const started = Date.now();
try {
  for (const file of files) {
    const board = canvas.boards?.[file] ?? {};
    const width = Math.max(320, Math.round(board.w ?? 1280));
    const height = Math.max(240, Math.min(maxHeight, Math.round(board.h ?? 800)));
    const query = values.props ? `?canvas-props=${encodeURIComponent(values.props)}` : '';
    const shot = path.join(out, 'screens', `${file.replace(/\.dc\.html$/, '')}.png`);
    const t0 = Date.now();
    const { page, problems, state } = await openBoard(context, `${server.origin}/${encodeURIComponent(id)}/project/${encodeURIComponent(file)}${query}`, {
      viewport: { width, height },
      screenshot: shot,
    });
    await page.close();
    results.push({ board: file, ms: Date.now() - t0, width, height, hosts: state.hosts, ok: problems.length === 0, problems });
    process.stdout.write(problems.length ? `FAIL ${file}\n${problems.map((p) => `  ${p}`).join('\n')}\n` : `ok   ${file} (${Date.now() - t0} ms, ${state.hosts} mounts)\n`);
  }
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.ok);
const summary = {
  canvas: id,
  folder: canvasDir,
  kit: { namespace, folder: kitPath },
  props: values.props ? JSON.parse(values.props) : null,
  boards: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  seconds: Math.round((Date.now() - started) / 100) / 10,
  results,
};
await fs.writeFile(path.join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const lines = [
  `# Compatibility check: ${id}`,
  '',
  `${summary.passed} of ${summary.boards} boards passed in ${summary.seconds} s. Kit ${namespace} from ${kitPath}.`,
  '',
  '| Board | Result | Mounts | Time |',
  '| --- | --- | --- | --- |',
  ...results.map((r) => `| ${r.board} | ${r.ok ? 'pass' : `fail: ${r.problems.join('; ').replace(/\|/g, '/')}`} | ${r.hosts} | ${r.ms} ms |`),
  '',
];
await fs.writeFile(path.join(out, 'summary.md'), lines.join('\n'));
console.log(`${summary.passed}/${summary.boards} boards passed (${summary.seconds} s). Summary: ${path.join(out, 'summary.md')}`);
process.exitCode = failed.length ? 1 : 0;

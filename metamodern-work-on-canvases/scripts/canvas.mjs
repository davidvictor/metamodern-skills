#!/usr/bin/env node
// The package's command line, the same for every harness. Run it from the project root, or pass --project.
//
//   canvas view     [--project <dir>] [--port <n>]
//   canvas render   [--canvas <id> ...] [--board <file> ...] [--out <dir>] [--jobs <n>] [--no-heights]
//   canvas review   validate | list
//   canvas review   create <id> --page <page> [--title t] [--question q] [--lead l] [--status s] [--waits-on id ...]
//                   [--replaces id ...] [--canvas id] [--board <file> ...]
//   canvas review   status <id> <status> [--issue n] [--pr url] [--branch name] [--commit sha]
//   canvas review   lock <id> --words "<the decision-maker's words>" --harness claude-code|codex [--date YYYY-MM-DD] [--piece text ...]
//                   [--canvas <app canvas>] [--renders <render out dir>]
//   canvas review   archive <id> [--board <file> ...] [--why text] [--date YYYY-MM-DD] [--canvas id] [--archive id]
//                   [--renders <dir>]
//   canvas explore  create <id> --title t --question q [--set <set id>] [--copy <canvas>/<board> ...]
//   canvas explore  decide <id> [--lead text]
//   canvas comments list [--open] [--batch <id>] | wait [--timeout <s>] | take <batchId> | reply <id> "<text>" [--addressed]
//                   | done <batchId>   (scripts/comments.mjs)
//   canvas install  [--project <dir>] [--from <checkout or package>] [--ref <tag>] [--dir <path>] [--name n] [--namespace ns]
//   canvas update   --from <checkout or package> [--ref <tag>] [--keep <path> [--reason why]] [--replace <path>] [--dry-run]
//   canvas verify   (install, update and verify: scripts/install.mjs, references/install.md)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseOptions } from 'node:util';
import { readConfig } from './canvas-format.mjs';
import { findProject, startViewer } from './lib/viewer-server.mjs';
import { renderCheck } from './render-check.mjs';
import { archiveSet, createSet, lockSet, readReview, setStatus, statusRow, validateReview, writeReview } from './review-sets.mjs';
import { createExploration, decideExploration } from './explore.mjs';

const OPTIONS = {
  project: { type: 'string' },
  canvas: { type: 'string', multiple: true },
  board: { type: 'string', multiple: true },
  out: { type: 'string' },
  jobs: { type: 'string' },
  'no-heights': { type: 'boolean' },
  page: { type: 'string' },
  title: { type: 'string' },
  question: { type: 'string' },
  lead: { type: 'string' },
  status: { type: 'string' },
  'waits-on': { type: 'string', multiple: true },
  replaces: { type: 'string', multiple: true },
  issue: { type: 'string' },
  pr: { type: 'string' },
  branch: { type: 'string' },
  commit: { type: 'string' },
  words: { type: 'string' },
  harness: { type: 'string' },
  date: { type: 'string' },
  piece: { type: 'string', multiple: true },
  renders: { type: 'string' },
  why: { type: 'string' },
  archive: { type: 'string' },
  set: { type: 'string' },
  copy: { type: 'string', multiple: true },
  help: { type: 'boolean', short: 'h' },
};

const USAGE = `Usage: canvas <view | render | review | explore | comments | install | update | verify> ...  (see the header of scripts/canvas.mjs)`;
const VIEW_USAGE = 'Usage: canvas view [--project <dir>] [--port <n>]';

/** The options of `canvas view`. */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === '--project' || flag === '--port') {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
      options[flag.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`Unknown option ${flag}`);
    }
  }
  if (options.port !== undefined) {
    const port = Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be an integer from 0 to 65535');
    options.port = port;
  }
  return options;
}

// `view` starts the viewer for the project that holds canvas.config.json (the --project folder, or the nearest one
// at or above the working directory) on 127.0.0.1, at the config's port unless --port is given. It keeps running and
// returns null.
async function view(argv) {
  let options;
  try { options = parseArgs(argv); } catch (error) { console.error(`${error.message}\n${VIEW_USAGE}`); return 1; }
  const projectRoot = options.project ? path.resolve(options.project) : findProject();
  if (!projectRoot) { console.error('No canvas.config.json in this folder or above it. Pass --project <dir>.'); return 1; }
  let config;
  try { config = await readConfig(projectRoot); } catch (error) { console.error(`canvas.config.json: ${error.message}`); return 1; }
  try {
    const viewer = await startViewer({ projectRoot, config, port: options.port, quiet: false });
    const stop = () => viewer.close().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? `Port ${options.port ?? config.port} is in use. Pass --port <n>.` : error.message);
    return 1;
  }
  return null;
}

export async function main(argv) {
  if (argv[0] === 'view') return view(argv);
  if (argv[0] === 'comments') return (await import('./comments.mjs')).main(argv.slice(1));
  if (['install', 'update', 'verify'].includes(argv[0])) return (await import('./install.mjs')).run(argv[0], argv.slice(1));
  const { values: o, positionals } = parseOptions({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  const [command, sub, ...rest] = positionals;
  if (o.help || !command) { console.log(USAGE); return 0; }
  const project = path.resolve(o.project ?? process.cwd());
  const one = (value, name) => {
    if (Array.isArray(value)) {
      if (value.length > 1) throw new Error(`--${name} takes one value here`);
      return value[0];
    }
    return value;
  };

  if (command === 'render') {
    if (sub) throw new Error(`render takes options only, not ${sub}`);
    const result = await renderCheck({
      projectRoot: project, canvases: o.canvas, boards: o.board, out: o.out, jobs: o.jobs === undefined ? undefined : /^\d+$/.test(o.jobs) ? Number(o.jobs) : o.jobs,
      heights: !o['no-heights'], log: (line) => console.log(line),
    });
    for (const c of result.canvases) console.log(`${c.canvas}: ${c.boards - c.failed} of ${c.boards} boards passed, ${c.msPerBoard} ms per board. Report: ${c.report}`);
    console.log(`${result.ok ? 'Passed' : 'Failed'} in ${result.seconds} s with ${result.jobs} pages in parallel.`);
    return result.ok ? 0 : 1;
  }

  if (command === 'review') {
    if (sub === 'validate') {
      const { readFile } = await import('node:fs/promises');
      const issues = validateReview(JSON.parse(await readFile(path.join(project, 'review.json'), 'utf8')));
      for (const issue of issues) console.error(issue);
      if (!issues.length) console.log('review.json is valid.');
      return issues.length ? 1 : 0;
    }
    if (sub === 'list') {
      const review = await readReview(project);
      for (const s of review.sets) console.log(`${s.id}\t${s.status}\t${statusRow(s.status)}\t${s.page}\t${s.title}`);
      return 0;
    }
    const id = rest[0];
    if (!id) throw new Error(`review ${sub ?? ''} needs a set id`);
    if (sub === 'create') {
      const review = createSet(await readReview(project), {
        id, page: o.page, title: o.title ?? '', question: o.question ?? '', lead: o.lead ?? '', status: o.status ?? 'exploring',
        waits_on: o['waits-on'] ?? [], replaces: o.replaces ?? [], canvas: one(o.canvas, 'canvas') ?? null, boards: (o.board ?? []).map((b) => (b.endsWith('.dc.html') ? b : `${b}.dc.html`)),
      });
      await writeReview(project, review);
      console.log(`Created ${id} (${statusRow(review.sets.at(-1).status)}).`);
      return 0;
    }
    if (sub === 'status') {
      const status = rest[1];
      if (!status) throw new Error('review status needs <id> <status>');
      const build = { issue: o.issue === undefined ? undefined : /^\d+$/.test(o.issue) ? Number(o.issue) : o.issue, pr: o.pr, branch: o.branch };
      const review = setStatus(await readReview(project), id, status, { build, commit: o.commit });
      await writeReview(project, review);
      console.log(`${id} is ${status} (${statusRow(status)}).`);
      return 0;
    }
    if (sub === 'lock') {
      const result = await lockSet(project, id, { words: o.words, harness: o.harness, date: o.date, pieces: o.piece ?? [], canvas: one(o.canvas, 'canvas'), renderOut: o.renders });
      console.log(`Locked ${id}. Brief: ${path.relative(project, result.brief)}`);
      if (result.builtWith.length) console.log(`Built with it, in the same pull request: ${result.builtWith.join(', ')}`);
      const waiting = result.waitsFor.filter((dep) => !result.joins.includes(dep));
      if (result.buildNow) console.log('Start the build now.');
      else if (!waiting.length) console.log(`Build it with ${result.joins.join(', ')}, in the same pull request (builds/${result.joins[0]}.md).`);
      else console.log(`It waits for ${waiting.join(', ')}: it is built with ${waiting.length === 1 ? 'that set' : 'those sets'} once ${waiting.length === 1 ? 'it is' : 'they are'} locked.`);
      return 0;
    }
    if (sub === 'archive') {
      const result = await archiveSet(project, id, { boards: o.board, why: o.why ?? '', date: o.date, canvas: one(o.canvas, 'canvas'), archive: o.archive, renderOut: o.renders });
      console.log(`Archived ${result.entry.boards.length} ${result.entry.boards.length === 1 ? 'board' : 'boards'} of ${id} on ${result.archive} as ${result.entry.id}.`);
      return 0;
    }
    throw new Error(`Unknown review command ${sub}`);
  }

  if (command === 'explore') {
    const id = rest[0];
    if (!id) throw new Error(`explore ${sub ?? ''} needs a canvas id`);
    if (sub === 'create') {
      const result = await createExploration(project, { id, title: o.title, question: o.question, set: o.set ?? null, copies: o.copy ?? [], date: o.date });
      console.log(`Created ${path.relative(project, result.canvasDir)} with ${result.copied.length} copied files.`);
      for (const link of result.links) console.log(link);
      return 0;
    }
    if (sub === 'decide') {
      await decideExploration(project, { id, lead: o.lead ?? '', date: o.date });
      console.log(`${id} is decided and frozen.`);
      return 0;
    }
    throw new Error(`Unknown explore command ${sub}`);
  }
  throw new Error(`Unknown command ${command}. ${USAGE}`);
}

const self = process.argv[1] && path.resolve(process.argv[1]);
if (self && self === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { if (code !== null) process.exitCode = code; }, (error) => { console.error(error.message); process.exitCode = error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ? 2 : 1; });
}

// `canvas comments`: the agent's side of comments (contract 4, references/comments.md). The same on every harness:
// Node built-ins only, JSON on standard output. Run it from the project (or pass --project).
//
//   canvas comments list [--open] [--batch <id>]       comments as JSON (open: pending)
//   canvas comments wait [--timeout <s>]               blocks until a batch is sent, then prints it with its comments
//                                                      ("Waiting for a batch." on standard error once it is listening)
//   canvas comments take <batchId> [--by <who>]        takes a sent batch and prints it with its comments
//   canvas comments reply <id> "<text>" [--addressed]  replies as the agent; --addressed marks it acknowledged
//   canvas comments done <batchId>                     the batch is worked through
//
// Exit codes: 0 done, 1 an error, 2 `wait` timed out with no batch.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readConfig, viewerLink } from './canvas-format.mjs';
import { findProject } from './lib/viewer-server.mjs';
import { expandBatch, finishBatch, readBatch, readComments, replyToComment, takeBatch, waitForBatch } from './lib/comment-store.mjs';

export const COMMENTS_USAGE = `Usage:
  canvas comments list [--open] [--batch <id>]
  canvas comments wait [--timeout <seconds>]
  canvas comments take <batchId> [--by <harness/session>]
  canvas comments reply <id> "<text>" [--addressed]
  canvas comments done <batchId>
Options: --project <dir> (default: the folder with canvas.config.json at or above this one)`;

/**
 * Who is taking a batch: --by, else CANVAS_SESSION, else the harness and session the environment names. The
 * innermost harness wins: a Codex session started from inside Claude Code inherits CLAUDECODE, so Codex's own
 * session variables (CODEX_THREAD_ID, CODEX_SESSION_ID, which Codex sets for the commands of a session) are
 * checked first. Other CODEX_* variables (CODEX_HOME, a Claude Code plugin's CODEX_COMPANION_SESSION_ID) do
 * not make a session a Codex one.
 */
export function sessionName(env = process.env) {
  if (env.CANVAS_SESSION) return env.CANVAS_SESSION;
  const codex = env.CODEX_THREAD_ID || env.CODEX_SESSION_ID;
  if (codex) return `codex/${codex}`;
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return `claude-code/${env.CLAUDE_CODE_SESSION_ID || `pid-${process.ppid}`}`;
  return `agent/pid-${process.ppid}`;
}

/** The loopback origin of the viewer that recorded a comment (its `url`), or null. */
function recordedOrigin(url) {
  try {
    const u = new URL(url);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch { return null; }
}

const print = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

/**
 * Adds each comment's viewer link, so an agent can name the board it changed. The link points at the viewer that
 * recorded the comment (the origin of its `url`, any port), and at the config's port only when it has none.
 */
async function withLinks(projectRoot, comments) {
  let port = null;
  try { port = (await readConfig(projectRoot)).port; } catch { /* links without an origin */ }
  return comments.map((c) => {
    if (!c?.canvas?.canvas) return c;
    let link = null;
    try { link = viewerLink({ canvas: c.canvas.canvas, page: c.canvas.page === '-' ? null : c.canvas.page, board: `${c.canvas.board}.dc.html` }); } catch { link = null; }
    const origin = recordedOrigin(c.url) ?? (port ? `http://127.0.0.1:${port}` : '');
    return link ? { ...c, link: `${origin}${link}` } : c;
  });
}

export async function main(argv, { env = process.env } = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv, allowPositionals: true, strict: true,
      options: { project: { type: 'string' }, open: { type: 'boolean' }, batch: { type: 'string' }, timeout: { type: 'string' }, addressed: { type: 'boolean' }, by: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    });
  } catch (error) {
    console.error(`${error.message}\n${COMMENTS_USAGE}`);
    return 1;
  }
  const { values: o, positionals: [sub, ...rest] } = parsed;
  if (o.help || !sub) { console.log(COMMENTS_USAGE); return sub || o.help ? 0 : 1; }
  const projectRoot = o.project ? path.resolve(o.project) : findProject();
  if (!projectRoot) { console.error('No canvas.config.json in this folder or above it. Pass --project <dir>.'); return 1; }
  try {
    if (sub === 'list') {
      let { comments, problems } = await readComments(projectRoot);
      if (o.open) comments = comments.filter((c) => c?.status === 'pending');
      if (o.batch) {
        const batch = await readBatch(projectRoot, o.batch);
        comments = comments.filter((c) => batch.comments.includes(c?.id));
      }
      for (const p of problems) console.error(`${p.file}: ${p.issues.join('; ')}`);
      print(await withLinks(projectRoot, comments));
      return 0;
    }
    if (sub === 'wait') {
      let timeoutMs = 0;
      if (o.timeout !== undefined) {
        const s = Number(o.timeout);
        if (!Number.isFinite(s) || s < 0) throw new Error('--timeout takes seconds');
        timeoutMs = Math.round(s * 1000);
      }
      // Standard error says when it is listening, so a script can start the person's side only then.
      const batch = await waitForBatch(projectRoot, { timeoutMs, onWaiting: () => process.stderr.write('Waiting for a batch.\n') });
      if (!batch) { console.error('No batch was sent before the timeout.'); return 2; }
      const full = await expandBatch(projectRoot, batch);
      print({ ...full, annotations: await withLinks(projectRoot, full.annotations) });
      return 0;
    }
    if (sub === 'take' || sub === 'done') {
      const [id] = rest;
      if (!id || rest.length > 1) throw new Error(`comments ${sub} takes one batch id`);
      const batch = sub === 'take' ? await takeBatch(projectRoot, id, o.by ?? sessionName(env)) : await finishBatch(projectRoot, id);
      const full = await expandBatch(projectRoot, batch);
      print(sub === 'take' ? { ...full, annotations: await withLinks(projectRoot, full.annotations) } : batch);
      return 0;
    }
    if (sub === 'reply') {
      const [id, text, ...extra] = rest;
      if (!id || text === undefined || extra.length) throw new Error('comments reply takes <id> "<text>"');
      print(await replyToComment(projectRoot, id, { role: 'agent', content: text, addressed: !!o.addressed }));
      return 0;
    }
    throw new Error(`Unknown comments command ${sub}`);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

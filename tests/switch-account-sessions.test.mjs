import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test, { afterEach, beforeEach } from "node:test"

const script = path.resolve("metamodern-switch-account/scripts/sessions.py")
const OLD = "aaaa1111-0000-0000-0000-000000000000/org-old"
const NEW = "bbbb2222-0000-0000-0000-000000000000/org-new"
const day = 86400000
let root
let env

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "metamodern-switch-account-"))
  env = {
    ...process.env,
    METAMODERN_SESSIONS_ROOT: path.join(root, "sessions"),
    METAMODERN_CLAUDE_DIR: path.join(root, "claude"),
    METAMODERN_CLAUDE_JSON: path.join(root, "claude.json"),
    METAMODERN_STATE_DIR: path.join(root, "state"),
  }
  await fs.mkdir(path.join(root, "sessions", OLD), { recursive: true })
  await fs.mkdir(path.join(root, "sessions", NEW), { recursive: true })
  await fs.writeFile(env.METAMODERN_CLAUDE_JSON, JSON.stringify({
    oauthAccount: { accountUuid: NEW.split("/")[0], organizationUuid: "org-new", emailAddress: "new@example.com" },
  }))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function session(account, id, { cwd, title, ago, transcript = true }) {
  const body = { sessionId: `local_${id}`, cliSessionId: `cli-${id}`, cwd, title, lastActivityAt: Date.now() - ago * day }
  const file = path.join(root, "sessions", account, `local_${id}.json`)
  await fs.writeFile(file, JSON.stringify(body))
  if (transcript) {
    const dir = path.join(root, "claude", "projects", cwd.replace(/[/.]/g, "-"))
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, `cli-${id}.jsonl`), "{}\n")
  }
  return file
}

function run(...args) {
  return spawnSync("python3", ["-I", script, ...args], { encoding: "utf8", env })
}

const listed = async (account) => (await fs.readdir(path.join(root, "sessions", account))).filter((f) => f.startsWith("local_")).sort()

test("SA-01 accounts marks the signed-in account and shows newest titles", async () => {
  await session(OLD, "1", { cwd: "/w/app", title: "Homepage canvases", ago: 1 })
  const result = run("accounts")
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, new RegExp(`${NEW}  <- signed in now \\(new@example.com\\)`))
  assert.match(result.stdout, /Homepage canvases/)
})

test("SA-02 copies missing sessions only, skips ones without a transcript, and never overwrites", async () => {
  await session(OLD, "1", { cwd: "/w/app", title: "New work", ago: 1 })
  await session(OLD, "2", { cwd: "/w/app", title: "Gone transcript", ago: 1, transcript: false })
  await session(OLD, "3", { cwd: "/w/site", title: "Shared, continued there", ago: 1 })
  const mine = await session(NEW, "3", { cwd: "/w/site", title: "Shared, continued there", ago: 9 })
  const before = await fs.readFile(mine, "utf8")

  const dry = run("copy", "aaaa", "current", "--dry-run")
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /1 to copy; 1 already there; 0 outside .* 1 with no transcript/)
  assert.match(dry.stdout, /Continued in the other account since: "Shared, continued there"/)
  assert.deepEqual(await listed(NEW), ["local_3.json"])

  const real = run("copy", "aaaa", "current")
  assert.equal(real.status, 0, real.stderr)
  assert.deepEqual(await listed(NEW), ["local_1.json", "local_3.json"])
  assert.equal(await fs.readFile(mine, "utf8"), before)
  assert.deepEqual(await listed(OLD), ["local_1.json", "local_2.json", "local_3.json"])
})

test("SA-03 scopes by days and by folder, including sibling folders and worktrees", async () => {
  await session(OLD, "1", { cwd: "/w/caelo-design", title: "Recent sibling", ago: 1 })
  await session(OLD, "2", { cwd: "/w/caelo/.claude/worktrees/x", title: "Recent worktree", ago: 2 })
  await session(OLD, "3", { cwd: "/w/caelo", title: "Old", ago: 30 })
  await session(OLD, "4", { cwd: "/w/caelonia", title: "Similar name", ago: 1 })
  await session(OLD, "5", { cwd: "/w/other", title: "Other project", ago: 1 })
  const result = run("copy", "aaaa", "current", "--since", "7", "--folder", "/w/caelo")
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(await listed(NEW), ["local_1.json", "local_2.json"])
})

test("SA-04 a filter file matches folders and titles", async () => {
  await session(OLD, "1", { cwd: "/w/agency", title: "Deck", ago: 1 })
  await session(OLD, "2", { cwd: "/w/misc", title: "Oxford Road presentation", ago: 1 })
  await session(OLD, "3", { cwd: "/w/misc", title: "Groceries", ago: 1 })
  const filter = path.join(root, "filter.txt")
  await fs.writeFile(filter, "# mine\n/w/agency\ntitle: \\boxford road\n")
  const result = run("copy", "aaaa", "current", "--filter", filter)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(await listed(NEW), ["local_1.json", "local_2.json"])
})

test("SA-05 undo removes untouched copies and keeps ones used since", async () => {
  await session(OLD, "1", { cwd: "/w/app", title: "Untouched", ago: 1 })
  await session(OLD, "2", { cwd: "/w/app", title: "Used here", ago: 1 })
  await session(NEW, "9", { cwd: "/w/app", title: "Already mine", ago: 1 })
  assert.equal(run("copy", "aaaa", "current").status, 0)
  await fs.appendFile(path.join(root, "sessions", NEW, "local_2.json"), " ")

  const undo = run("undo", "current")
  assert.equal(undo.status, 0, undo.stderr)
  assert.match(undo.stdout, /Removed 1 copied sessions\. Kept 1/)
  assert.deepEqual(await listed(NEW), ["local_2.json", "local_9.json"])

  assert.equal(run("undo", "current", "--force").status, 0)
  assert.deepEqual(await listed(NEW), ["local_9.json"])
})

test("SA-06 refuses ambiguous or identical accounts", async () => {
  assert.notEqual(run("copy", "nope", "current").status, 0)
  assert.match(run("copy", "bbbb", "current").stderr, /same account folder/)
})

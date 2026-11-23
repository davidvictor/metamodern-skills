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
    METAMODERN_DESKTOP_CONFIG: path.join(root, "desktop-config.json"),
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
  const body = { sessionId: `local_${id}`, cliSessionId: `cli-${id}`, cwd, title, lastActivityAt: Date.now() - ago * day, bridgeSessionIds: [`session_${id}`] }
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
  const copied = JSON.parse(await fs.readFile(path.join(root, "sessions", NEW, "local_1.json"), "utf8"))
  assert.equal(copied.cliSessionId, "cli-1")
  assert.deepEqual(copied.bridgeSessionIds, [])
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

test("SA-06 undo keeps one record per session when a session is copied again", async () => {
  const source = await session(OLD, "1", { cwd: "/w/app", title: "Copied twice", ago: 1 })
  const copy = path.join(root, "sessions", NEW, "local_1.json")
  const logFile = path.join(root, "state", `${NEW.replace("/", "_")}.tsv`)
  assert.equal(run("copy", "aaaa", "current").status, 0)
  await fs.appendFile(copy, " ")
  assert.match(run("undo", "current").stdout, /Kept 1/)
  const first = await fs.readFile(logFile, "utf8")
  assert.equal(first.trim().split("\n").length, 1)
  await fs.rm(copy)
  await fs.writeFile(source, JSON.stringify({ ...JSON.parse(await fs.readFile(source, "utf8")), title: "Copied twice, renamed" }))
  assert.equal(run("copy", "aaaa", "current").status, 0)
  const second = await fs.readFile(logFile, "utf8")
  assert.equal(second.trim().split("\n").length, 1)
  assert.notEqual(second.split("\t")[2], first.split("\t")[2])
  assert.match(run("undo", "current").stdout, /Removed 1 copied sessions\./)
  assert.deepEqual(await listed(NEW), [])
})

test("SA-07 current follows the desktop app's account when Claude Code is signed in elsewhere", async () => {
  await fs.writeFile(env.METAMODERN_DESKTOP_CONFIG, JSON.stringify({ lastKnownAccountUuid: OLD.split("/")[0] }))
  await session(OLD, "1", { cwd: "/w/app", title: "Desktop account work", ago: 1 })
  const result = run("accounts")
  assert.match(result.stdout, new RegExp(`${OLD}  <- signed in now\n`))
  assert.match(run("copy", "bbbb", "current", "--dry-run").stdout, new RegExp(`To   ${OLD}`))
})

test("SA-08 refuses ambiguous or identical accounts", async () => {
  assert.notEqual(run("copy", "nope", "current").status, 0)
  assert.match(run("copy", "bbbb", "current").stderr, /same account folder/)
})

const THIRD = "cccc3333-0000-0000-0000-000000000000/org-third"
const UNUSED = "aaaa1111-0000-0000-0000-000000000000/org-unused"
const read = async (account, id) => JSON.parse(await fs.readFile(path.join(root, "sessions", account, `local_${id}.json`), "utf8"))

test("SA-09 sync fills every list from the others with each session's freshest entry", async () => {
  await fs.mkdir(path.join(root, "sessions", THIRD), { recursive: true })
  await fs.mkdir(path.join(root, "sessions", UNUSED), { recursive: true })
  await session(OLD, "1", { cwd: "/w/app", title: "Only in old", ago: 1 })
  await session(OLD, "2", { cwd: "/w/app", title: "Gone transcript", ago: 3, transcript: false })
  await session(OLD, "5", { cwd: "/w/site", title: "Stale copy", ago: 5 })
  const mine = await session(NEW, "3", { cwd: "/w/app", title: "Shared", ago: 2 })
  const before = await fs.readFile(mine, "utf8")
  await session(THIRD, "3", { cwd: "/w/app", title: "Shared, used later", ago: 0.5 })
  await session(THIRD, "4", { cwd: "/w/site", title: "Only in third", ago: 1 })
  await session(THIRD, "5", { cwd: "/w/site", title: "Fresh copy", ago: 1 })

  const dry = run("sync", "--dry-run")
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /Syncing 3 session lists \(5 sessions in all\)\. Left out 1 empty list/)
  assert.match(dry.stdout, new RegExp(`Into ${NEW}  <- signed in now\\n[\\s\\S]*?3 to copy; 1 already there; 0 outside .* 1 with no transcript`))
  assert.match(dry.stdout, /Used later in cccc3333: "Shared, used later"/)
  assert.match(dry.stdout, /Dry run: nothing copied\./)
  assert.deepEqual(await listed(NEW), ["local_3.json"])

  const real = run("sync")
  assert.equal(real.status, 0, real.stderr)
  assert.match(real.stdout, /Quit the Claude app completely/)
  assert.deepEqual(await listed(OLD), ["local_1.json", "local_2.json", "local_3.json", "local_4.json", "local_5.json"])
  assert.deepEqual(await listed(NEW), ["local_1.json", "local_3.json", "local_4.json", "local_5.json"])
  assert.deepEqual(await listed(THIRD), ["local_1.json", "local_3.json", "local_4.json", "local_5.json"])
  assert.deepEqual(await listed(UNUSED), [])
  assert.equal((await read(NEW, "5")).title, "Fresh copy")
  assert.equal((await read(OLD, "3")).title, "Shared, used later")
  assert.equal((await read(OLD, "5")).title, "Stale copy")
  assert.equal(await fs.readFile(mine, "utf8"), before)
  assert.deepEqual((await read(NEW, "1")).bridgeSessionIds, [])

  assert.match(run("sync").stdout, /Every list already has every session\./)
  const undo = run("undo", "current")
  assert.match(undo.stdout, /Removed 3 copied sessions\./)
  assert.deepEqual(await listed(NEW), ["local_3.json"])
  assert.deepEqual(await listed(THIRD), ["local_1.json", "local_3.json", "local_4.json", "local_5.json"])
})

test("SA-10 sync takes the copy options, and refuses when only one list has sessions", async () => {
  assert.match(run("sync").stderr, /nothing to sync/)
  await session(OLD, "1", { cwd: "/w/app", title: "Recent app", ago: 1 })
  await session(OLD, "2", { cwd: "/w/other", title: "Recent other", ago: 1 })
  await session(OLD, "3", { cwd: "/w/app", title: "Old app", ago: 30 })
  await session(OLD, "4", { cwd: "/w/app", title: "Gone transcript", ago: 1, transcript: false })
  const result = run("sync", "--since", "7", "--folder", "/w/app", "--include-empty")
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /2 to copy; 0 already there; 2 outside .* 1 with no transcript on this Mac \(copied anyway\)/)
  assert.deepEqual(await listed(NEW), ["local_1.json", "local_4.json"])
})

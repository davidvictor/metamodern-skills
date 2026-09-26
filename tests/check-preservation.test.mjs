import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test, { afterEach, beforeEach } from "node:test"

const checker = path.resolve("metamodern-refine-writing/scripts/check-preservation.mjs")
let root

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "metamodern-preservation-"))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function check(source, revised) {
  const sourcePath = path.join(root, "source.md")
  const revisedPath = path.join(root, "revised.md")
  await fs.writeFile(sourcePath, source)
  await fs.writeFile(revisedPath, revised)
  return spawnSync(process.execPath, [checker, "--source", sourcePath, "--revised", revisedPath, "--json", "--show-values"], { encoding: "utf8" })
}

test("permits prose edits that preserve protected anchors", async () => {
  const source = "---\ntitle: Note\n---\n\nShip `v1.2.0` by 2026-09-26. [Plan](https://example.com/plan)\n\n> Keep the line.\n"
  const revised = "---\ntitle: Note\n---\n\nPlease ship `v1.2.0` by 2026-09-26. [Plan](https://example.com/plan)\n\n> Keep the line.\n"
  const result = await check(source, revised)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(JSON.parse(result.stdout).status, "pass")
})

test("reports removed and invented protected anchors", async () => {
  const result = await check("Budget is $120.\n", "Budget is $180.\n")
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "fail")
  assert.equal(report.summary.missing, 1)
  assert.equal(report.summary.added, 1)
  assert.equal(report.missing[0].type, "number")
})

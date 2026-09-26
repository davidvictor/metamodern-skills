import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test, { afterEach, beforeEach } from "node:test"
import { validateSkillCollection } from "../scripts/lib/skill-collection-validator.mjs"

const publicSkillsRoot = path.resolve(".")
let root

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "metamodern-public-collection-"))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function makePackage(name, version = "1.0.0") {
  const packageRoot = path.join(root, name)
  await fs.mkdir(path.join(packageRoot, "agents"), { recursive: true })
  await fs.writeFile(path.join(packageRoot, "SKILL.md"), `---\nname: ${name}\ndescription: Use when testing a catalog entry.\n---\n`)
  await fs.writeFile(path.join(packageRoot, "PACKAGE_ID"), `${name}:metamodern-agency\n`)
  await fs.writeFile(path.join(packageRoot, "PACKAGE_VERSION"), `${name}@${version}\n`)
  await fs.writeFile(path.join(packageRoot, "agents", "openai.yaml"), `interface:\n  display_name: "Metamodern: Test"\n  default_prompt: "Use $${name}."\n`)
}

function entry(name, version = "1.0.0") {
  return { category: "testing", name, path: name, summary: `Test package ${name}.`, version }
}

async function writeCollection(entries) {
  await fs.writeFile(path.join(root, "catalog.json"), `${JSON.stringify({ schemaVersion: 1, collectionVersion: "1.0.0", skills: entries }, null, 2)}\n`)
  const table = entries.map((item) => `| [${item.name}](./${item.path}/SKILL.md) | $${item.name} | ${item.summary} |`).join("\n")
  await fs.writeFile(path.join(root, "README.md"), `# Test collection\n\n${table}\n`)
}

test("the published collection validates after package material is present", async () => {
  assert.deepEqual(await validateSkillCollection(publicSkillsRoot), [])
})

test("rejects catalog and package drift", async () => {
  await makePackage("metamodern-one")
  await makePackage("metamodern-two")
  await writeCollection([entry("metamodern-one"), entry("metamodern-missing")])

  const issues = (await validateSkillCollection(root)).join("\n")
  assert.match(issues, /metamodern-two.*missing from catalog/i)
  assert.match(issues, /metamodern-missing.*package directory is missing/i)
})

test("rejects a package version that diverges from the catalog", async () => {
  await makePackage("metamodern-one", "1.1.0")
  await writeCollection([entry("metamodern-one", "1.0.0")])

  assert.match((await validateSkillCollection(root)).join("\n"), /catalog version.*PACKAGE_VERSION/i)
})

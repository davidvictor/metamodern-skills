import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test, { afterEach, beforeEach } from "node:test"
import { validateSkillPackage } from "../scripts/lib/skill-package-validator.mjs"

let root

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "metamodern-public-skill-"))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function write(relativePath, content) {
  const destination = path.join(root, relativePath)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(destination, content, "utf8")
}

async function makeCanonicalPackage(name = "metamodern-example") {
  const packageRoot = path.join(root, name)
  await fs.mkdir(path.join(packageRoot, "agents"), { recursive: true })
  await fs.writeFile(
    path.join(packageRoot, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when testing a portable skill package.\n---\n\n# Example\n`,
  )
  await fs.writeFile(path.join(packageRoot, "PACKAGE_ID"), `${name}:metamodern-agency\n`)
  await fs.writeFile(path.join(packageRoot, "PACKAGE_VERSION"), `${name}@1.0.0\n`)
  await fs.writeFile(
    path.join(packageRoot, "agents", "openai.yaml"),
    `interface:\n  display_name: "Metamodern: Example"\n  default_prompt: "Use $${name}."\n`,
  )
  return packageRoot
}

test("accepts a portable canonical package", async () => {
  const packageRoot = await makeCanonicalPackage()
  assert.deepEqual(await validateSkillPackage(packageRoot), [])
})

test("rejects a non-portable machine path", async () => {
  const packageRoot = await makeCanonicalPackage()
  await write("metamodern-example/references/private.md", "Read /Users/example/private.md.\n")
  assert.match((await validateSkillPackage(packageRoot)).join("\n"), /machine-specific path/i)
})

test("rejects a malformed canonical package identity", async () => {
  const packageRoot = await makeCanonicalPackage()
  await fs.writeFile(path.join(packageRoot, "PACKAGE_ID"), "metamodern-example:wrong\n")
  assert.match((await validateSkillPackage(packageRoot)).join("\n"), /PACKAGE_ID/i)
})

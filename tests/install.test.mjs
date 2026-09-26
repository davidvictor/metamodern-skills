import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test, { afterEach, beforeEach } from "node:test"

const collectionRoot = path.resolve(".")
const installer = path.join(collectionRoot, "install.sh")

let root
let sourceRoot
let installHome
let runner

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "metamodern-public-install-"))
  sourceRoot = path.join(root, "source")
  installHome = path.join(root, "install-home")
  runner = path.join(root, "fake-skills-runner.mjs")
  await fs.mkdir(sourceRoot)
  await fs.mkdir(installHome)
  await fs.writeFile(
    runner,
    `#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"
const packageDir = process.argv[3]
const name = path.basename(packageDir)
const installHome = process.env.METAMODERN_INSTALL_HOME
const shared = path.join(installHome, ".agents", "skills", name)
const claudeRoot = path.join(installHome, ".claude", "skills")
const claude = path.join(claudeRoot, name)
await fs.rm(shared, { recursive: true, force: true })
await fs.mkdir(path.dirname(shared), { recursive: true })
await fs.cp(packageDir, shared, { recursive: true })
await fs.mkdir(claudeRoot, { recursive: true })
await fs.rm(claude, { recursive: true, force: true })
await fs.symlink(path.relative(claudeRoot, shared), claude)
`,
    { mode: 0o755 },
  )
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function makePackage(name, version = "1.0.0") {
  const packageRoot = path.join(sourceRoot, name)
  await fs.mkdir(path.join(packageRoot, "agents"), { recursive: true })
  await fs.writeFile(path.join(packageRoot, "SKILL.md"), `---\nname: ${name}\ndescription: Use when testing installer behavior.\n---\n\n# Test\n`)
  await fs.writeFile(path.join(packageRoot, "PACKAGE_ID"), `${name}:metamodern-agency\n`)
  await fs.writeFile(path.join(packageRoot, "PACKAGE_VERSION"), `${name}@${version}\n`)
  await fs.writeFile(path.join(packageRoot, "agents", "openai.yaml"), `interface:\n  display_name: "Metamodern: Test"\n  default_prompt: "Use $${name}."\n`)
}

async function writeCatalog() {
  const names = (await fs.readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("metamodern-"))
    .map((entry) => entry.name)
    .sort()
  const skills = await Promise.all(names.map(async (name) => {
    const version = (await fs.readFile(path.join(sourceRoot, name, "PACKAGE_VERSION"), "utf8")).trim().slice(name.length + 1)
    return { category: "testing", name, path: name, summary: `Test package ${name}.`, version }
  }))
  await fs.writeFile(path.join(sourceRoot, "catalog.json"), `${JSON.stringify({ schemaVersion: 1, collectionVersion: "1.0.0", skills }, null, 2)}\n`)
  const rows = skills.map(({ name }) => `| [${name}](./${name}/SKILL.md) | $${name} | Test package |`).join("\n")
  await fs.writeFile(path.join(sourceRoot, "README.md"), `# Test collection\n\n${rows}\n`)
}

function runInstaller(args = [], options = {}) {
  return spawnSync("bash", [installer, ...args], {
    cwd: options.cwd ?? collectionRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      METAMODERN_INSTALL_HOME: installHome,
      METAMODERN_SKILLS_SOURCE_ROOT: sourceRoot,
      METAMODERN_SKILLS_RUNNER: options.runner ?? runner,
      METAMODERN_RETIRE_DATE: "2026-09-26",
    },
  })
}

async function ready(...names) {
  for (const name of names) await makePackage(name)
  await writeCatalog()
}

test("installs a selected package only and preserves Codex-Claude parity", async () => {
  await ready("metamodern-one", "metamodern-two")
  const result = runInstaller(["--skill", "metamodern-two"])
  assert.equal(result.status, 0, result.stderr || result.stdout)

  const shared = path.join(installHome, ".agents", "skills", "metamodern-two")
  assert.equal(await fs.readFile(path.join(shared, "PACKAGE_ID"), "utf8"), "metamodern-two:metamodern-agency\n")
  assert.equal(await fs.realpath(path.join(installHome, ".claude", "skills", "metamodern-two")), await fs.realpath(shared))
  await assert.rejects(fs.stat(path.join(installHome, ".agents", "skills", "metamodern-one")), /ENOENT/)
})

test("local install, update, and reinstall preserve external personal and project prompt knowledge", async () => {
  const name = "metamodern-shape-prompt"
  await ready(name)
  const project = path.join(root, "project")
  const knowledgeRoots = [installHome, project].map((base) => path.join(base, ".metamodern", "prompt-knowledge"))
  const snapshots = []
  for (const [scope, knowledgeRoot] of knowledgeRoots.entries()) {
    const files = new Map([
      ["index.md", Buffer.from(`# Knowledge ${scope}\r\n\r\nKeep exact whitespace.  \r\n`)],
      [path.join("domains", "writing.md"), Buffer.from(`# Writing ${scope}\n\nPreserve café and “quoted” text.\n`)],
      [path.join("domains", "research.md"), Buffer.from(`# Research ${scope}\nNo final newline`)],
    ])
    await fs.mkdir(path.join(knowledgeRoot, "domains"), { recursive: true })
    for (const [relativePath, bytes] of files) await fs.writeFile(path.join(knowledgeRoot, relativePath), bytes)
    snapshots.push({ knowledgeRoot, files, entries: (await fs.readdir(knowledgeRoot, { recursive: true })).sort() })
  }

  const source = path.join(sourceRoot, name)
  const shared = path.join(installHome, ".agents", "skills", name)
  for (const stage of ["initial install", "update", "reinstall"]) {
    if (stage === "update") {
      await makePackage(name, "1.1.0")
      await fs.appendFile(path.join(source, "SKILL.md"), "\nUpdated package instructions.\n")
      await writeCatalog()
    }
    const result = runInstaller(["--skill", name], { cwd: project })
    assert.equal(result.status, 0, `${stage}: ${result.stderr || result.stdout}`)
    assert.equal(await fs.readFile(path.join(shared, "PACKAGE_VERSION"), "utf8"), `${name}@${stage === "initial install" ? "1.0.0" : "1.1.0"}\n`)
    assert.deepEqual(await fs.readFile(path.join(shared, "SKILL.md")), await fs.readFile(path.join(source, "SKILL.md")), stage)
    assert.equal(await fs.realpath(path.join(installHome, ".claude", "skills", name)), await fs.realpath(shared))
    // Exact package parity also detects knowledge copied into the installed package.
    assert.deepEqual((await fs.readdir(shared, { recursive: true })).sort(), (await fs.readdir(source, { recursive: true })).sort(), stage)
    for (const { knowledgeRoot, files, entries } of snapshots) {
      assert.deepEqual((await fs.readdir(knowledgeRoot, { recursive: true })).sort(), entries, stage)
      for (const [relativePath, bytes] of files) {
        assert.deepEqual(await fs.readFile(path.join(knowledgeRoot, relativePath)), bytes, `${stage}: ${knowledgeRoot}/${relativePath}`)
      }
    }
  }
})

test("ordinary local installation does not create personal or project prompt knowledge", async () => {
  await ready("metamodern-shape-prompt")
  const project = path.join(root, "project")
  await fs.mkdir(project)

  const result = runInstaller([], { cwd: project })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  for (const base of [installHome, project]) {
    await assert.rejects(fs.lstat(path.join(base, ".metamodern", "prompt-knowledge")), /ENOENT/)
  }
})

test("refuses an unknown selection before altering an installation", async () => {
  await ready("metamodern-one")
  const result = runInstaller(["--skill", "metamodern-missing"])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unknown Metamodern skill/i)
  await assert.rejects(fs.stat(path.join(installHome, ".agents")), /ENOENT/)
})

test("refuses an unrelated installed package collision", async () => {
  await ready("metamodern-one")
  const collision = path.join(installHome, ".agents", "skills", "metamodern-one")
  await fs.mkdir(collision, { recursive: true })
  await fs.writeFile(path.join(collision, "SKILL.md"), "unrelated\n")

  const result = runInstaller()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unrelated skill path/i)
  assert.equal(await fs.readFile(path.join(collision, "SKILL.md"), "utf8"), "unrelated\n")
})

test("retires owned prompt aliases only after the replacement installs", async () => {
  await ready("metamodern-shape-prompt")
  const legacyName = "metamodern-expand-intent"
  const legacy = path.join(installHome, ".agents", "skills", legacyName)
  const claudeRoot = path.join(installHome, ".claude", "skills")
  await fs.mkdir(legacy, { recursive: true })
  await fs.writeFile(path.join(legacy, "SKILL.md"), `---\nname: ${legacyName}\ndescription: Use when testing a legacy package.\n---\n`)
  await fs.writeFile(path.join(legacy, "PACKAGE_ID"), `${legacyName}:metamodern-agency\n`)
  await fs.mkdir(claudeRoot, { recursive: true })
  await fs.symlink(path.relative(claudeRoot, legacy), path.join(claudeRoot, legacyName))

  const result = runInstaller()
  assert.equal(result.status, 0, result.stderr || result.stdout)
  await assert.rejects(fs.stat(legacy), /ENOENT/)
  await assert.rejects(fs.lstat(path.join(claudeRoot, legacyName)), /ENOENT/)
  assert.equal(
    await fs.readFile(path.join(installHome, ".agents", "retired-skills", "2026-09-26", legacyName, "PACKAGE_ID"), "utf8"),
    `${legacyName}:metamodern-agency\n`,
  )
})

test("keeps an owned legacy package when replacement installation fails", async () => {
  await ready("metamodern-shape-prompt")
  const legacyName = "metamodern-articulate-intent"
  const legacy = path.join(installHome, ".agents", "skills", legacyName)
  await fs.mkdir(legacy, { recursive: true })
  await fs.writeFile(path.join(legacy, "SKILL.md"), `---\nname: ${legacyName}\ndescription: Use when testing a legacy package.\n---\n`)
  await fs.writeFile(path.join(legacy, "PACKAGE_ID"), `${legacyName}:metamodern-agency\n`)
  const failingRunner = path.join(root, "failing-runner.mjs")
  await fs.writeFile(failingRunner, "#!/usr/bin/env node\nprocess.stderr.write('simulated failure\\n')\nprocess.exit(1)\n", { mode: 0o755 })

  const result = runInstaller([], { runner: failingRunner })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /simulated failure/i)
  assert.equal(await fs.readFile(path.join(legacy, "PACKAGE_ID"), "utf8"), `${legacyName}:metamodern-agency\n`)
  await assert.rejects(fs.stat(path.join(installHome, ".agents", "retired-skills", "2026-09-26", legacyName)), /ENOENT/)
})

test("the public collection installs every canonical package with verified parity", async () => {
  sourceRoot = collectionRoot
  const result = runInstaller()
  assert.equal(result.status, 0, result.stderr || result.stdout)

  const catalog = JSON.parse(await fs.readFile(path.join(collectionRoot, "catalog.json"), "utf8"))
  for (const { name } of catalog.skills) {
    const source = path.join(sourceRoot, name)
    const shared = path.join(installHome, ".agents", "skills", name)
    assert.equal(await fs.realpath(path.join(installHome, ".claude", "skills", name)), await fs.realpath(shared))
    assert.deepEqual((await fs.readdir(shared, { recursive: true })).sort(), (await fs.readdir(source, { recursive: true })).sort())
  }
})

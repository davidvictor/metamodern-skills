import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import test, { afterEach, beforeEach } from "node:test"

const installer = path.resolve("metamodern-configure-engineering/scripts/configure-engineering.py")
let sandbox, root

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "metamodern-engineering-"))
  root = path.join(sandbox, "project")
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, "AGENTS.md"), "# Project instructions\n\nKeep this project-specific prose.\n")
  await fs.writeFile(path.join(root, "README.md"), "# Example project\n\nExisting setup and checks remain authoritative.\n")
})

afterEach(async () => fs.rm(sandbox, { recursive: true, force: true }))

function python(script, args = []) {
  return spawnSync("python3", ["-B", script, "--project", root, ...args], { encoding: "utf8" })
}

function success(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result
}

async function write(relative, contents) {
  const filename = path.join(root, relative)
  await fs.mkdir(path.dirname(filename), { recursive: true })
  await fs.writeFile(filename, contents)
}

async function snapshot(directory = root) {
  const files = {}
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    const relative = path.relative(root, filename)
    if (entry.isSymbolicLink()) files[relative] = `symlink:${await fs.readlink(filename)}`
    else if (entry.isDirectory()) Object.assign(files, await snapshot(filename))
    else files[relative] = createHash("sha256").update(await fs.readFile(filename)).digest("hex")
  }
  return files
}

async function availability({ low = ["gpt-6.1-luna", "gpt-6-luna"], omit = [] } = {}) {
  const models = (ids) => ids.filter(id => !omit.includes(id)).map(id => ({ id, reasoning_efforts: ["low", "medium", "high"] }))
  const filename = path.join(sandbox, "availability.json")
  await fs.writeFile(filename, JSON.stringify({
    source: "test-provider-discovery",
    verified_at: new Date().toISOString(),
    providers: {
      codex: { source: "test-codex-catalog", verified_at: new Date().toISOString(), models: models(["gpt-6.1-sol", ...low]) },
      "claude-code": { source: "test-claude-catalog", verified_at: new Date().toISOString(), models: models(["claude-opus-5-5", "claude-sonnet-5"]) },
    },
  }))
  return ["--availability", filename]
}

async function apply(args = []) { return success(python(installer, ["--apply", ...args])) }
function check(args = []) { return python(path.join(root, "scripts/check-engineering.py"), args) }

// Inspect native TOML independently of the generated checker.
function nativeCodex() {
  const result = spawnSync("python3", ["-c", "import json,pathlib,sys,tomllib; p=pathlib.Path(sys.argv[1]); print(json.dumps({'config':tomllib.loads((p/'.codex/config.toml').read_text()),'roles':{f.stem:tomllib.loads(f.read_text()) for f in (p/'.codex/agents').glob('*.toml')}}))", root], { encoding: "utf8" })
  success(result)
  return JSON.parse(result.stdout)
}

test("default dry run describes the plan without creating or changing files", async () => {
  const before = await snapshot()
  success(python(installer, await availability()))
  assert.deepEqual(await snapshot(), before)
})

test("install works without an application and records root, lead, and 17 native role configurations", async () => {
  await apply(await availability())
  const native = nativeCodex()
  assert.equal(native.config.model, "gpt-6.1-sol")
  assert.equal(native.config.model_reasoning_effort, "high")
  assert.equal(native.roles.default.model_reasoning_effort, "medium")
  assert.equal(native.config.agents.default_subagent_model, "gpt-6.1-sol")
  assert.equal(native.config.agents.default_subagent_reasoning_effort, "medium")
  assert.equal(Object.keys(native.roles).filter(role => role !== "default").length, 17)
  assert.equal(native.roles.explorer.model, "gpt-6.1-luna")
  assert.equal(native.roles.explorer.model_reasoning_effort, "low")
  assert.equal(native.roles.worker.model, "gpt-6.1-sol")
  assert.equal(native.roles.worker.model_reasoning_effort, "medium")
  assert.equal(native.roles.reviewer.model_reasoning_effort, "high")
  const lead = await fs.readFile(path.join(root, "AGENTS.md"), "utf8")
  assert.match(lead, /gpt-6\.1-sol/)
  assert.match(lead, /claude-opus-5-5/)
  assert.match(lead, /high/)
  const claude = await fs.readFile(path.join(root, ".claude/agents/explorer.md"), "utf8")
  assert.match(claude, /claude-sonnet-5/)
  assert.match(claude, /low/)
  const claudeDefault = await fs.readFile(path.join(root, ".claude/agents/general-purpose.md"), "utf8")
  assert.match(claudeDefault, /^model: claude-opus-5-5$/m)
  assert.match(claudeDefault, /^effort: medium$/m)
  const claudeSettings = JSON.parse(await fs.readFile(path.join(root, ".claude/settings.json"), "utf8"))
  assert.equal(claudeSettings.model, "claude-opus-5-5")
  assert.equal(claudeSettings.effortLevel, "high")
  for (const relative of ["docs/engineering/profile.json", "docs/engineering/testing-policy.md", "docs/engineering/README.md", "scripts/engineering_profile.py"]) {
    assert.ok((await fs.stat(path.join(root, relative))).isFile(), relative)
  }
  success(check(await availability()))
})

test("low roles select the newest permitted discovered model and fall back when it is absent", async () => {
  await apply(await availability({ low: ["gpt-6-luna"] }))
  assert.equal(nativeCodex().roles.explorer.model, "gpt-6-luna")
  success(check(await availability({ low: ["gpt-6-luna"] })))
})

test("repeat application and checker are idempotent", async () => {
  const evidence = await availability()
  await apply(evidence)
  const installed = await snapshot()
  success(check(evidence))
  await apply(evidence)
  success(check(evidence))
  assert.deepEqual(await snapshot(), installed)
})

for (const [name, relative, mutate] of [
  ["model", ".codex/agents/explorer.toml", text => text.replace("gpt-6.1-luna", "gpt-6-luna")],
  ["effort", ".codex/agents/worker.toml", text => text.replace('"medium"', '"low"')],
  ["instructions", ".codex/agents/reviewer.toml", text => text.replace("preserve unrelated work", "ignore unrelated work")],
  ["unnamed dispatch effort", ".codex/config.toml", text => text.replace(/default_subagent_reasoning_effort("?\s*=\s*)"medium"/, 'default_subagent_reasoning_effort$1"high"')],
  ["role registration", ".codex/config.toml", text => text.replace(/config_file("?\s*=\s*)"agents\/explorer.toml"/, 'config_file$1"agents/unregistered-explorer.toml"')],
  ["Claude default effort", ".claude/agents/general-purpose.md", text => text.replace("effort: medium", "effort: high")],
  ["Claude model", ".claude/agents/explorer.md", text => text.replace("claude-sonnet-5", "claude-opus-5-5")],
]) {
  test(`checker rejects native ${name} drift`, async () => {
    const evidence = await availability()
    await apply(evidence)
    const filename = path.join(root, relative)
    const original = await fs.readFile(filename, "utf8")
    const changed = mutate(original)
    assert.notEqual(changed, original, `fixture must mutate ${relative}`)
    await fs.writeFile(filename, changed)
    assert.notEqual(check(evidence).status, 0)
  })
}

test("preserves unrelated native settings, hooks, MCP configuration, and project prose", async () => {
  await write(".codex/config.toml", '[mcp_servers.project]\ncommand = "example-server"\n\n[features]\ncustom_feature = true\n')
  const settings = { env: { PROJECT_SETTING: "kept" }, hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo project-hook" }] }] }, permissions: { deny: ["Read(secret.txt)"] } }
  await write(".claude/settings.json", JSON.stringify(settings))
  await apply(await availability())
  assert.equal(nativeCodex().config.mcp_servers.project.command, "example-server")
  assert.equal(nativeCodex().config.features.custom_feature, true)
  const actual = JSON.parse(await fs.readFile(path.join(root, ".claude/settings.json"), "utf8"))
  for (const [key, value] of Object.entries(settings)) assert.deepEqual(actual[key], value)
  assert.match(await fs.readFile(path.join(root, "AGENTS.md"), "utf8"), /Keep this project-specific prose\./)
  assert.match(await fs.readFile(path.join(root, "README.md"), "utf8"), /Existing setup and checks remain authoritative\./)
})

for (const collision of [".codex/agents/explorer.toml", ".claude/agents/worker.md", "docs/engineering/profile.json", "scripts/check-engineering.py"]) {
  test(`unmanaged collision at ${collision} refuses the entire install before writing`, async () => {
    await write(collision, "Existing user-owned content\n")
    const before = await snapshot()
    assert.notEqual(python(installer, ["--apply", ...await availability()]).status, 0)
    assert.deepEqual(await snapshot(), before)
  })
}

test("changed generated content is rejected without silently overwriting user changes", async () => {
  await apply(await availability())
  const filename = path.join(root, "docs/engineering/testing-policy.md")
  await fs.appendFile(filename, "\nLocal policy change that must survive.\n")
  const before = await snapshot()
  assert.notEqual(python(installer, ["--apply", ...await availability()]).status, 0)
  assert.deepEqual(await snapshot(), before)
})

test("symlinked output directories cannot write outside the project", async () => {
  const outside = path.join(sandbox, "outside")
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, "sentinel"), "untouched")
  await fs.symlink(outside, path.join(root, ".codex"))
  const before = await snapshot()
  assert.notEqual(python(installer, ["--apply", ...await availability()]).status, 0)
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(await fs.readdir(outside), ["sentinel"])
})

test("missing availability is explicit unknown evidence while structural configuration can pass", async () => {
  const installReport = JSON.parse((await apply()).stdout)
  assert.equal(installReport.availability.codex.status, "not_verified")
  assert.equal(installReport.availability["claude-code"].status, "not_verified")
  const report = JSON.parse(success(check()).stdout)
  assert.equal(report.configuration, "passing")
  assert.equal(report.availability.codex.status, "not_verified")
  assert.equal(report.availability["claude-code"].status, "not_verified")
  const receipt = JSON.parse(await fs.readFile(path.join(root, "docs/engineering/profile.json"), "utf8"))
  assert.equal(receipt.availability.codex.status, "not_verified")
  assert.equal(report.runtime_ready, undefined, "configuration verification must not assert application or local runtime readiness")
})

test("provider evidence is preserved and a verified model catalog remains a distinct result", async () => {
  const evidence = await availability()
  await apply(evidence)
  const receipt = JSON.parse(await fs.readFile(path.join(root, "docs/engineering/profile.json"), "utf8"))
  assert.equal(receipt.availability_evidence.providers.codex.source, "test-codex-catalog")
  assert.ok(receipt.availability_evidence.providers.codex.verified_at)
  const report = JSON.parse(success(check()).stdout)
  assert.equal(report.configuration, "passing")
  assert.equal(report.availability.codex.status, "verified")
  assert.equal(report.availability.codex.verification_scope, "model_catalog")
  assert.equal(report.availability.codex.provider_execution, "not_verified")
  assert.equal(report.availability["claude-code"].status, "verified")
})

test("an absent required provider model cannot produce an availability success claim", async () => {
  await apply(await availability())
  const result = check(await availability({ omit: ["claude-opus-5-5"] }))
  assert.equal(result.status, 2, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  assert.equal(report.configuration, "passing")
  assert.equal(report.availability["claude-code"].status, "unsupported")
  assert.ok(report.availability["claude-code"].unsupported.length)
})

test("newer low model without the required effort is skipped for a supported permitted candidate", async () => {
  const evidence = await availability()
  const filename = evidence[1]
  const catalog = JSON.parse(await fs.readFile(filename, "utf8"))
  catalog.providers.codex.models.find(model => model.id === "gpt-6.1-luna").reasoning_efforts = ["medium"]
  await fs.writeFile(filename, JSON.stringify(catalog))
  await apply(evidence)
  assert.equal(nativeCodex().roles.explorer.model, "gpt-6-luna")
  success(check(evidence))
})

test("existing native role registration is a collision even when its role file is elsewhere", async () => {
  await write(".codex/config.toml", '[agents.explorer]\nconfig_file = "user-agents/explorer.toml"\n')
  const before = await snapshot()
  const result = python(installer, ["--apply", ...await availability()])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /[Uu]nmanaged.*registration/)
  assert.deepEqual(await snapshot(), before)
})

test("explicit catalogs with no permitted low model block application before any writes", async () => {
  const before = await snapshot()
  const result = python(installer, ["--apply", ...await availability({ low: [] })])
  assert.equal(result.status, 2, result.stderr || result.stdout)
  assert.equal(JSON.parse(result.stdout).availability.codex.status, "unsupported")
  assert.deepEqual(await snapshot(), before)
})

test("availability evidence for one provider does not verify the other provider", async () => {
  const evidence = await availability()
  const catalog = JSON.parse(await fs.readFile(evidence[1], "utf8"))
  delete catalog.providers["claude-code"]
  await fs.writeFile(evidence[1], JSON.stringify(catalog))
  const report = JSON.parse((await apply(evidence)).stdout)
  assert.equal(report.availability.codex.status, "verified")
  assert.equal(report.availability["claude-code"].status, "not_verified")
})

for (const [name, mutate] of [
  ["missing source", catalog => { delete catalog.providers.codex.source }],
  ["invalid verification date", catalog => { catalog.providers.codex.verified_at = "not-a-date" }],
  ["duplicate models", catalog => { catalog.providers.codex.models.push(catalog.providers.codex.models[0]) }],
]) {
  test(`malformed catalog with ${name} is refused before writing`, async () => {
    const evidence = await availability()
    const catalog = JSON.parse(await fs.readFile(evidence[1], "utf8"))
    mutate(catalog)
    await fs.writeFile(evidence[1], JSON.stringify(catalog))
    const before = await snapshot()
    const result = python(installer, ["--apply", ...evidence])
    assert.notEqual(result.status, 0, result.stdout)
    assert.deepEqual(await snapshot(), before)
  })
}

test("an old model catalog cannot silently claim fresh verified availability", async () => {
  const evidence = await availability()
  const catalog = JSON.parse(await fs.readFile(evidence[1], "utf8"))
  catalog.providers.codex.verified_at = "2000-01-01T00:00:00Z"
  await fs.writeFile(evidence[1], JSON.stringify(catalog))
  const result = python(installer, ["--apply", ...evidence])
  if (result.stdout.trim()) {
    const report = JSON.parse(result.stdout)
    assert.notEqual(report.availability.codex.status, "verified")
    assert.equal(report.selected_models.low_codex, "gpt-6-luna", "stale evidence must not select a newer model")
  }
  else assert.notEqual(result.status, 0, "stale evidence must be refused or explicitly unverified")
})

test("editing the profile receipt cannot authorize overwriting a changed generated role", async () => {
  await apply(await availability())
  const relative = ".codex/agents/worker.toml"
  await fs.appendFile(path.join(root, relative), "\n# User customization\n")
  const filename = path.join(root, "docs/engineering/profile.json")
  const receipt = JSON.parse(await fs.readFile(filename, "utf8"))
  receipt.managed_files[relative] = createHash("sha256").update(await fs.readFile(path.join(root, relative))).digest("hex")
  await fs.writeFile(filename, JSON.stringify(receipt))
  const before = await snapshot()
  assert.notEqual(check().status, 0)
  assert.notEqual(python(installer, ["--apply"]).status, 0)
  assert.deepEqual(await snapshot(), before)
})

test("explicitly unverified catalog entries do not prove model access or select newer models", async () => {
  const evidence = await availability()
  const catalog = JSON.parse(await fs.readFile(evidence[1], "utf8"))
  catalog.providers.codex.verified = false
  await fs.writeFile(evidence[1], JSON.stringify(catalog))
  const report = JSON.parse((await apply(evidence)).stdout)
  assert.equal(report.availability.codex.status, "not_verified")
  assert.equal(nativeCodex().roles.explorer.model, "gpt-6-luna")
})

test("conflicting existing lead and default routing is preserved until explicitly adopted", async () => {
  for (const [name, relative, contents] of [
  ["Codex lead model", ".codex/config.toml", 'model = "project-model"\n'],
  ["Codex lead effort", ".codex/config.toml", 'model_reasoning_effort = "low"\n'],
  ["Codex default model", ".codex/config.toml", '[agents]\ndefault_subagent_model = "project-model"\n'],
  ["Codex default effort", ".codex/config.toml", '[agents]\ndefault_subagent_reasoning_effort = "high"\n'],
  ["Claude lead model", ".claude/settings.json", JSON.stringify({ model: "project-model" })],
  ["Claude lead effort", ".claude/settings.json", JSON.stringify({ effortLevel: "low" })],
  ]) {
    await fs.rm(path.join(root, ".codex/config.toml"), { force: true })
    await fs.rm(path.join(root, ".claude/settings.json"), { force: true })
    await write(relative, contents)
    const before = await snapshot()
    const result = python(installer, ["--apply", ...await availability()])
    assert.notEqual(result.status, 0, name)
    assert.match(result.stderr, /routing|adopt/i, name)
    assert.deepEqual(await snapshot(), before, name)
  }
})

test("explicit routing adoption replaces reviewed root assignments and preserves unrelated settings", async () => {
  await write(".codex/config.toml", 'model = "project-model"\nmodel_reasoning_effort = "low"\n[agents]\ndefault_subagent_model = "other-project-model"\ndefault_subagent_reasoning_effort = "high"\n[mcp_servers.project]\ncommand = "keep-server"\n')
  const hooks = { SessionStart: [{ hooks: [{ type: "command", command: "echo keep-hook" }] }] }
  await write(".claude/settings.json", JSON.stringify({ model: "project-model", effortLevel: "low", hooks }))
  await apply(["--adopt-routing", ...await availability()])
  const { config } = nativeCodex()
  assert.equal(config.model, "gpt-6.1-sol")
  assert.equal(config.model_reasoning_effort, "high")
  assert.equal(config.agents.default_subagent_model, "gpt-6.1-sol")
  assert.equal(config.agents.default_subagent_reasoning_effort, "medium")
  assert.equal(config.mcp_servers.project.command, "keep-server")
  const settings = JSON.parse(await fs.readFile(path.join(root, ".claude/settings.json"), "utf8"))
  assert.equal(settings.model, "claude-opus-5-5")
  assert.equal(settings.effortLevel, "high")
  assert.deepEqual(settings.hooks, hooks)
  success(check())
})

test("reapplying preserves deliberate routing and registration changes until explicit adoption", async () => {
  const evidence = await availability()
  await apply(evidence)
  const filename = path.join(root, ".codex/config.toml")
  for (const mutate of [
    text => text.replace(/model_reasoning_effort("?\s*=\s*)"high"/, 'model_reasoning_effort$1"low"'),
    text => text.replace(/config_file("?\s*=\s*)"agents\/explorer.toml"/, 'config_file$1"user-agents/custom-explorer.toml"'),
  ]) {
    const original = await fs.readFile(filename, "utf8")
    const changed = mutate(original)
    assert.notEqual(changed, original)
    await fs.writeFile(filename, changed)
    const before = await snapshot()
    assert.notEqual(python(installer, ["--apply", ...evidence]).status, 0)
    assert.deepEqual(await snapshot(), before)
    await apply(["--adopt-routing", ...evidence])
    assert.equal(nativeCodex().config.model_reasoning_effort, "high")
    assert.equal(nativeCodex().config.agents.explorer.config_file, "agents/explorer.toml")
    success(check(evidence))
  }
})

for (const [provider, relative, content] of [
  ["Claude", ".claude/agents/nested/custom-review.md", "---\nname: reviewer\ndescription: Existing reviewer\nmodel: claude-opus-5-5\n---\n\nExisting instructions.\n"],
  ["Claude with quoted identity key", ".claude/agents/nested/custom-review.md", '---\n"name": reviewer\ndescription: Existing reviewer\nmodel: claude-opus-5-5\n---\n\nExisting instructions.\n'],
  ["Codex", ".codex/agents/custom-review.toml", 'name = "reviewer"\ndescription = "Existing reviewer"\nmodel = "gpt-6.1-sol"\n'],
]) {
  test(`${provider} duplicate identities prevent installation and fail later configuration checks`, async () => {
    await write(relative, content)
    const before = await snapshot()
    const result = python(installer, ["--apply", ...await availability()])
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /reviewer/)
    assert.deepEqual(await snapshot(), before)
    await fs.rm(path.join(root, relative))
    await apply(await availability())
    await write(relative, content)
    const duplicateResult = check()
    assert.notEqual(duplicateResult.status, 0)
    assert.match(duplicateResult.stdout + duplicateResult.stderr, /reviewer/)
  })
}

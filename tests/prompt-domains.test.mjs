import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const root = path.resolve("metamodern-shape-prompt")
const additions = [
  "ui-design", "front-end-development", "back-end-and-api-design",
  "domain-and-data-modeling", "automotive-design", "automotive-engineering",
  "copywriting", "marketing",
]

// Exercise the route an agent can follow, not a list of phrases it must repeat.
async function reachableMarkdown(file, visited = new Set()) {
  if (visited.has(file)) return visited
  visited.add(file)
  const source = await fs.readFile(file, "utf8")
  for (const [, destination] of source.matchAll(/\]\(([^\s)]+)\)/g)) {
    if (/^(?:[a-z]+:|#)/i.test(destination)) continue
    const target = path.resolve(path.dirname(file), destination.split("#")[0])
    if (!target.endsWith(".md")) continue
    const relative = path.relative(root, target)
    assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), `Reference escapes package: ${destination}`)
    await reachableMarkdown(target, visited)
  }
  return visited
}

test("all new and existing domain guides are reachable from the skill entrypoint", async () => {
  const reached = await reachableMarkdown(path.join(root, "SKILL.md"))
  const domainRoot = path.join(root, "references/domains")
  const files = (await fs.readdir(domainRoot)).filter((name) => name.endsWith(".md"))
  for (const name of additions) assert.ok(files.includes(`${name}.md`), name)
  for (const name of ["apparel-merch-and-production", "business-and-operations", "furniture-design", "research-and-human-context"]) {
    assert.ok(files.includes(`${name}.md`), `Existing domain lost: ${name}`)
  }
  for (const name of files) assert.ok(reached.has(path.join(domainRoot, name)), `Undiscoverable domain: ${name}`)
})

test("evaluation requests cover the new domains, every mode, and a consequential conflict", async () => {
  const fixture = JSON.parse(await fs.readFile("tests/fixtures/prompt-domains.json", "utf8"))
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(new Set(fixture.cases.map(({ id }) => id)).size, fixture.cases.length)
  const domains = new Set()
  const modes = new Set()
  for (const item of fixture.cases) {
    assert.ok(item.request.length > 80, item.id)
    assert.ok(item.reviewCriteria.length >= 2, item.id)
    assert.equal(Object.hasOwn(item, "acceptedOutput"), false, "Requests are not measured outcomes")
    modes.add(item.mode)
    for (const domain of item.domains) {
      assert.ok(additions.includes(domain), domain)
      domains.add(domain)
    }
  }
  assert.deepEqual(domains, new Set(additions))
  assert.deepEqual(modes, new Set(["Clarify", "Expand", "Combine", "Prepare"]))
  assert.ok(fixture.cases.some(({ id }) => id === "cross-domain-combine-conflict"))
})

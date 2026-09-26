import fs from "node:fs/promises"
import path from "node:path"
import { validateSkillPackage } from "./lib/skill-package-validator.mjs"

const requestedRoots = process.argv.slice(2)
let skillRoots = requestedRoots.map((root) => path.resolve(root))

if (skillRoots.length === 0) {
  const sourceRoot = path.resolve(".")
  let entries
  try {
    entries = await fs.readdir(sourceRoot, { withFileTypes: true })
  } catch {
    console.error(`Canonical skill source is unavailable: ${sourceRoot}`)
    process.exit(1)
  }
  skillRoots = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("metamodern-"))
    .map((entry) => path.join(sourceRoot, entry.name))
    .sort()
}

if (skillRoots.length === 0) {
  console.error("No canonical Metamodern skill packages found at the collection root.")
  process.exit(1)
}

let failed = false
for (const skillRoot of skillRoots) {
  const issues = await validateSkillPackage(skillRoot)
  const label = path.relative(process.cwd(), skillRoot) || skillRoot
  for (const issue of issues) console.error(`${label}: ${issue}`)
  failed ||= issues.length > 0
}

if (failed) process.exitCode = 1
else console.log(`Skill package validation passed (${skillRoots.length} packages).`)

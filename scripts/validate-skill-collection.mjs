import path from "node:path"
import { validateSkillCollection } from "./lib/skill-collection-validator.mjs"

const sourceRoot = path.resolve(process.argv[2] ?? ".")
const issues = await validateSkillCollection(sourceRoot)

for (const issue of issues) console.error(issue)

if (issues.length > 0) process.exitCode = 1
else console.log("Skill collection validation passed.")

import fs from "node:fs/promises"
import path from "node:path"

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/
const SKILL_NAME = /^metamodern-[a-z0-9]+(?:-[a-z0-9]+)*$/
const CATEGORY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ENTRY_KEYS = ["category", "name", "path", "summary", "version"]

async function readText(file, issues, label) {
  try {
    return await fs.readFile(file, "utf8")
  } catch {
    issues.push(`${label}: missing`)
    return null
  }
}

export async function validateSkillCollection(sourceRoot) {
  const root = path.resolve(sourceRoot)
  const issues = []
  const catalogText = await readText(path.join(root, "catalog.json"), issues, "catalog.json")
  const readme = await readText(path.join(root, "README.md"), issues, "README.md")
  let catalog

  if (catalogText !== null) {
    try {
      catalog = JSON.parse(catalogText)
    } catch {
      issues.push("catalog.json: invalid JSON")
    }
  }

  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return issues.sort()
  }

  const topLevelKeys = Object.keys(catalog).sort()
  if (topLevelKeys.join(",") !== "collectionVersion,schemaVersion,skills") {
    issues.push("catalog.json: must contain only schemaVersion, collectionVersion, and skills")
  }
  if (catalog.schemaVersion !== 1) issues.push("catalog.json: schemaVersion must be 1")
  if (typeof catalog.collectionVersion !== "string" || !SEMVER.test(catalog.collectionVersion)) {
    issues.push("catalog.json: collectionVersion must be semantic versioning")
  }
  if (!Array.isArray(catalog.skills) || catalog.skills.length === 0) {
    issues.push("catalog.json: skills must be a non-empty array")
    return issues.sort()
  }

  const seenNames = new Set()
  const catalogNames = []

  for (const [index, entry] of catalog.skills.entries()) {
    const label = `catalog.json: skills[${index}]`
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(`${label}: must be an object`)
      continue
    }
    if (Object.keys(entry).sort().join(",") !== ENTRY_KEYS.join(",")) {
      issues.push(`${label}: must contain only ${ENTRY_KEYS.join(", ")}`)
    }
    const { name, version, category, summary } = entry
    const packagePath = entry.path
    if (typeof name !== "string" || !SKILL_NAME.test(name)) {
      issues.push(`${label}: name must use metamodern-<verb>-<object>`)
      continue
    }
    if (seenNames.has(name)) issues.push(`${label}: duplicate skill name ${name}`)
    seenNames.add(name)
    catalogNames.push(name)

    if (packagePath !== name) issues.push(`${label}: path must equal the canonical name ${name}`)
    if (typeof version !== "string" || !SEMVER.test(version)) {
      issues.push(`${label}: version must use semantic versioning`)
    }
    if (typeof category !== "string" || !CATEGORY.test(category)) {
      issues.push(`${label}: category must be a lowercase hyphenated label`)
    }
    if (typeof summary !== "string" || summary.trim().length < 12 || summary.length > 160) {
      issues.push(`${label}: summary must contain 12 to 160 characters`)
    }

    if (packagePath !== name) continue
    const packageRoot = path.join(root, packagePath)
    try {
      const packageStat = await fs.lstat(packageRoot)
      if (packageStat.isSymbolicLink()) {
        issues.push(`${name}: package directory must not be a symlink`)
        continue
      }
      if (!packageStat.isDirectory()) {
        issues.push(`${name}: package directory is missing`)
        continue
      }
    } catch {
      issues.push(`${name}: package directory is missing`)
      continue
    }

    const versionText = await readText(path.join(packageRoot, "PACKAGE_VERSION"), issues, `${name}/PACKAGE_VERSION`)
    if (versionText !== null && versionText !== `${name}@${version}\n`) {
      issues.push(`${name}: catalog version ${version} differs from PACKAGE_VERSION ${versionText.trim()}`)
    }
    const marker = await readText(path.join(packageRoot, "PACKAGE_ID"), issues, `${name}/PACKAGE_ID`)
    if (marker !== null && marker !== `${name}:metamodern-agency\n`) {
      issues.push(`${name}/PACKAGE_ID: must match the canonical package identity`)
    }
    const skill = await readText(path.join(packageRoot, "SKILL.md"), issues, `${name}/SKILL.md`)
    if (skill !== null && !skill.startsWith(`---\nname: ${name}\n`)) {
      issues.push(`${name}/SKILL.md: frontmatter name must match the catalog`)
    }
    if (readme !== null) {
      if (!readme.includes(`./${packagePath}/SKILL.md`)) {
        issues.push(`README.md: ${name} must link to ./${packagePath}/SKILL.md`)
      }
      if (!readme.includes(`$${name}`)) {
        issues.push(`README.md: ${name} must include the explicit invocation $${name}`)
      }
    }
  }

  if ([...catalogNames].sort().join("\n") !== catalogNames.join("\n")) {
    issues.push("catalog.json: skills must be sorted by canonical name")
  }

  let packageNames = []
  try {
    packageNames = (await fs.readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("metamodern-"))
      .map((entry) => entry.name)
      .sort()
  } catch {
    issues.push(`skills: source root is unavailable: ${root}`)
  }

  for (const name of packageNames) {
    if (!seenNames.has(name)) issues.push(`${name}: package is missing from catalog.json`)
  }

  return issues.sort()
}

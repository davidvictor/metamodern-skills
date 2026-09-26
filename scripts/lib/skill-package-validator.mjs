import fs from "node:fs/promises"
import path from "node:path"

const PLACEHOLDER = /\b(?:TBD|TODO|FIXME|PLACEHOLDER)\b/
const MACHINE_PATH = /(?:\/Users\/|file:\/\/)/
const BRAND_DEVELOPMENT_DEFAULT_PROMPT = "Use $metamodern-develop-brand to assess the current brand evidence and complete the requested brand outcome."
const BRAND_DEVELOPMENT_REFERENCES = [
  "references/brand-method.md",
  "references/research-led-run.md",
  "references/strategy-fields.md",
  "references/identity-method.md",
  "references/color-method.md",
  "references/workspace-guide.md",
  "references/output-guide.md",
  "references/platform-boundaries.md",
  "references/source-provenance.md",
]
const BRAND_DEVELOPMENT_CARDS = [
  "references/method-cards/catalog.md",
  "references/method-cards/existing-brand-inventory.md",
  "references/method-cards/competitor-and-convention-audit.md",
  "references/method-cards/strategy-reconciliation.md",
  "references/method-cards/voice-and-message-completion.md",
  "references/method-cards/identity-system-audit.md",
  "references/method-cards/color-system-completion.md",
  "references/method-cards/application-proof.md",
]
const BRAND_DEVELOPMENT_DATE_TEMPLATES = new Set([
  "assets/workspace-template.md",
  "assets/brand-template.md",
])

function containedBy(root, destination) {
  const relative = path.relative(path.resolve(root), path.resolve(destination))
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

async function entriesBelow(root) {
  const files = []
  const symlinks = []
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(absolute)
      if (entry.isFile()) files.push(absolute)
      if (entry.isSymbolicLink()) symlinks.push(absolute)
    }
  }
  await walk(root)
  return { files: files.sort(), symlinks: symlinks.sort() }
}

function logicalLineCount(text) {
  const normalized = text.replace(/\r\n/g, "\n")
  const withoutFinalTerminator = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized
  return withoutFinalTerminator ? withoutFinalTerminator.split("\n").length : 0
}

function manifestInterfaceValues(text, key) {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const interfaceIndexes = lines
    .map((line, index) => line.match(/^interface:[ \t]*$/) ? index : -1)
    .filter((index) => index >= 0)
  if (interfaceIndexes.length !== 1) return null

  const block = []
  for (const line of lines.slice(interfaceIndexes[0] + 1)) {
    if (/^\S/.test(line)) break
    block.push(line)
  }
  const indents = block
    .filter((line) => line.trim() && !line.trimStart().startsWith("#"))
    .map((line) => line.match(/^ +/)?.[0].length ?? 0)
    .filter((length) => length > 0)
  if (indents.length === 0) return []

  const directIndent = Math.min(...indents)
  const prefix = `${" ".repeat(directIndent)}${key}:`
  return block
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim())
}

async function validateBrandDevelopmentSurface(skillRoot, files, issues) {
  if (path.basename(path.resolve(skillRoot)) !== "metamodern-develop-brand") return

  try {
    const agentManifestPath = path.join(skillRoot, "agents", "openai.yaml")
    const agentManifest = await fs.readFile(agentManifestPath, "utf8")
    if (!(await fs.stat(agentManifestPath)).isFile() || !agentManifest.includes(`default_prompt: "${BRAND_DEVELOPMENT_DEFAULT_PROMPT}"`)) {
      issues.push("agents/openai.yaml: must contain the matching default_prompt")
    }
  } catch {
    issues.push("agents/openai.yaml: must contain the matching default_prompt")
  }

  for (const relative of [...BRAND_DEVELOPMENT_REFERENCES, ...BRAND_DEVELOPMENT_CARDS]) {
    try {
      if (!(await fs.stat(path.join(skillRoot, relative))).isFile()) {
        issues.push(`${relative}: must be a regular file in the planned v0.1 surface`)
      }
    } catch {
      issues.push(`${relative}: missing planned v0.1 surface`)
    }
  }

  for (const file of files) {
    const relative = path.relative(skillRoot, file).split(path.sep).join("/")
    if (BRAND_DEVELOPMENT_DATE_TEMPLATES.has(relative)) continue
    if ((await fs.readFile(file, "utf8")).includes("YYYY-MM-DD")) {
      issues.push(`${relative}: YYYY-MM-DD is reserved for the two templates`)
    }
  }
}

async function validateCanonicalPackageIdentity(skillRoot, issues) {
  const name = path.basename(path.resolve(skillRoot))
  if (!name.startsWith("metamodern-")) return
  const packageIdPath = path.join(skillRoot, "PACKAGE_ID")
  try {
    if (
      !(await fs.stat(packageIdPath)).isFile() ||
      await fs.readFile(packageIdPath, "utf8") !== `${name}:metamodern-agency\n`
    ) {
      issues.push("PACKAGE_ID: must have the exact stable value")
    }
  } catch {
    issues.push("PACKAGE_ID: must have the exact stable value")
  }

  const agentManifestPath = path.join(skillRoot, "agents", "openai.yaml")
  try {
    const agentManifest = await fs.readFile(agentManifestPath, "utf8")
    if (!(await fs.stat(agentManifestPath)).isFile()) {
      issues.push("agents/openai.yaml: must be a regular file")
    } else {
      const displayNames = manifestInterfaceValues(agentManifest, "display_name")
      const defaultPrompts = manifestInterfaceValues(agentManifest, "default_prompt")
      if (displayNames === null || defaultPrompts === null) {
        issues.push("agents/openai.yaml: must contain exactly one top-level interface mapping")
      } else if (displayNames.length !== 1 || !displayNames[0].startsWith('"Metamodern:')) {
        issues.push("agents/openai.yaml: display_name must use the Metamodern namespace")
      }
      if (defaultPrompts !== null && (defaultPrompts.length !== 1 || !defaultPrompts[0].includes(`$${name}`))) {
        issues.push("agents/openai.yaml: default_prompt must invoke the canonical skill name")
      }
    }
  } catch {
    issues.push("agents/openai.yaml: missing canonical agent manifest")
  }
}

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return null
  return match[1].split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf(":")
    return separator < 1 ? ["", ""] : [line.slice(0, separator), line.slice(separator + 1).trim()]
  })
}

export async function validateSkillPackage(skillRoot) {
  const issues = []
  const skillPath = path.join(skillRoot, "SKILL.md")
  let skillText = ""
  try {
    skillText = await fs.readFile(skillPath, "utf8")
  } catch {
    return ["SKILL.md: missing"]
  }

  const entries = frontmatter(skillText)
  const metadata = entries ? Object.fromEntries(entries) : null
  const keys = entries?.map(([key]) => key) ?? []
  const uniqueKeys = new Set(keys)
  if (
    !metadata ||
    keys.length !== 2 ||
    uniqueKeys.size !== 2 ||
    [...uniqueKeys].sort().join(",") !== "description,name" ||
    !metadata.name ||
    !metadata.description ||
    metadata.description.length > 1024
  ) {
    issues.push("SKILL.md: frontmatter must contain only name and description")
  }
  if (metadata?.name !== path.basename(path.resolve(skillRoot))) {
    issues.push("SKILL.md: name must match the skill directory name")
  }
  if (metadata?.description && !metadata.description.startsWith("Use when ")) {
    issues.push("SKILL.md: description must start with a Use when trigger")
  }
  if (logicalLineCount(skillText) >= 500) issues.push("SKILL.md: must stay below 500 lines")

  await validateCanonicalPackageIdentity(skillRoot, issues)
  const { files, symlinks } = await entriesBelow(skillRoot)
  await validateBrandDevelopmentSurface(skillRoot, files, issues)
  for (const file of symlinks) {
    issues.push(`${path.relative(skillRoot, file).split(path.sep).join("/")}: symlink entries are prohibited`)
  }
  for (const file of files) {
    const relative = path.relative(skillRoot, file).split(path.sep).join("/")
    if (!/\.(?:md|ya?ml|sh)$/.test(file)) continue
    const text = await fs.readFile(file, "utf8")
    if (PLACEHOLDER.test(text)) issues.push(`${relative}: placeholder text is prohibited`)
    if (MACHINE_PATH.test(text)) issues.push(`${relative}: machine-specific path is prohibited`)
    if (/[\u2013\u2014]/.test(text)) issues.push(`${relative}: prohibited dash character`)
    if (!file.endsWith(".md")) continue
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const raw = match[1].trim()
      if (/^(?:https?:|mailto:|#)/.test(raw)) continue
      const target = raw.split(/[?#]/)[0]
      if (path.isAbsolute(target)) {
        issues.push(`${relative}: absolute link is prohibited: ${raw}`)
        continue
      }
      const destination = path.resolve(path.dirname(file), target)
      if (!containedBy(skillRoot, destination)) {
        issues.push(`${relative}: link escapes the skill: ${raw}`)
        continue
      }
      try {
        await fs.stat(destination)
      } catch {
        issues.push(`${relative}: broken link: ${raw}`)
      }
    }
  }
  return issues.sort()
}

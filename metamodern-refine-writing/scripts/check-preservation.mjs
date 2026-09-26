#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

const SCHEMA_VERSION = 1
const MAX_BYTES = 2_000_000
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"

function usage() {
  return "Usage: node check-preservation.mjs --source SOURCE --revised REVISED [--json] [--show-values]"
}

function parseArgs(args) {
  const parsed = { source: null, revised: null, json: false, showValues: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--json") {
      parsed.json = true
      continue
    }
    if (arg === "--show-values") {
      parsed.showValues = true
      continue
    }
    if (arg === "--source" || arg === "--revised") {
      const value = args[index + 1]
      if (!value || value.startsWith("--")) throw new Error(usage())
      parsed[arg.slice(2)] = value
      index += 1
      continue
    }
    throw new Error(usage())
  }
  if (!parsed.source || !parsed.revised) throw new Error(usage())
  return parsed
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n")
}

function normalizeQuoteContent(value) {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
}

function addAnchor(anchors, type, value) {
  const normalized = ["blockquote", "quoted_text"].includes(type)
    ? normalizeQuoteContent(value)
    : normalizeNewlines(value).trim()
  if (normalized) anchors.push({ type, value: normalized })
}

function collectMatches(text, regex, type, anchors, group = 0) {
  for (const match of text.matchAll(regex)) addAnchor(anchors, type, match[group])
}

function extractFrontmatter(text) {
  const lines = text.split("\n")
  const marker = lines[0]
  if (marker !== "---" && marker !== "+++") return null
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === marker) return lines.slice(0, index + 1).join("\n")
  }
  return null
}

function extractFencedBlocks(text) {
  const lines = text.split("\n")
  const masked = [...lines]
  const blocks = []

  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index].match(/^ {0,3}(`{3,}|~{3,})[^\n]*$/)
    if (!opening) continue
    const marker = opening[1][0]
    const minimum = opening[1].length
    const closing = new RegExp(`^ {0,3}\\${marker}{${minimum},}[ \\t]*$`)
    let end = index + 1
    while (end < lines.length && !closing.test(lines[end])) end += 1
    if (end >= lines.length) end = lines.length - 1

    blocks.push(lines.slice(index, end + 1).join("\n"))
    for (let line = index; line <= end; line += 1) masked[line] = ""
    index = end
  }

  return { blocks, prose: masked.join("\n") }
}

function extractLinkDestinations(text) {
  const destinations = []
  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] !== "]" || text[index + 1] !== "(") continue
    let cursor = index + 2
    while (cursor < text.length && /[ \t]/.test(text[cursor])) cursor += 1
    if (text[cursor] === "<") {
      const end = text.indexOf(">", cursor + 1)
      if (end > cursor + 1) destinations.push(text.slice(cursor + 1, end))
      if (end > cursor) index = end
      continue
    }

    const start = cursor
    let depth = 0
    let escaped = false
    while (cursor < text.length) {
      const char = text[cursor]
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "(") {
        depth += 1
      } else if (char === ")") {
        if (depth === 0) break
        depth -= 1
      } else if (/\s/.test(char) && depth === 0) {
        break
      }
      cursor += 1
    }
    if (cursor > start) destinations.push(text.slice(start, cursor))
    index = cursor
  }
  return destinations
}

function trimUrl(value) {
  let url = value
  while (/[.,;:!?"'\]}]$/.test(url)) url = url.slice(0, -1)
  while (url.endsWith(")")) {
    const openings = (url.match(/\(/g) || []).length
    const closings = (url.match(/\)/g) || []).length
    if (closings <= openings) break
    url = url.slice(0, -1)
  }
  return url
}

function extractAnchors(input) {
  const text = normalizeNewlines(input)
  const anchors = []

  const frontmatter = extractFrontmatter(text)
  if (frontmatter) addAnchor(anchors, "frontmatter", frontmatter)

  const { blocks, prose } = extractFencedBlocks(text)
  for (const block of blocks) addAnchor(anchors, "fenced_code", block)

  collectMatches(prose, /`([^`\n]+)`/g, "inline_code", anchors, 1)
  for (const destination of extractLinkDestinations(text)) addAnchor(anchors, "link_destination", destination)
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/g)) {
    addAnchor(anchors, "url", trimUrl(match[0]))
  }
  collectMatches(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "email", anchors)
  collectMatches(text, /\[\^([^\]]+)\]/g, "footnote", anchors, 1)
  collectMatches(text, /^\s*>\s?(.*)$/gm, "blockquote", anchors, 1)
  collectMatches(prose, /"([^"\n]+)"/g, "quoted_text", anchors, 1)
  collectMatches(prose, /“([^”\n]+)”/g, "quoted_text", anchors, 1)
  collectMatches(text, new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2},\\s+\\d{4}\\b`, "gi"), "date", anchors)
  collectMatches(text, /\b\d{4}-\d{2}-\d{2}\b/g, "date", anchors)
  collectMatches(
    text,
    /(?<![A-Za-z0-9_])(?:[$€£])?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|ms|milliseconds?|s|seconds?|minutes?|hours?|days?|weeks?|months?|years?|bytes?|KB|MB|GB|TB|px|rem|em|pt|in|cm|mm|kg|g|lb|oz|units?))?(?![A-Za-z0-9_])/gi,
    "number",
    anchors,
  )

  return anchors.sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value))
}

function toCounts(anchors) {
  const counts = new Map()
  for (const anchor of anchors) {
    const key = `${anchor.type}\u0000${anchor.value}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12)
}

function difference(left, right, showValues) {
  const result = []
  for (const [key, count] of left.entries()) {
    const remaining = count - (right.get(key) || 0)
    if (remaining <= 0) continue
    const separator = key.indexOf("\u0000")
    const value = key.slice(separator + 1)
    const item = {
      type: key.slice(0, separator),
      fingerprint: fingerprint(value),
      count: remaining,
    }
    if (showValues) item.value = value
    result.push(item)
  }
  return result.sort((a, b) => a.type.localeCompare(b.type) || a.fingerprint.localeCompare(b.fingerprint))
}

function makeReport(sourcePath, revisedPath, sourceText, revisedText, showValues) {
  const sourceAnchors = extractAnchors(sourceText)
  const revisedAnchors = extractAnchors(revisedText)
  const sourceCounts = toCounts(sourceAnchors)
  const revisedCounts = toCounts(revisedAnchors)
  const missing = difference(sourceCounts, revisedCounts, showValues)
  const added = difference(revisedCounts, sourceCounts, showValues)
  const detectedTypes = [...new Set([...sourceAnchors, ...revisedAnchors].map(({ type }) => type))].sort()

  return {
    schemaVersion: SCHEMA_VERSION,
    status: missing.length === 0 && added.length === 0 ? "pass" : "fail",
    sourceFingerprint: fingerprint(path.basename(sourcePath)),
    revisedFingerprint: fingerprint(path.basename(revisedPath)),
    ...(showValues
      ? { source: path.basename(sourcePath), revised: path.basename(revisedPath) }
      : {}),
    detectedTypes,
    summary: {
      sourceAnchors: sourceAnchors.length,
      revisedAnchors: revisedAnchors.length,
      missing: missing.reduce((sum, item) => sum + item.count, 0),
      added: added.reduce((sum, item) => sum + item.count, 0),
    },
    missing,
    added,
  }
}

function renderHuman(report) {
  if (report.status === "pass") {
    return `Preservation check passed: ${report.summary.sourceAnchors} protected anchors matched.`
  }
  const lines = [
    `Preservation check failed: ${report.summary.missing} missing and ${report.summary.added} added anchors.`,
  ]
  for (const item of report.missing) {
    lines.push(`Missing ${item.type}: ${item.count} anchor(s), fingerprint ${item.fingerprint}`)
  }
  for (const item of report.added) {
    lines.push(`Added ${item.type}: ${item.count} anchor(s), fingerprint ${item.fingerprint}`)
  }
  return lines.join("\n")
}

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    return 2
  }

  async function readBounded(file) {
    let handle
    try {
      handle = await fs.open(file, "r")
      const metadata = await handle.stat()
      if (!metadata.isFile()) throw new Error("input is not a regular file")
      if (metadata.size > MAX_BYTES) throw new Error(`input exceeds the ${MAX_BYTES}-byte size limit`)
      const buffer = await handle.readFile()
      if (buffer.byteLength > MAX_BYTES) throw new Error(`input exceeds the ${MAX_BYTES}-byte size limit`)
      return buffer.toString("utf8")
    } finally {
      if (handle) await handle.close()
    }
  }

  let sourceText
  let revisedText
  try {
    ;[sourceText, revisedText] = await Promise.all([
      readBounded(args.source),
      readBounded(args.revised),
    ])
  } catch (error) {
    console.error(`Cannot read the source or revised file: ${error.message}`)
    return 2
  }

  const report = makeReport(args.source, args.revised, sourceText, revisedText, args.showValues)
  console.log(args.json ? JSON.stringify(report, null, 2) : renderHuman(report))
  return report.status === "pass" ? 0 : 1
}

process.exitCode = await main()

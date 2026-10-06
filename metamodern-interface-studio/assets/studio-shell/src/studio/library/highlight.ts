/*
 * A small tokenizer for code on library pages: keywords, strings, comments, numbers, tags, attributes and punctuation
 * for JavaScript and TypeScript (with JSX), HTML, CSS, JSON and shell. Pure and lossless: the page draws each token as
 * text in a span, never as HTML (code-block.tsx).
 */
export type TokenKind = "keyword" | "string" | "comment" | "number" | "tag" | "attr" | "punct" | "plain"
export type Token = { kind: TokenKind; text: string }

const KEYWORDS = new Set(
  "as async await break case catch class const continue default delete do else enum export extends false finally for from function if import in instanceof interface let new null return satisfies static super switch this throw true try type typeof undefined var void while with yield".split(" ")
)

type Rule = [TokenKind | "word", RegExp]
// Sticky patterns, tried in order at each position; "word" becomes a keyword or plain text.
const RULES: Record<"js" | "html" | "css" | "json" | "shell" | "plain", Rule[]> = {
  js: [
    ["comment", /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
    ["string", /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/y],
    ["tag", /<\/?[A-Za-z][\w.]*/y],
    ["number", /\b\d+(?:\.\d+)?\b/y],
    ["word", /[A-Za-z_$][\w$]*/y],
    ["punct", /[{}()[\];,.<>/=+\-*!?:&|]+/y],
  ],
  html: [
    ["comment", /<!--[\s\S]*?-->/y],
    ["tag", /<\/?[A-Za-z][\w-]*|\/?>/y],
    ["attr", /[A-Za-z_:@][\w:.-]*(?==)/y],
    ["string", /"[^"]*"|'[^']*'/y],
    ["punct", /=/y],
  ],
  css: [
    ["comment", /\/\*[\s\S]*?\*\//y],
    ["string", /"[^"\n]*"|'[^'\n]*'/y],
    ["attr", /(?:--)?[A-Za-z][\w-]*(?=\s*:)/y],
    ["number", /-?\d+(?:\.\d+)?(?:px|rem|em|%|ms|s|deg|vh|vw)?/y],
    ["punct", /[{}();:,]/y],
  ],
  json: [
    ["string", /"(?:\\.|[^"\\])*"/y],
    ["number", /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y],
    ["keyword", /\b(?:true|false|null)\b/y],
    ["punct", /[{}[\]:,]/y],
  ],
  shell: [
    ["comment", /#[^\n]*/y],
    ["string", /"(?:\\.|[^"\\])*"|'[^']*'/y],
    ["punct", /[|&;<>]+/y],
  ],
  plain: [],
}

function family(language: string): keyof typeof RULES {
  const l = language.toLowerCase()
  if (/^(tsx?|jsx?|javascript|typescript|mjs|cjs)$/.test(l)) return "js"
  if (/^(html|xml|svg)$/.test(l)) return "html"
  if (/^(css|scss)$/.test(l)) return "css"
  if (/^json5?$/.test(l)) return "json"
  if (/^(sh|bash|shell|zsh|console)$/.test(l)) return "shell"
  return "plain"
}

export function tokenize(code: string, language: string): Token[] {
  const rules = RULES[family(language)]
  const out: Token[] = []
  const push = (kind: TokenKind, text: string) => {
    const last = out[out.length - 1]
    if (kind === "plain" && last?.kind === "plain") last.text += text
    else out.push({ kind, text })
  }
  let i = 0
  while (i < code.length) {
    let matched = false
    for (const [kind, re] of rules) {
      re.lastIndex = i
      const m = re.exec(code)
      if (!m || !m[0]) continue
      push(kind === "word" ? (KEYWORDS.has(m[0]) ? "keyword" : "plain") : kind, m[0])
      i += m[0].length
      matched = true
      break
    }
    if (!matched) {
      push("plain", code[i])
      i++
    }
  }
  return out
}

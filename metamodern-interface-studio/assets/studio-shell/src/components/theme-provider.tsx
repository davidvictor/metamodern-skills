import * as React from "react"

// Studio appearance and Studio brand color. Neither follows or sets a product theme.
type Theme = "dark" | "light" | "system"
type Ctx = { theme: Theme; setTheme: (t: Theme) => void; brand: string | null; setBrand: (c: string | null) => void }

const QUERY = "(prefers-color-scheme: dark)"
const ThemeContext = React.createContext<Ctx | undefined>(undefined)

function read<T extends string>(key: string, ok: (v: string) => boolean, fallback: T | null): T | null {
  try {
    const v = localStorage.getItem(key)
    return v !== null && ok(v) ? (v as T) : fallback
  } catch {
    return fallback
  }
}
function write(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, v)
  } catch {
    /* per-viewer convenience only */
  }
}

/** Relative luminance of any CSS color the browser can parse. */
function luminance(color: string) {
  const el = document.createElement("span")
  el.style.color = color
  document.body.appendChild(el)
  const m = getComputedStyle(el).color.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]
  el.remove()
  const [r, g, b] = m.slice(0, 3).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** Text color for a brand fill: white when it reaches 4.5:1, otherwise near-black. */
export function readableOn(color: string) {
  const l = luminance(color)
  return contrast(l, 1) >= 4.5 ? "oklch(0.99 0 0)" : "oklch(0.18 0 0)"
}

/*
 * The brand tints only the Studio's own accents: primary buttons, switches,
 * checkboxes, focus rings, the Studio mark and the active rail marker. The mark's
 * tile keeps the unlifted brand in both appearances so a white mark reads on it. The
 * stage, preview boundary, status and fidelity colors stay fixed. In dark
 * appearance the brand is lifted to at least L 0.72 so it stays legible.
 */
function applyBrand(color: string | null) {
  let el = document.getElementById("studio-brand") as HTMLStyleElement | null
  if (!color) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement("style")
    el.id = "studio-brand"
    document.head.appendChild(el)
  }
  const fg = readableOn(color)
  const lifted = `oklch(from ${color} max(l, 0.72) c h)`
  // In light appearance the focus ring and the active rail label use the brand lowered to at most L 0.5, so a pale brand still reaches 3:1 and 4.5:1.
  const lowered = `oklch(from ${color} min(l, 0.5) c h)`
  el.textContent = `
:root { --mark-fill: ${color}; --mark-ink: ${fg}; }
:root:not(.dark) { --primary: ${color}; --primary-foreground: ${fg}; --ring: ${lowered}; --sidebar-primary: ${color}; --sidebar-primary-foreground: ${fg}; --sidebar-ring: ${lowered}; --rail-active: ${lowered}; }
:root.dark { --primary: ${lifted}; --primary-foreground: oklch(0.18 0 0); --ring: ${lifted}; --sidebar-primary: ${lifted}; --sidebar-primary-foreground: oklch(0.18 0 0); --sidebar-ring: ${lifted}; }`
}

/** storagePrefix namespaces per-viewer settings, so each Studio remembers its own brand color. */
export function ThemeProvider({ children, storagePrefix = "studio", defaultBrand = null }: { children: React.ReactNode; storagePrefix?: string; defaultBrand?: string | null }) {
  const KEY = "studio.appearance"
  const BRAND_KEY = `${storagePrefix}.brand`
  const [theme, setThemeState] = React.useState<Theme>(() => read<Theme>(KEY, (v) => ["dark", "light", "system"].includes(v), "system") ?? "system")
  // "neutral" is stored when a viewer picks Neutral over a product default, so the default does not come back.
  const [brand, setBrandState] = React.useState<string | null>(() => {
    const stored = read<string>(BRAND_KEY, (v) => v === "neutral" || CSS.supports("color", v), null)
    return stored === "neutral" ? null : (stored ?? defaultBrand)
  })
  React.useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches)
      document.documentElement.classList.toggle("dark", dark)
      document.documentElement.style.colorScheme = dark ? "dark" : "light"
    }
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [theme])
  React.useEffect(() => applyBrand(brand), [brand])
  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t)
    write(KEY, t)
  }, [])
  const setBrand = React.useCallback((c: string | null) => {
    setBrandState(c)
    write(BRAND_KEY, c === null && defaultBrand ? "neutral" : c)
  }, [BRAND_KEY, defaultBrand])
  return <ThemeContext.Provider value={{ theme, setTheme, brand, setBrand }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}

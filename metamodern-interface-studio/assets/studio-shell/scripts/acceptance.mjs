#!/usr/bin/env node
/*
 * Measures the shell against the acceptance criteria in the skill's shell.md.
 * It builds the Studio five ways (the example product, a 1,000-scenario stress
 * adapter, a capture-only adapter, the example with its synthetic workspace, and
 * the example with that workspace and a synthetic component library), serves them
 * locally (the workspace build also without its operations host),
 * and drives them in headless Chromium. It needs Playwright: `npm i -D playwright` and
 * `npx playwright install chromium`, or set PLAYWRIGHT_MODULE to an existing
 * install. Results print as a table and are written to acceptance-report.json.
 * A result is pass, fail, or not-measured; nothing is inferred. Set ONLY=AC-03,AC-10 to run a subset.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { copyFileSync, createReadStream, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { extname, join, normalize } from "node:path"
import { pathToFileURL } from "node:url"
import { gzipSync } from "node:zlib"

const root = new URL("..", import.meta.url).pathname
let chromium
try {
  ;({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright"))
} catch {
  console.error("Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`, or set PLAYWRIGHT_MODULE.")
  process.exit(2)
}
const { createMockHost } = await import(pathToFileURL(join(root, "example/workspace/mock-host.mjs")).href)

const builds = { normal: "example", stress: "synthetic", captures: "captures", workspace: "workspace", library: "library" }
// WS-01 and LB-01: the initial Studio chunk of the previous release's shell (0.12.2), gzipped, built with the example
// product. A Studio that declares neither a workspace nor a library may grow by at most 3 KB over it. Each release moves
// it to the release before it.
const STUDIO_CHUNK_BASELINE = "0.12.2"
const STUDIO_CHUNK_BASELINE_GZ = 298530
const servers = {}
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".jpg": "image/jpeg" }
const serve = (out, host) =>
  createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname)
    // The example workspace's mock operations host, as the dev server serves it; "nohost" serves the same build without one.
    if (host && pathname.startsWith("/__studio/ops/")) return host()(req, res, pathname.slice("/__studio/ops/".length))
    const path = normalize(join(out, pathname))
    const file = path.startsWith(out) && existsSync(path) && statSync(path).isFile() ? path : join(out, "index.html")
    res.setHeader("content-type", mime[extname(file)] ?? "application/octet-stream")
    createReadStream(file).pipe(res)
  })
const listen = async (name, server) => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  servers[name] = { ...servers[name], server, url: `http://127.0.0.1:${server.address().port}/` }
}
for (const [name, variant] of Object.entries(builds)) {
  const out = join(root, ".acceptance", name)
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { cwd: root, env: { ...process.env, ...(variant ? { VITE_STUDIO_ADAPTER: variant } : {}) }, stdio: "inherit" })
  // The library build carries the example workspace too, so it is served with its own mock host.
  if (name === "workspace" || name === "library") servers[name] = { host: createMockHost() }
  await listen(name, serve(out, name === "workspace" || name === "library" ? () => servers[name].host : null))
}
await listen("nohost", serve(join(root, ".acceptance", "workspace"), null))

const browser = await chromium.launch()
const results = []
const record = (id, status, detail) => {
  results.push({ id, status, detail })
  console.log(`${status.toUpperCase().padEnd(12)} ${id}  ${detail}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(name, { width = 1440, height = 900, touch = false, hash = "", appearance, brand } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, colorScheme: appearance ?? "light" })
  if (appearance) await context.addInitScript((a) => localStorage.setItem("studio.appearance", a), appearance)
  if (brand) await context.addInitScript((b) => localStorage.setItem("studio.example-tasks.brand", b), brand)
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(servers[name].url + (hash ? `#${hash}` : ""))
  await page.waitForSelector("header", { timeout: 15000 })
  await wait(1200)
  page.errors = errors
  page.closeAll = () => context.close()
  return page
}
const scenarioMenu = async (page, width) => {
  if (width < 768) {
    await page.getByRole("button", { name: "Panel" }).click()
    await wait(700)
  }
}
async function check(id, fn) {
  if (process.env.ONLY && !process.env.ONLY.split(",").includes(id)) return
  try {
    const [status, detail] = await fn()
    record(id, status, detail)
  } catch (e) {
    record(id, "fail", `Threw: ${String(e).split("\n")[0]}`)
  }
}

// AC-01 Catalog scales without trapping focus (1,000 scenarios in 12 areas)
await check("AC-01", async () => {
  const p = await open("stress", { hash: "view=inspect" })
  const stops = await p.locator('[role="tree"] [tabindex="0"]').count()
  const inner = await p.locator('[role="tree"] button, [role="tree"] a, [role="tree"] input').count()
  await p.locator('[role="tree"] [tabindex="0"]').focus()
  const start = Number(await p.evaluate(() => document.activeElement?.getAttribute("data-index")))
  for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowDown")
  const moved = await p.evaluate(() => document.activeElement?.getAttribute("data-index"))
  await p.keyboard.press("b")
  const typed = await p.evaluate(() => document.activeElement?.textContent?.trim() ?? "")
  const rowsBefore = await p.locator('[role="tree"] [data-index]').count()
  const ms = await p.evaluate(async () => {
    const input = document.querySelector("#catalog-search")
    const t0 = performance.now()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "state 4")
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    return performance.now() - t0
  })
  const filtered = await p.locator('[role="tree"] [data-index]').count()
  const badge = await p.getByText(/^\d+ of 1000$/).first().isVisible().catch(() => false)
  await p.closeAll()
  const ok = stops === 1 && inner === 0 && Number(moved) === start + 4 && /^Billing/i.test(typed) && rowsBefore <= 200 && filtered <= 200 && ms < 100 && badge
  return [ok ? "pass" : "fail", `tab stops ${stops}, nested controls ${inner}, arrow moved to ${moved}, type-ahead "${typed.slice(0, 12)}", rows in DOM ${rowsBefore} then ${filtered} filtered, search ${ms.toFixed(0)} ms, live count ${badge}`]
})

// AC-02 Selecting never moves the page
await check("AC-02", async () => {
  const bad = []
  for (const width of [360, 390, 600, 768, 900, 1024, 1280, 1440, 1600]) {
    const p = await open("stress", { width, height: 800, touch: width < 768, hash: "view=inspect" })
    await scenarioMenu(p, width)
    await p.locator("#catalog-search").fill("Tasks state 40")
    await wait(200)
    await p.locator('[role="treeitem"][title="Tasks state 40"]').first().click()
    await wait(1500)
    const m = await p.evaluate(() => {
      const f = document.querySelector(".preview-frame")?.getBoundingClientRect()
      return { y: scrollY, h: document.documentElement.scrollHeight, ih: innerHeight, top: f?.top, bottom: f?.bottom }
    })
    if (m.y !== 0 || m.h > m.ih + 1 || m.top == null || m.top < 0 || m.top >= m.ih) bad.push(`${width}: ${JSON.stringify(m)}`)
    await p.closeAll()
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : "9 widths from 360 to 1600: page never scrolled, preview top edge inside the viewport"]
})

// AC-03 No horizontal page scroll on phones, measured on every scrolling region
await check("AC-03", async () => {
  const bad = []
  for (const width of [360, 390, 430]) {
    for (const view of ["inspect", "compare", "responsive", "gallery", "present", "design"]) {
      const p = await open("normal", { width, height: 844, touch: true, hash: `view=${view}` })
      const m = await p.evaluate(() => {
        const wide = [...document.querySelectorAll("body *")].filter((e) => {
          const st = getComputedStyle(e)
          return e.scrollWidth > innerWidth + 1 && !["auto", "scroll"].includes(st.overflowX) && !e.closest(".preview-frame")
        })
        return { doc: document.documentElement.scrollWidth, iw: innerWidth, wide: wide.slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}:${e.scrollWidth}`) }
      })
      if (m.doc > m.iw || m.wide.length) bad.push(`${view}@${width} ${JSON.stringify(m)}`)
      await p.closeAll()
    }
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : "6 views at 360, 390 and 430 px: document and every wide region fit"]
})

// AC-04 Panels are reachable, trap focus, close and return focus; targets reach 44 px
await check("AC-04", async () => {
  const p = await open("normal", { width: 390, height: 844, touch: true })
  const coarse = await p.evaluate(() => matchMedia("(pointer: coarse)").matches)
  const notes = []
  let ok = true
  for (const name of ["Panel", "Details"]) {
    await p.getByRole("button", { name, exact: true }).click()
    await wait(700)
    const inside = await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    await p.keyboard.press("Escape")
    await wait(700)
    const back = await p.evaluate(() => document.activeElement?.textContent?.trim())
    const closed = (await p.locator('[role="dialog"]').count()) === 0
    notes.push(`${name}: focus inside ${inside}, closes ${closed}, focus back on "${back}"`)
    ok &&= inside && closed && back === name
  }
  const small = await p.evaluate(() => [...document.querySelectorAll('header button, [role="toolbar"] button, nav[aria-label="Views"] button')].filter((e) => e.offsetParent).map((e) => ({ n: e.getAttribute("aria-label") || e.textContent.trim().slice(0, 14), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })).filter((r) => r.w < 44 || r.h < 44))
  await p.closeAll()
  if (!coarse) return ["not-measured", "The browser did not report a coarse pointer; touch targets were not measured. " + notes.join("; ")]
  return [ok && !small.length ? "pass" : "fail", `${notes.join("; ")}; targets under 44 px: ${small.length ? JSON.stringify(small) : "none"}. Swipe and a real device are not covered.`]
})

// AC-05 Tokens scale and validate (1,000 tokens)
await check("AC-05", async () => {
  const p = await open("stress", { hash: "view=tokens" })
  const folded = await p.locator('[role="treegrid"] [aria-expanded="false"]').count()
  const rows0 = await p.locator('[role="treegrid"] [data-index]').count()
  await p.locator('[role="treegrid"] [aria-expanded="false"]').first().click()
  await wait(200)
  await p.locator('[role="treegrid"]').evaluate((e) => (e.scrollTop = e.scrollHeight))
  await wait(300)
  const rows1 = await p.locator('[role="treegrid"] [data-index]').count()
  await p.locator('[role="treegrid"] [role="row"][aria-selected]').first().click()
  await wait(300)
  const input = p.locator("#tok-light")
  await input.fill("notacolor")
  await wait(500)
  const message = await p.getByText(/Not a color this browser can read/).first().isVisible()
  const name = await p.locator("h2.font-mono").first().innerText()
  const frame = p.frames().find((f) => f !== p.mainFrame())
  const invalid = frame ? await frame.evaluate((n) => document.documentElement.style.getPropertyValue(n), name) : "no-frame"
  await input.fill("#123456")
  await wait(700)
  const valid = frame ? await frame.evaluate((n) => document.documentElement.style.getPropertyValue(n), name) : "no-frame"
  await p.closeAll()
  const ok = folded >= 1 && rows0 <= 200 && rows1 <= 200 && message && invalid === "" && valid === "#123456"
  return [ok ? "pass" : "fail", `families folded ${folded}, rows in DOM ${rows0} then ${rows1}, invalid draft: message ${message} and preview value "${invalid}", valid draft reached the preview "${valid}"`]
})

// AC-06 and AC-07 use the 40-step stress walkthrough with four broken steps
async function stepTo(p, target) {
  await p.locator('[aria-label="Steps"] [tabindex="0"]').focus()
  for (let i = 0; i < target; i++) {
    await p.keyboard.press("ArrowDown")
    await wait(25)
  }
}
await check("AC-06", async () => {
  const p = await open("stress", { hash: "view=present" })
  const cases = [
    [5, /not in the catalog/],
    [11, /Anchor no-such-anchor is missing/],
    [17, /Unknown command bogus-command/],
    [23, /marked Later/],
  ]
  const out = []
  let ok = true
  let at = 0
  for (const [index, pattern] of cases) {
    await stepTo(p, index - at)
    at = index
    await p.getByRole("alert").waitFor({ timeout: 8000 }).catch(() => {})
    const text = (await p.getByRole("alert").first().innerText().catch(() => "")).replace(/\s+/g, " ")
    const play = await p.getByRole("button", { name: /^Play$|^Pause$/ }).isDisabled()
    const hit = pattern.test(text)
    out.push(`step ${index + 1}: ${hit ? "stopped with reason" : `no reason (${text.slice(0, 40)})`}, play disabled ${play}`)
    ok &&= hit && play
  }
  await p.closeAll()
  return [ok ? "pass" : "fail", out.join("; ")]
})
await check("AC-07", async () => {
  const p = await open("stress", { hash: "view=present" })
  const segments = await p.locator(".seg-track i").count()
  const listRows = await p.locator('[aria-label="Steps"] [data-index]').count()
  const listStops = await p.locator('[aria-label="Steps"] [tabindex="0"]').count()
  const allSteps = await p.getByRole("button", { name: "All steps" }).isVisible()
  await p.keyboard.press("ArrowRight")
  await wait(300)
  const counted = await p.getByText(/2 of 40/).first().isVisible()
  await p.keyboard.press("Space")
  const playing = await p.getByRole("button", { name: "Pause" }).isVisible()
  await p.keyboard.press("Space")
  const frame = p.frames().find((f) => f !== p.mainFrame())
  await frame.getByRole("button", { name: "New task" }).click()
  await wait(500)
  const paused = await p.getByText(/Paused while you explore/).isVisible()
  await p.getByRole("button", { name: "Restore this step" }).click()
  await wait(1200)
  const restored = !(await p.getByText(/Paused while you explore/).isVisible())
  await p.closeAll()
  // Focus return needs a known opener: enter from the rail button, leave with Esc.
  const q = await open("stress", { hash: "view=inspect" })
  await q.getByRole("button", { name: "Present", exact: true }).first().click()
  await wait(800)
  await q.keyboard.press("Escape")
  await wait(500)
  const back = await q.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim())
  await q.closeAll()
  const ok = segments === 0 && listRows <= 40 && listStops === 1 && allSteps && counted && playing && paused && restored && back === "Present"
  return [ok ? "pass" : "fail", `segments ${segments}, list rows in DOM ${listRows}, list tab stops ${listStops}, All steps ${allSteps}, arrow key advanced ${counted}, Space plays ${playing}, touching pauses ${paused}, Restore works ${restored}, focus after Esc on "${back}"`]
})

// AC-08 Compare: two sides, separate runtimes, one changing axis at a time
await check("AC-08", async () => {
  const p = await open("normal", { hash: "view=compare" })
  const frames = p.frames().filter((f) => f !== p.mainFrame())
  await frames[frames.length - 1].getByRole("button", { name: "New task" }).click().catch(() => {})
  await wait(600)
  const captions = await p.locator("figcaption").allInnerTexts()
  const diverged = await p.getByText(/Sides diverged/).isVisible()
  const headerState = async (page) => (await page.locator("h2.font-heading + p + div").innerText()).replace(/\s+/g, " ")
  const detailsStatus = [await headerState(p)]
  await p.closeAll()
  const modified = captions.map((c) => /Modified/.test(c))
  // Axes: theme, profile and every scenario input; Details follows the pair; each axis leaves the others held.
  const q = await open("normal", { hash: "view=compare" })
  await q.getByRole("combobox", { name: "Changing axis" }).click()
  await wait(400)
  const axes = await q.getByRole("option").allInnerTexts()
  await q.getByRole("option", { name: "Profile" }).click()
  await q.getByRole("combobox", { name: "Side B" }).click()
  await q.getByRole("option", { name: "Phone" }).click()
  await wait(3500)
  const sized = await Promise.all(q.frames().filter((f) => f !== q.mainFrame()).map((f) => f.evaluate(() => ({ w: innerWidth, dark: document.documentElement.classList.contains("dark") }))))
  const settled = [(await q.locator("h2.font-heading + p + div").innerText()).replace(/\s+/g, " ")]
  const splitOff = await q.getByRole("radio", { name: "Split" }).isDisabled().catch(() => q.getByRole("button", { name: "Split" }).isDisabled())
  await q.closeAll()
  const axesOk = ["Theme", "Profile", "Density"].every((a) => axes.includes(a)) && sized.length === 2 && sized[0].w > sized[1].w && sized[0].dark === sized[1].dark && splitOff && /Ready/.test(settled[0])
  const ok = diverged && modified.filter(Boolean).length === 1 && !/Loading/.test(detailsStatus[0]) && /Modified/.test(detailsStatus[0]) && axesOk
  return [ok ? "pass" : "fail", `two sides: exactly one marked Modified ${modified.filter(Boolean).length === 1}, pair shown as diverged ${diverged}, Details header reads "${detailsStatus[0]}" after interacting, then "${settled[0]}"; axes offered ${axes.join(", ")}; profile axis: widths ${sized.map((x) => x.w).join(" and ")} with the theme held, Split disabled ${splitOff}. Sides beyond two and the Gallery matrix hand-off are not built.`]
})

// AC-09 Static captures claim only what they are
await check("AC-09", async () => {
  const p = await open("captures")
  const status = (await p.locator("header [aria-live]").innerText()).trim()
  const back = await p.getByRole("button", { name: "Product back" }).isDisabled()
  const reload = await p.getByRole("button", { name: "Reload capture" }).isVisible()
  const dark = await p.getByRole("button", { name: "Dark", exact: true }).first().isDisabled()
  const badge = await p.getByText("Static capture").first().isVisible()
  await p.locator('[role="treeitem"]', { hasText: "Settings" }).first().click()
  await wait(500)
  const empty = await p.getByText(/No capture for this combination/).isVisible()
  await p.closeAll()
  const ok = status === "Capture" && back && reload && dark && badge && empty
  return [ok ? "pass" : "fail", `status "${status}", Product back disabled ${back}, Reload capture ${reload}, Dark disabled ${dark}, static badge ${badge}, missing capture shows an explicit empty state ${empty}`]
})

// AC-10 The boundary holds for any product: sample the pixels across the frame edge.
// In both appearances the frame's lines are a deliberate quiet hairline (the outer line at most 20% black), so the
// edge only has to stay distinguishable (1.3:1) while the four corner ticks carry the 3:1 boundary.
await check("AC-10", async () => {
  const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  const rows = []
  const worst = { light: 99, dark: 99 }
  const need = { light: 1.3, dark: 1.3 }
  const quiet = []
  let ticksWorst = 99
  let structure = true
  for (const appearance of ["light", "dark"]) {
    const p = await open("normal", { appearance, hash: "view=inspect" })
    await p.keyboard.press("Shift+Digit0")
    await wait(600)
    // 100% zooms around the stage's centre; bring the frame's left edge into view to sample it.
    await p.evaluate(() => document.querySelector(".preview-frame").closest(".overflow-auto").scrollTo({ left: 0 }))
    await wait(200)
    const shell = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const stage = await p.evaluate(() => getComputedStyle(document.querySelector(".stage-surface")).backgroundColor)
    const frame = p.frames().find((f) => f !== p.mainFrame())
    const ticks = await p.locator(".preview-ticks i").count()
    const outer = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--boundary").trim())
    quiet.push(`${appearance} ${outer}`)
    // A dark line on the light stage was the loud one; on the dark stage the outer line is dark on dark.
    if (appearance === "light" && Number(/\/\s*([\d.]+)\s*\)/.exec(outer)?.[1] ?? 1) > 0.2) structure = false
    const fidelityShown = await p.getByText("Illustrative example").first().isVisible().catch(() => false)
    // Tick color composited over the stage, as pixels.
    const tickRgb = await p.evaluate(() => {
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 1
      const g = canvas.getContext("2d")
      g.fillStyle = getComputedStyle(document.querySelector(".stage-surface")).backgroundColor
      g.fillRect(0, 0, 1, 1)
      g.fillStyle = getComputedStyle(document.querySelector(".preview-ticks i")).borderTopColor
      g.fillRect(0, 0, 1, 1)
      return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3))
    })
    const stageRgb = await p.evaluate((c) => {
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 1
      const g = canvas.getContext("2d")
      g.fillStyle = c
      g.fillRect(0, 0, 1, 1)
      return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3))
    }, stage)
    ticksWorst = Math.min(ticksWorst, ratio(tickRgb, stageRgb))
    for (const [name, color] of [["near-white", "rgb(254,254,254)"], ["near-black", "rgb(3,3,3)"], ["mid-grey", stage], ["loud", "rgb(255,0,128)"], ["shell-match", shell]]) {
      await frame.evaluate((c) => {
        for (const v of ["--ex-surface", "--ex-ground"]) document.documentElement.style.setProperty(v, c)
        document.body.style.background = c
      }, color)
      await wait(150)
      const box = await p.locator(".preview-frame").boundingBox()
      const x = Math.round(box.x)
      const y = Math.round(box.y + box.height / 2)
      const png = await p.screenshot({ clip: { x: x - 8, y, width: 12, height: 1 } })
      const px = await p.evaluate(async (b64) => {
        const img = new Image()
        img.src = "data:image/png;base64," + b64
        await img.decode()
        const c = document.createElement("canvas")
        c.width = img.width
        c.height = 1
        const g = c.getContext("2d")
        g.drawImage(img, 0, 0)
        return Array.from({ length: img.width }, (_, i) => Array.from(g.getImageData(i, 0, 1, 1).data.slice(0, 3)))
      }, png.toString("base64"))
      // index 8 is the first pixel inside the frame; 7 and 6 are the two keylines; 4 is the stage.
      const edge = px[8]
      const best = Math.max(ratio(edge, px[7]), ratio(edge, px[6]), ratio(edge, px[4]))
      worst[appearance] = Math.min(worst[appearance], best)
      rows.push(`${appearance}/${name} ${best.toFixed(1)}:1`)
    }
    if (ticks !== 4 || !fidelityShown) structure = false
    await p.closeAll()
  }
  const ok = structure && worst.light >= need.light && worst.dark >= need.dark && ticksWorst >= 3
  return [ok ? "pass" : "fail", `outer line ${quiet.join(", ")} (at most 20% in light); worst edge contrast ${worst.light.toFixed(1)}:1 in light and ${worst.dark.toFixed(1)}:1 in dark (needs 1.3, a hairline by design) across ${rows.length} fixtures (${rows.join(", ")}); corner ticks ${ticksWorst.toFixed(1)}:1 against the stage (needs 3); four ticks, a quiet outer line and the fidelity statement in Details ${structure ? "present" : "missing"}`]
})

// AC-11 Scale is always disclosed, with 100% one action away
await check("AC-11", async () => {
  const bad = []
  for (const width of [1440, 1024, 390]) {
    for (const view of ["inspect", "compare", "responsive", "present", "design", "gallery"]) {
      const p = await open("normal", { width, height: 900, touch: width < 768, hash: `view=${view}` })
      const text = await p.locator("body").innerText()
      // Inspect and Responsive state size in the frame's Size control or label and scale in the Zoom control; the other views carry a chip under the frame.
      const said = view === "gallery" ? /thumbnails at about \d+%/.test(text) : view === "inspect" || view === "responsive" ? /\d+ × \d+/.test(text) && /Fit · \d+%|\b\d+%/.test(text) : /\d+ × \d+ · (\d+%|actual size)/.test(text)
      const action = view === "gallery" ? true : (await p.getByRole("button", { name: /Show at actual size|Fit to the stage/ }).count()) > 0 || (await p.getByRole("button", { name: /^Zoom/ }).count()) > 0
      if (!said || !action) bad.push(`${view}@${width}${said ? "" : " no scale"}${action ? "" : " no action"}`)
      await p.closeAll()
    }
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : "6 views at 1440, 1024 and 390 px state size and percentage; a 100% or Fit action is present (Gallery states its thumbnail scale and a card opens Inspect)"]
})

// AC-12 The Gallery size control keeps working under a pointer drag and the keyboard
await check("AC-12", async () => {
  const p = await open("normal", { hash: "view=gallery" })
  await wait(1500)
  const read = () => p.evaluate(() => ({ pct: Number(document.body.innerText.match(/about (\d+)%/)?.[1]), thumb: document.querySelector('[data-slot="slider-thumb"]').getAttribute("style") }))
  const before = await read()
  const box = await p.locator('[data-slot="slider-thumb"]').boundingBox()
  const y = box.y + box.height / 2
  await p.mouse.move(box.x + 8, y)
  await p.mouse.down()
  await p.mouse.move(box.x + 50, y, { steps: 8 })
  await p.mouse.up()
  await wait(1200)
  const dragged = await read()
  await p.getByRole("slider", { name: "Thumbnail size" }).focus()
  for (let i = 0; i < 6; i++) await p.keyboard.press("ArrowLeft")
  await wait(1200)
  const keyed = await read()
  await p.closeAll()
  const ok = dragged.pct > before.pct && keyed.pct < dragged.pct && !/visibility: hidden/.test(dragged.thumb + keyed.thumb)
  return [ok ? "pass" : "fail", `drag ${before.pct}% to ${dragged.pct}%, keyboard back to ${keyed.pct}%, thumb stays visible ${!/visibility: hidden/.test(dragged.thumb + keyed.thumb)}`]
})

// AC-13 Size: every profile is offered and mounts at its size; the live frame drags, nudges, snaps, lands on a profile, survives a reload and resets
await check("AC-13", async () => {
  const problems = []
  const sizeOf = (p) => p.frames().find((f) => f !== p.mainFrame()).evaluate(() => ({ w: innerWidth, h: innerHeight, marker: window.__marker }))
  const offered = async () => {
    const p = await open("normal", { hash: "view=inspect" })
    await p.getByRole("button", { name: /^Size,/ }).click()
    await p.getByRole("menuitemradio").first().waitFor()
    const items = (await p.getByRole("menuitemradio").allInnerTexts()).map((t) => t.replace(/\s+/g, " "))
    await p.closeAll()
    return items
  }
  const items = await offered()
  const expected = [["desktop", 1280, 800], ["tablet", 834, 1112], ["phone", 390, 844]]
  for (const [id, w, h] of expected) {
    const p = await open("normal", { hash: `view=inspect&profile=${id}` })
    const size = await sizeOf(p)
    if (size.w !== w || size.h !== h) problems.push(`${id} mounted ${size.w}x${size.h}, expected ${w}x${h}`)
    if (!items.some((t) => t.includes(`${w} × ${h}`))) problems.push(`the menu did not offer ${w} × ${h}`)
    await p.closeAll()
  }
  if (items.length !== expected.length) problems.push(`the menu offered ${items.length} sizes, expected ${expected.length}`)
  const p = await open("normal", { hash: "view=inspect&profile=tablet" })
  const frame = () => p.frames().find((f) => f !== p.mainFrame())
  await frame().evaluate(() => { window.__marker = "same-document" })
  const hashSize = () => p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("size"))
  const label = () => p.getByRole("button", { name: /^Size,/ }).getAttribute("aria-label")
  const widthHandle = p.getByRole("slider", { name: "Frame width" })
  const heightHandle = p.getByRole("slider", { name: "Frame height" })
  const centre = async (h) => { const b = await h.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  const frameBox = () => p.locator(".preview-frame").boundingBox()
  const start = await sizeOf(p)
  const fb = await frameBox()
  const scale = fb.width / start.w
  const cx = fb.x + fb.width / 2
  const dragTo = async (h, dx, dy) => {
    const c = await centre(h)
    await p.mouse.move(c.x, c.y)
    await p.mouse.down()
    await p.mouse.move(c.x + dx, c.y + dy, { steps: 8 })
    await p.mouse.up()
    await wait(500)
  }
  await dragTo(widthHandle, -(start.w - 600) * scale / 2, 0)
  const dragged = await sizeOf(p)
  if (!(dragged.w < start.w - 100)) problems.push(`dragging left gave ${dragged.w} from ${start.w}`)
  if (dragged.marker !== "same-document") problems.push("the frame reloaded during a drag")
  if (!/^\d+x\d+$/.test((await hashSize()) ?? "")) problems.push("the link did not carry size=")
  if (!/Custom/.test((await label()) ?? "")) problems.push(`the Size control read "${await label()}"`)
  await widthHandle.focus()
  await p.keyboard.press("ArrowRight")
  await p.keyboard.press("Shift+ArrowRight")
  await wait(300)
  const nudged = await sizeOf(p)
  if (nudged.w !== dragged.w + 11) problems.push(`keys moved the width ${dragged.w} to ${nudged.w}, expected +11`)
  await heightHandle.focus()
  await p.keyboard.press("ArrowDown")
  await wait(300)
  if ((await sizeOf(p)).h !== nudged.h + 1) problems.push("ArrowDown did not add 1 px of height")
  // Snap: drag the edge to within a few pixels of the profile width and it lands exactly on it.
  const now = await frameBox()
  const want = cx + (start.w * scale) / 2 + 3
  await dragTo(widthHandle, want - (now.x + now.width), 0)
  const landed = await sizeOf(p)
  if (landed.w !== start.w) problems.push(`dragging within 3 px of ${start.w} gave ${landed.w}`)
  // Back to the profile's exact size by a double-click, then a custom size must survive a reload.
  await widthHandle.dblclick()
  await wait(500)
  if ((await sizeOf(p)).w !== start.w) problems.push("double-click did not return to the profile width")
  if (await hashSize()) problems.push("the link kept size= after a reset")
  await dragTo(widthHandle, -80, 0)
  const custom = await sizeOf(p)
  await p.reload()
  await p.waitForSelector("header")
  await wait(1500)
  const reloaded = await sizeOf(p)
  if (reloaded.w !== custom.w || reloaded.h !== custom.h) problems.push(`reload gave ${reloaded.w}x${reloaded.h}, expected ${custom.w}x${custom.h}`)
  await p.closeAll()
  return [problems.length ? "fail" : "pass", problems.length ? problems.join("; ") : `menu offered ${items.length} sizes and each mounted at its size; a drag took the frame from ${start.w} to ${dragged.w} px with the same document alive, keys nudged by 11 and 1 px, an edge near ${start.w} landed on ${start.w}, a double-click reset, and a custom ${custom.w}x${custom.h} survived a reload`]
})

// AC-14 All steps lists every step and chooses one, with the side panel closed
await check("AC-14", async () => {
  const p = await open("stress", { hash: "view=present" })
  await wait(1200)
  await p.getByRole("button", { name: "Hide panel" }).first().click()
  await wait(500)
  await p.getByRole("button", { name: "All steps" }).click()
  const list = p.getByRole("list", { name: "All steps" })
  await list.waitFor()
  const listed = await list.locator("button").count()
  await list.locator("button").nth(4).click()
  await wait(700)
  const where = await p.getByText(/\d+ of \d+/i).first().innerText()
  const closed = (await p.getByRole("list", { name: "All steps" }).count()) === 0
  await p.closeAll()
  const ok = listed === 40 && /5 of 40/i.test(where) && closed
  return [ok ? "pass" : "fail", `${listed} steps listed (40 expected), choosing the fifth read "${where}", list closed ${closed}`]
})

// AC-15 Phone header: actions fold behind one trigger, stay on screen when open, fold on Esc; the mark's tile is square
await check("AC-15", async () => {
  const p = await open("normal", { width: 390, height: 844, touch: true, hash: "view=inspect" })
  const tile = () => p.locator("header span.aspect-square").boundingBox()
  const collapsed = await tile()
  const folded = await p.evaluate(() => ({ inert: document.getElementById("header-actions")?.hasAttribute("inert"), width: document.getElementById("header-actions")?.getBoundingClientRect().width ?? -1 }))
  await p.getByRole("button", { name: "More actions" }).tap()
  await wait(700)
  const names = ["Go to scenario", "Studio settings", "Studio appearance", "Copy link"]
  const off = []
  for (const n of names) {
    const b = await p.getByRole("button", { name: n }).boundingBox()
    if (!b || b.x < 0 || b.x + b.width > 390) off.push(n)
  }
  const title = await p.locator("header nav button").first().boundingBox()
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  const open_ = await tile()
  await p.keyboard.press("Escape")
  await wait(600)
  const folded2 = await p.getByRole("button", { name: "More actions" }).getAttribute("aria-expanded")
  await p.closeAll()
  const square = Math.abs(collapsed.width - collapsed.height) < 0.5 && Math.abs(open_.width - open_.height) < 0.5
  const ok = square && folded.inert && folded.width <= 2 && off.length === 0 && title && title.width > 40 && overflow <= 0 && folded2 === "false"
  return [ok ? "pass" : "fail", `folded actions inert ${folded.inert} and ${folded.width}px wide; open: ${off.length ? off.join(", ") + " off screen" : "all four on screen"}, title ${Math.round(title?.width ?? 0)} px, sideways scroll ${overflow}px; Esc folds ${folded2 === "false"}; tile ${collapsed.width}x${collapsed.height} folded and ${open_.width}x${open_.height} open`]
})

// AC-16 The rail names its views by default, including for a viewer whose stored options predate the default
await check("AC-16", async () => {
  const names = ["Inspect", "Compare", "Responsive", "Gallery", "Present", "Design"]
  const shown = async (seed) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    if (seed) await context.addInitScript(([k, v]) => localStorage.setItem(k, v), seed)
    const p = await context.newPage()
    await p.goto(servers.normal.url + "#view=inspect")
    await p.waitForSelector("header")
    await wait(1200)
    const got = await p.evaluate((list) => list.filter((n) => [...document.querySelectorAll('[data-slot="sidebar"] span')].some((el) => el.textContent.trim() === n && el.getBoundingClientRect().width > 0 && !el.classList.contains("sr-only"))), names)
    await context.close()
    return got
  }
  const fresh = await shown(null)
  const legacy = await shown(["studio.example-tasks.options", JSON.stringify({ controls: "dock", details: "docked", railLabels: false })])
  const chosen = await shown(["studio.example-tasks.rail-labels", "false"])
  const ok = fresh.length === names.length && legacy.length === names.length && chosen.length === 0
  return [ok ? "pass" : "fail", `first visit shows ${fresh.length} of ${names.length} labels, older stored options ${legacy.length}, a viewer who turned them off ${chosen.length}`]
})

// AC-17 A dock lens (the example's Role): designed by the scenario, changeable, in the link, a Compare axis, scoped, ignored by Present
await check("AC-17", async () => {
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list" })
  const btn = () => p.getByRole("button", { name: /^Role,/ })
  const frame = () => p.frames().find((f) => f !== p.mainFrame())
  const designed = await btn().getAttribute("aria-label")
  const newTask = () => frame().getByRole("button", { name: "New task" }).count()
  const ownerSees = await newTask()
  await btn().click()
  await p.getByRole("menuitemradio", { name: /^Viewer/ }).click()
  await wait(1500)
  const changed = await btn().getAttribute("aria-label")
  const viewerSees = await newTask()
  const hash = await p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("role"))
  await p.reload()
  await p.waitForSelector("header")
  await wait(1500)
  const kept = await btn().getAttribute("aria-label")
  await btn().click()
  await p.getByRole("menuitem", { name: /Back to Owner/ }).click()
  await wait(1500)
  const back = await newTask()
  await p.closeAll()
  const q = await open("normal", { hash: "view=inspect&scenario=account.sign-in" })
  const scoped = await q.getByRole("button", { name: /^Role,/ }).count()
  await q.closeAll()
  const c = await open("normal", { hash: "view=compare&scenario=tasks.list" })
  await c.getByRole("combobox", { name: "Changing axis" }).click()
  await wait(400)
  const axes = await c.getByRole("option").allInnerTexts()
  await c.closeAll()
  const ok = /^Role, Owner$/.test(designed ?? "") && ownerSees > 0 && /Viewer, changed$/.test(changed ?? "") && viewerSees === 0 && hash === "viewer" && kept === changed && back > 0 && scoped === 0 && axes.includes("Role")
  return [ok ? "pass" : "fail", `opened "${designed}", New task ${ownerSees}; Viewer: "${changed}", New task ${viewerSees}, link role=${hash}, after reload "${kept}"; Back to Owner New task ${back}; a screen without the lens shows it ${scoped} times; Compare axes ${axes.join(", ")}`]
})

// AC-43 A scenario offers only the input options it supports (Scenario.supports); the designed one is marked
await check("AC-43", async () => {
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list" })
  const frame = () => p.frames().find((f) => f !== p.mainFrame())
  const density = () => frame().evaluate(() => document.documentElement.dataset.density)
  // Density is in the dock's Design menu, after Contrast.
  const btn = () => p.getByRole("button", { name: /^Design,/ })
  const designed = (await btn().getAttribute("aria-label")).replace(/^Design, (Standard|High) contrast, /, "Density, ")
  await btn().click()
  await p.getByRole("menuitemradio").first().waitFor()
  const offered = (await p.getByRole("menuitemradio").allInnerTexts()).filter((t) => !/^(Standard|High)/.test(t))
  await p.getByRole("menuitemradio", { name: /^Compact/ }).click()
  await wait(1500)
  const compact = await density()
  const link = await p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("density"))
  await btn().click()
  await p.getByRole("menuitem", { name: /Back to Comfortable/ }).click()
  await wait(1500)
  const back = await density()
  await p.closeAll()
  const q = await open("normal", { hash: "view=inspect&scenario=account.sign-in&density=compact" })
  await q.getByRole("button", { name: /^Design,/ }).click()
  await wait(300)
  const hidden = await q.getByRole("group").filter({ hasText: /^Density/ }).count()
  await q.keyboard.press("Escape")
  const signIn = await q.frames().find((f) => f !== q.mainFrame()).evaluate(() => document.documentElement.dataset.density)
  await q.closeAll()
  const c = await open("normal", { hash: "view=compare&scenario=account.sign-in" })
  await c.getByRole("combobox", { name: "Changing axis" }).click()
  await wait(400)
  const axes = await c.getByRole("option").allInnerTexts()
  await c.closeAll()
  const ok = designed === "Density, Comfortable" && offered.length === 2 && /Comfortable[\s\S]*Designed/.test(offered[0]) && compact === "compact" && link === "compact" && back === "comfortable" && hidden === 0 && signIn === "comfortable" && !axes.includes("Density")
  return [ok ? "pass" : "fail", `opened "${designed}", offered ${offered.map((o) => o.replace(/\s+/g, " ")).join(" / ")}; Compact rendered ${compact}, link density=${link}; Back rendered ${back}; Sign in (supports Comfortable only, link asks Compact): control shown ${hidden} times, rendered ${signIn}; its Compare axes ${axes.join(", ")}`]
})

// AC-44 Design view: Adjust drafts reach the live frame without a remount, marks sit at shipped modes, the link carries the draft, Present and the Tokens tab are untouched
await check("AC-44", async () => {
  const p = await open("normal", { hash: "view=design&scenario=tasks.list&profile=desktop" })
  const frame = () => p.frames().find((f) => f !== p.mainFrame() && f.url().includes("example"))
  const prop = (name) => frame().evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
  await frame().evaluate(() => (window.__kept = "same document"))
  const built = await prop("--ex-row")
  const marks = await p.getByRole("button", { name: /^Density (Compact|Comfortable)/ }).allInnerTexts()
  await p.getByRole("button", { name: /^Density Compact/ }).click()
  await wait(600)
  const compact = [await prop("--ex-row"), await frame().evaluate(() => getComputedStyle(document.querySelector(".app")).getPropertyValue("--ex-space").trim()), await prop("--ex-space"), await prop("--ex-nav")]
  const badge = await p.getByText("Draft design", { exact: true }).isVisible()
  const thumb = p.getByRole("slider", { name: "Density" })
  await thumb.focus()
  for (let i = 0; i < 10; i++) await p.keyboard.press("ArrowRight")
  await wait(600)
  const between = await prop("--ex-row")
  const kept = await frame().evaluate(() => window.__kept)
  const hold = p.getByRole("button", { name: /Hold to see as built/ })
  const box = await hold.boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.mouse.down()
  await wait(500)
  const peeked = await prop("--ex-row")
  await p.mouse.up()
  await wait(500)
  const released = await prop("--ex-row")
  const link = await p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("design"))
  await p.reload()
  await p.waitForSelector("header")
  await wait(2000)
  const readout = await p.locator("output").first().innerText()
  const reloaded = await prop("--ex-row")
  await p.getByRole("button", { name: "Present" }).first().click()
  await wait(2500)
  const presented = await p.frames().find((f) => f !== p.mainFrame() && f.url().includes("example")).evaluate(() => document.documentElement.style.getPropertyValue("--ex-row"))
  await p.closeAll()
  const t = await open("normal", { hash: "view=tokens" })
  const tokensTab = (await t.getByRole("treegrid", { name: "Tokens" }).count()) === 1
  const tab = await t.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("tab"))
  const pressed = await t.getByRole("radio", { name: "Tokens" }).getAttribute("aria-checked").catch(() => null)
  await t.closeAll()
  const ok = built === "48px" && marks.join(",") === "Compact,Comfortable" && compact.join(",") === "38px,12px,16px,176px" && badge && between === "43px" && kept === "same document" && peeked === "48px" && released === "43px" && link === "density:0.9" && readout === "0.90×" && reloaded === "43px" && presented === "" && tokensTab && tab === "tokens"
  return [ok ? "pass" : "fail", `as built --ex-row ${built}; marks ${marks.join(", ")}; Compact mark gave --ex-row ${compact[0]}, --ex-space ${compact[1]} under .app (root still ${compact[2]}), --ex-nav ${compact[3]} from its base value; draft badge ${badge}; 0.90 gave ${between} (between the marks); frame document kept: ${kept}; holding As built showed ${peeked}, release ${released}; link design=${link}; after reload readout ${readout} and ${reloaded}; Present frame override "${presented}"; old view=tokens link opens the Tokens tab ${tokensTab} (tab=${tab}, pressed ${pressed})`]
})

const designFrame = (p) => p.frames().find((f) => f !== p.mainFrame() && f.url().includes("example"))
const frameProp = (p, name) => designFrame(p).evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)

// AC-45 Typography: typefaces from Google Fonts only, type scale and base size compose, line height, a specimen, and size warnings
await check("AC-45", async () => {
  const p = await open("normal", { hash: "view=design&scenario=tasks.list&profile=desktop&design=type-scale:1.9;text-size:0.75;leading:1.2" })
  await wait(1200)
  const title = await frameProp(p, "--ex-title")
  const text = await frameProp(p, "--ex-text")
  const leading = await frameProp(p, "--ex-leading")
  const warning = await p.getByText(/--ex-text is 11\.25px, under 12px/).isVisible()
  await p.getByLabel("Typeface, any Google Font name").fill("Inter")
  await p.keyboard.press("Enter")
  await wait(800)
  const font = await designFrame(p).evaluate(() => getComputedStyle(document.body).fontFamily)
  const specimen = await p.getByRole("complementary", { name: "Type specimen" }).innerText()
  // A stylesheet from any other host is never loaded, even if a message asks for it.
  await p.evaluate(() => {
    const f = [...document.querySelectorAll("iframe")].find((x) => x.style.opacity !== "0" && x.className.includes("opacity-100"))
    f.contentWindow.postMessage({ protocol: "studio-preview/1", instance: f.name, type: "draft-overrides", requestId: "probe", tokens: {}, css: "", stylesheets: ["https://example.com/font.css", "https://fonts.googleapis.com/css2?family=Inter&display=swap"] }, "*")
  })
  await wait(500)
  const links = await designFrame(p).evaluate(() => [...document.querySelectorAll("link[data-studio-draft]")].map((l) => new URL(l.href).host))
  await p.getByRole("combobox", { name: "Typeface typeface" }).click()
  await p.getByRole("option", { name: "Georgia" }).click()
  await wait(800)
  const local = await designFrame(p).evaluate(() => [getComputedStyle(document.body).fontFamily, document.querySelectorAll("link[data-studio-draft]").length])
  await p.closeAll()
  const ok = title === "21.38px" && text === "11.25px" && leading === "1.74" && warning && /^Inter,/.test(font) && /Typeface · Inter/.test(specimen) && links.length === 1 && links[0] === "fonts.googleapis.com" && /^Georgia,/.test(local[0]) && local[1] === 0
  return [ok ? "pass" : "fail", `type scale 1.9 then text size 0.75 gave --ex-title ${title} and --ex-text ${text}; line height 1.2 gave ${leading}; size warning shown ${warning}; Inter reached the body as ${font.split(",")[0]}; specimen lists ${specimen.split("\n")[1]}; draft stylesheet hosts after a request for two: ${links.join(", ")}; Georgia (local) gave ${local[0].split(",")[0]} with ${local[1]} stylesheets`]
})

// AC-46 Color: brand and accent colors, derived tokens follow, contrast is checked against the product's own grounds, fixed values are listed, neutral temperature tints grounds
await check("AC-46", async () => {
  const p = await open("normal", { hash: "view=design&scenario=tasks.list&profile=desktop&design=primary:%23b91c1c;neutral:1" })
  await wait(1200)
  const primary = await frameProp(p, "--ex-primary")
  const accent = await frameProp(p, "--ex-accent")
  const ground = await frameProp(p, "--ex-ground")
  const fixed = await p.getByText(/Won’t follow:/).innerText()
  const before = await p.getByText(/:1 against --ex-primary-ink/).count()
  await p.getByLabel("Primary color", { exact: true }).fill("#9ca3af")
  await p.keyboard.press("Enter")
  await wait(600)
  const warn = await p.getByText(/:1 against --ex-primary-ink, under 4\.5:1/).innerText().catch(() => "")
  await p.getByLabel("Accent color", { exact: true }).fill("#1e3a8a")
  await p.keyboard.press("Enter")
  await wait(600)
  const accent2 = await frameProp(p, "--ex-accent")
  const accentWarn = await p.getByText(/:1 against --ex-ink, under 4\.5:1/).count()
  await p.closeAll()
  const ok = primary === "#b91c1c" && /^color-mix\(in oklch, #b91c1c 18%, white\)$/.test(accent) && /^color-mix\(in oklch, #fafaf9, #ff9a3c 12%\)$/.test(ground) && /--ex-focus/.test(fixed) && before === 0 && /^Primary color: \d\.\d:1/.test(warn) && accent2 === "#1e3a8a" && accentWarn === 1
  return [ok ? "pass" : "fail", `primary ${primary}, derived accent ${accent}; warm neutral ground ${ground}; ${fixed}; a readable primary warns ${before} times, a grey primary warns "${warn}"; an accent set after the primary wins (${accent2}) and is checked against --ex-ink (${accentWarn} warning)`]
})

const rowOf = (f) => f?.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ex-row").trim())
const liveFrames = (p) => p.frames().filter((f) => f !== p.mainFrame() && f.url().includes("example"))
const downloaded = async (p, click) => {
  const [d] = await Promise.all([p.waitForEvent("download"), click()])
  return { name: d.suggestedFilename(), text: readFileSync(await d.path(), "utf8") }
}

// AC-47 Draft everywhere (off by default, per viewer, always labeled, never in Present), a Design axis in Compare, and Save as variant
await check("AC-47", async () => {
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list&profile=desktop&design=density:0.8" })
  await wait(800)
  const off = await rowOf(designFrame(p))
  const offBadge = await p.getByText("Draft design", { exact: true }).count()
  await p.getByRole("button", { name: "Design" }).first().click()
  await wait(800)
  await p.getByRole("switch", { name: "Show the draft in Inspect, Gallery and Compare" }).click()
  const file = await downloaded(p, async () => {
    await p.getByLabel("Save as a variant").fill("Tighter rows")
    await p.getByRole("button", { name: "Save", exact: true }).click()
  })
  const variant = JSON.parse(file.text)
  await p.getByRole("button", { name: "Inspect" }).first().click()
  await wait(1500)
  const on = await rowOf(designFrame(p))
  const onBadge = await p.getByText("Draft design", { exact: true }).isVisible()
  await p.getByRole("button", { name: "Gallery" }).first().click()
  await wait(2500)
  const thumbs = await Promise.all(liveFrames(p).slice(0, 3).map(rowOf))
  await p.getByRole("button", { name: "Compare" }).first().click()
  await wait(1200)
  await p.getByRole("combobox", { name: "Changing axis" }).click()
  await p.getByRole("option", { name: "Design" }).click()
  await wait(2000)
  const sides = await Promise.all([p.locator('iframe[title^="Side A"]').first(), p.locator('iframe[title^="Side B"]').first()].map(async (el) => rowOf(await (await el.elementHandle()).contentFrame())))
  const labels = await p.locator("figcaption b").allInnerTexts()
  await p.getByRole("button", { name: "Present" }).first().click()
  await wait(2500)
  const presented = await designFrame(p).evaluate(() => document.documentElement.style.getPropertyValue("--ex-row"))
  await p.reload()
  await p.waitForSelector("header")
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.endsWith(".options")) ?? "{}")).draftEverywhere)
  await p.closeAll()
  const ok = off === "48px" && offBadge === 0 && on === "38px" && onBadge && thumbs.length > 0 && thumbs.every((x) => x === "38px") && labels.join(",") === "As built,Draft" && sides.join(",") === "48px,38px" && presented === "" && kept === true && file.name === "tighter-rows.json" && variant.id === "variant.tighter-rows" && variant.overrides["--ex-row"]?.light === "38px" && variant.overrides["--ex-row"]?.dark === "38px"
  return [ok ? "pass" : "fail", `switch off: Inspect ${off}, badges ${offBadge}; on: Inspect ${on} with badge ${onBadge}, Gallery thumbnails ${thumbs.join(" ")}; Compare Design axis ${labels.join(" vs ")} rendered ${sides.join(" and ")}; Present override "${presented}"; switch kept after reload ${kept}; saved ${file.name} as ${variant.id} with --ex-row ${JSON.stringify(variant.overrides["--ex-row"])}`]
})

// AC-48 Export: the draft as a CSS and a JSON token diff, from and to per theme, labeled a proposal
await check("AC-48", async () => {
  const p = await open("normal", { hash: "view=design&scenario=tasks.list&profile=desktop&design=density:0.8;body-font:Georgia" })
  await wait(800)
  const css = await downloaded(p, () => p.getByRole("button", { name: "CSS", exact: true }).click())
  const json = await downloaded(p, () => p.getByRole("button", { name: "JSON", exact: true }).click())
  await p.closeAll()
  const diff = JSON.parse(json.text)
  const ok = css.name === "draft-tokens.css" && /never a decision/.test(css.text) && /Light \(light\) \*\/\n:root \{[\s\S]*--ex-row: 38px; \/\* was 48px \*\//.test(css.text) && /--ex-font: "Georgia", /.test(css.text) && diff.schema === "studio-token-diff/1" && diff.themes.light["--ex-row"].from === "48px" && diff.themes.light["--ex-row"].to === "38px" && diff.themes.dark["--ex-space"].to === "12px" && diff.design === "density:0.8;body-font:Georgia"
  return [ok ? "pass" : "fail", `${ok ? "" : JSON.stringify(css.text) + " "}${css.name}: ${css.text.split("\n").length} lines with from and to per theme; ${json.name}: light --ex-row ${JSON.stringify(diff.themes.light["--ex-row"])}, dark --ex-space ${JSON.stringify(diff.themes.dark["--ex-space"])}, design ${diff.design}`]
})

// ---------- Responsive view (AC-18 to AC-27) ----------
const exFrames = (p) => p.frames().filter((f) => f !== p.mainFrame() && f.url().includes("example"))
// The dock's zoom control states the row's one scale.
const chip = (p) => p.locator('[aria-label^="Zoom, "]').first().getAttribute("aria-label")
async function allReady(p, n, timeout = 30000) {
  await p.waitForFunction((count) => {
    const fs = [...document.querySelectorAll("[data-frame]")]
    return fs.length === count && fs.every((f) => f.querySelector("iframe.opacity-100") && !/Loading|Did not start/.test(f.querySelector("figcaption")?.textContent ?? ""))
  }, n, { timeout })
  await wait(400)
}
const frameSizes = async (p) => {
  const out = []
  for (const el of await p.locator("[data-frame] iframe.opacity-100").all()) {
    const f = await (await el.elementHandle()).contentFrame()
    out.push(await f.evaluate(() => ({ w: innerWidth, h: innerHeight, mounted: window.__studioMounted })))
  }
  return out
}
const scaleOf = async (p) => Number(/(\d+)%/.exec(await chip(p))?.[1] ?? 100) / 100

// AC-18 Presets: each shows exactly its frames in order at their declared sizes, labeled, the adapter's first
await check("AC-18", async () => {
  const expected = { "task-sizes": [[390, 844], [834, 1112], [1280, 800]], phones: [[360, 780], [390, 844], [430, 932]], "phone-tablet-laptop": [[390, 844], [834, 1112], [1280, 800]], desktops: [[1280, 800], [1440, 900], [1920, 1080]] }
  const bad = []
  let firstPreset = ""
  let details = ""
  for (const [id, sizes] of Object.entries(expected)) {
    const p = await open("normal", { hash: `view=responsive&scenario=tasks.list&layout=${id}` })
    await allReady(p, sizes.length)
    const got = await frameSizes(p)
    const labels = await p.locator("[data-frame] figcaption").allInnerTexts()
    if (got.map((x) => `${x.w}x${x.h}`).join(",") !== sizes.map(([w, h]) => `${w}x${h}`).join(",")) bad.push(`${id}: ${got.map((x) => `${x.w}x${x.h}`).join(",")}`)
    if (!labels.every((t, i) => t.includes(`${sizes[i][0]} × ${sizes[i][1]}`))) bad.push(`${id} labels ${labels.join(" | ")}`)
    if (id === "task-sizes") {
      firstPreset = await p.locator('ul[data-sidebar="menu"] li').first().innerText().catch(() => "")
      details = await p.locator("aside, [data-slot=sidebar]").last().innerText().catch(() => "")
    }
    await p.closeAll()
  }
  const ok = !bad.length && /Task list sizes/.test(firstPreset) && /Illustrative example/.test(details)
  return [ok ? "pass" : "fail", bad.length ? bad.join("; ") : `4 layouts (the adapter's first: "${firstPreset.split("\n")[0]}") each mounted exactly its frames in order, every live document at its declared size, every label naming its size; Details states the fidelity`]
})

// AC-19 One shared scale, stated once (in the dock's zoom control); widths proportional within 1 px; no page scroll from 360 to 1600 px; below the floor only the stage scrolls
await check("AC-19", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phone-tablet-laptop" })
  await allReady(p, 3)
  const rects = await p.locator("[data-frame] .preview-frame").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))
  // The chip rounds the percentage; the frames share the exact scale, read from the first frame.
  const k = rects[0] / 390
  const stated = await scaleOf(p)
  const drift = Math.max(...[390, 834, 1280].map((w, i) => Math.abs(rects[i] - w * k))) + (Math.abs(stated - k) > 0.006 ? 100 : 0)
  await p.locator('[aria-label^="Zoom, "]').first().click()
  await wait(300)
  const hundred = await p.getByRole("menuitemradio", { name: /^100%/ }).count()
  await p.keyboard.press("Escape")
  await p.closeAll()
  const scrolled = []
  for (const width of [360, 390, 768, 1024, 1280, 1440, 1600]) {
    const q = await open("normal", { width, height: 900, touch: width < 768, hash: "view=responsive&scenario=tasks.list&layout=desktops" })
    await wait(1500)
    const m = await q.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth }))
    if (m.doc > 1) scrolled.push(`${width}: ${m.doc}px`)
    await q.closeAll()
  }
  const f = await open("normal", { width: 1024, height: 900, hash: "view=responsive&scenario=tasks.list&layout=desktops" })
  await wait(2000)
  const floor = await chip(f)
  const stage = await f.evaluate(() => { const b = document.querySelector("[data-frame]")?.closest(".overflow-auto"); return b ? b.scrollWidth - b.clientWidth : 0 })
  await f.closeAll()
  const ok = drift <= 1 && hundred === 1 && !scrolled.length && /20%/.test(floor) && stage > 0
  return [ok ? "pass" : "fail", `one scale ${Math.round(k * 100)}%, widest drift from proportional ${drift.toFixed(2)} px, 100% one action (${hundred}); page scroll at ${scrolled.length ? scrolled.join(", ") : "no width from 360 to 1600"}; at 1024 px the desktops stop at "${floor.split("·").pop().trim()}" and the stage scrolls ${stage} px inside itself`]
})

// AC-20 Frames differ only in size and profile; a change restages all with the previous shown until ready; with sync off, interaction modifies one frame; an error stays in its frame
await check("AC-20", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phone-tablet-laptop&sync=off" })
  await allReady(p, 3)
  const before = await frameSizes(p)
  const strip = (m) => JSON.stringify({ ...m, profile: undefined })
  const same = before.every((x) => strip(x.mounted) === strip(before[0].mounted))
  const profiles = new Set(before.map((x) => x.mounted.profile)).size
  await p.getByRole("toolbar", { name: "Preview controls" }).getByLabel("Dark").click()
  // Each frame stages its new runtime behind the one on screen.
  let staged = 0
  for (let i = 0; i < 40 && staged <= 3; i++) {
    staged = Math.max(staged, await p.locator("[data-frame] iframe").count())
    await wait(50)
  }
  await allReady(p, 3)
  const dark = (await frameSizes(p)).every((x) => x.mounted.theme === "dark")
  const first = await (await p.locator("[data-frame] iframe.opacity-100").first().elementHandle()).contentFrame()
  await first.getByRole("button", { name: "New task" }).click()
  await wait(800)
  const modified = await p.locator("[data-frame] figcaption").allInnerTexts()
  await p.closeAll()
  const q = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones&frames=290x640:phone,390x844:phone" })
  await wait(4000)
  const caps = await q.locator("[data-frame]").allInnerTexts()
  await q.closeAll()
  const ok = same && profiles === 3 && staged > 3 && dark && /Modified/.test(modified[0]) && !/Modified/.test(modified[1]) && !/Modified/.test(modified[2]) && /narrower than 300 px/.test(caps[0]) && !/did not start/i.test(caps[1])
  return [ok ? "pass" : "fail", `mount inputs equal apart from profile ${same} (${profiles} profiles); Dark staged ${staged} frames for 3 shown, then all dark ${dark}; New task in one frame marked ${modified.map((m) => (/Modified/.test(m) ? "Modified" : "clean")).join(", ")}; a 290 px frame said "${/narrower[^.]*/.exec(caps[0])?.[0] ?? caps[0].slice(0, 60)}" while its neighbour stayed live`]
})

// AC-21 Add and remove: profiles, devices, typed sizes, refusals with reasons, a limit of six, disposal, and the last frame stays
let at21 = ""
await check("AC-21", async () => {
  try {
    return await ac21()
  } catch (e) {
    throw new Error(`at ${at21}: ${String(e).split("\n")[0]}`)
  }
})
async function ac21() {
  at21 = "open"
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones" })
  await allReady(p, 3)
  const addMenu = async () => {
    await p.keyboard.press("Escape")
    await p.keyboard.press("Escape")
    await wait(200)
    await p.getByRole("toolbar", { name: "Responsive controls" }).getByRole("button", { name: /Add frame/ }).click()
    await p.getByRole("menuitem", { name: "Custom size…" }).waitFor()
  }
  at21 = "profile"
  await addMenu()
  await p.getByRole("menuitem", { name: /^Tablet/ }).first().click()
  at21 = "device"
  await addMenu()
  await p.getByRole("menuitem", { name: "Devices" }).click()
  await p.getByRole("menuitem", { name: /Tablet, landscape/ }).waitFor()
  await p.getByRole("menuitem", { name: /Tablet, landscape/ }).click()
  at21 = "refused size"
  await p.keyboard.press("Escape")
  await p.getByLabel("Custom width").fill("5000")
  await p.getByLabel("Custom height").fill("800")
  await p.getByRole("button", { name: "Add", exact: true }).click()
  const refused = await p.locator("[data-sonner-toast]").last().innerText().catch(() => "")
  at21 = "custom size from the menu"
  await addMenu()
  await p.getByRole("menuitem", { name: "Custom size…" }).click()
  await wait(300)
  const focused = await p.evaluate(() => document.activeElement?.getAttribute("aria-label"))
  await p.getByLabel("Custom width").fill("1024")
  await p.getByLabel("Custom height").fill("768")
  await p.getByRole("button", { name: "Add", exact: true }).click()
  await wait(500)
  const six = await p.locator("[data-frame]").count()
  const disabled = await p.getByRole("toolbar", { name: "Responsive controls" }).getByRole("button", { name: /Add frame/ }).isDisabled()
  at21 = "six ready"
  await allReady(p, 6, 45000)
  at21 = "remove"
  await p.getByRole("button", { name: "Remove 360 by 780" }).click()
  await wait(1000)
  const after = await p.locator("iframe").count()
  at21 = "switch layouts"
  for (let i = 0; i < 10; i++) {
    await p.getByRole("button", { name: i % 2 ? "Phones" : "Desktops" }).first().click()
    await wait(250)
  }
  await wait(2500)
  const shown = await p.locator("[data-frame]").count()
  const iframes = await p.locator("iframe").count()
  await p.closeAll()
  at21 = "last frame"
  const one = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones&frames=390x844:phone" })
  const last = await one.getByRole("button", { name: "Remove 390 by 844" }).isDisabled()
  await one.closeAll()
  at21 = "captures"
  const c = await open("captures", { hash: "view=responsive&layout=phones" })
  await c.getByLabel("Custom width").fill("1000")
  await c.getByRole("button", { name: "Add", exact: true }).click()
  const capRefused = await c.locator("[data-sonner-toast]").last().innerText().catch(() => "")
  await c.closeAll()
  const ok = /5000 × 800 can't be a frame here[\s\S]*Outside the sizes/.test(refused) && six === 6 && disabled && after === 5 && iframes <= shown && last && /only its recorded sizes/.test(capRefused) && focused === "Custom width"
  return [ok ? "pass" : "fail", `Custom size… focused the panel's width field (${focused}); a profile, a device and a typed size reached ${six} frames and Add frame was then disabled ${disabled}; 5000 × 800 was refused ("${refused.replace(/\s+/g, " ").slice(0, 90)}"); removing one left ${after} frames within a second; ten layout switches left ${iframes} iframes for ${shown} frames; the last frame's Remove disabled ${last}; a captures Studio refused a typed size ("${capRefused.replace(/\s+/g, " ").slice(0, 60)}")`]
}

// AC-22 A frame is placed anywhere by dragging its label: it follows the pointer, the others stay, its page is kept, the stage grows
// to reach it, the place survives a reload and travels in the link; Alt and an arrow moves it 8 px; Back to a row returns the flowing
// row; the Frames list still reorders with Alt and an arrow
await check("AC-22", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones" })
  await allReady(p, 3)
  const order = () => p.locator("[data-frame] figcaption").evaluateAll((els) => els.map((e) => e.textContent.match(/\d+ × \d+/)[0]))
  const rects = () => p.locator("[data-frame] .preview-frame").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, k: r.width / Number(e.closest("[data-frame]").querySelector("figcaption").textContent.match(/(\d+) ×/)[1]) } }))
  // Placement at 100%: each frame's offset from the second frame, divided by the scale on screen.
  const units = (rs) => rs.map((q) => ({ x: (q.x - rs[1].x) / q.k, y: (q.y - rs[1].y) / q.k }))
  const stageH = () => p.evaluate(() => document.querySelector("[data-frame]").closest(".overflow-auto").scrollHeight)
  const doc = await (await p.locator("[data-frame] iframe.opacity-100").first().elementHandle()).contentFrame()
  await doc.evaluate(() => (window.__kept = "same document"))
  const r0 = await rects()
  const h0 = await stageH()
  const a = await p.locator("[data-frame-label]").nth(0).boundingBox()
  await p.mouse.move(a.x + 20, a.y + a.height / 2)
  await p.mouse.down()
  for (let i = 1; i <= 20; i++) {
    await p.mouse.move(a.x + 20 + i * 9, a.y + a.height / 2 + i * 18)
    await wait(16)
  }
  await p.mouse.up()
  await wait(500)
  const r1 = await rects()
  const h1 = await stageH()
  const kept = await (await (await p.locator("[data-frame] iframe.opacity-100").first().elementHandle()).contentFrame()).evaluate(() => window.__kept)
  const moved = { x: r1[0].x - r0[0].x, y: r1[0].y - r0[0].y }
  const others = Math.max(...[1, 2].map((i) => Math.max(Math.abs(r1[i].x - r0[i].x), Math.abs(r1[i].y - r0[i].y))))
  const link = await p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("frames"))
  await p.reload()
  await allReady(p, 3)
  const r2 = await rects()
  const u1 = units(r1)
  const reloaded = Math.max(...units(r2).map((q, i) => Math.max(Math.abs(q.x - u1[i].x), Math.abs(q.y - u1[i].y))))
  await p.locator("[data-frame-label]").nth(0).focus()
  const k0 = (await rects())[0]
  await p.keyboard.press("Alt+ArrowRight")
  await wait(300)
  const k1 = (await rects())[0]
  const said = await p.locator("p[aria-live=polite]").allInnerTexts()
  await p.getByRole("button", { name: "Back to a row" }).click()
  await wait(500)
  const back = await rects()
  const flowing = Math.abs(back[0].y - back[1].y) < 1 && Math.abs(back[1].y - back[2].y) < 1
  const start = await order()
  await p.locator('ul[aria-label="Frames"] li').nth(2).focus()
  await p.keyboard.press("Alt+ArrowUp")
  await wait(300)
  const listed = await order()
  await p.closeAll()
  const step = Math.round((k1.x - k0.x) / k0.k)
  const ok = Math.abs(moved.x - 180) <= 5 && Math.abs(moved.y - 360) <= 5 && others <= 3 && kept === "same document" && h1 > h0 && /@\d+\.\d+/.test(link ?? "") && reloaded <= 2 && step === 8 && said.some((t) => /Moved \d+ by \d+/.test(t)) && flowing && listed[1] === start[2]
  return [ok ? "pass" : "fail", `a 180, 360 px label drag moved the frame ${Math.round(moved.x)}, ${Math.round(moved.y)} and the others at most ${others.toFixed(1)} px; its page was kept (${kept}); the stage grew ${h0} to ${h1} px; link frames=${link}; after a reload the placement at 100% was within ${reloaded.toFixed(1)} px; Alt+Right moved it ${step} px at 100%; announced "${said.filter(Boolean).join(" ")}"; Back to a row flowing ${flowing}; Alt+Up in the frame list gave ${listed.join(", ")}`]
})

// AC-23 Saving: the dev server writes a valid layouts.json that restores exactly; rename, duplicate, delete; presets stay read only; a built Studio loads but cannot save; unsaved edits persist and travel in the link; the endpoint refuses what it should
await check("AC-23", async () => {
  const file = join(root, "layouts.json")
  const backup = existsSync(file) ? `${file}.acceptance-backup` : null
  if (backup) copyFileSync(file, backup)
  const port = 5391
  const dev = spawn("npx", ["vite", "--port", String(port), "--strictPort", "--logLevel", "error"], { cwd: root, stdio: "ignore", env: { ...process.env, VITE_STUDIO_ADAPTER: "example" } })
  try {
    const url = `http://localhost:${port}/`
    for (let i = 0; i < 60 && !(await fetch(url).then((r) => r.ok).catch(() => false)); i++) await wait(500)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await context.newPage()
    p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Checkout sizes, renamed" : undefined))
    await p.goto(`${url}#view=responsive&scenario=tasks.list&layout=phones`)
    await p.waitForSelector("header")
    await wait(2500)
    const presetSave = await p.getByRole("button", { name: "Save", exact: true }).count()
    await p.getByRole("button", { name: "Remove 360 by 780" }).click()
    await p.getByRole("button", { name: /Save as/ }).first().click()
    await p.getByLabel("Save as a new layout").fill("Checkout sizes")
    await p.getByRole("button", { name: "Save", exact: true }).last().click()
    await wait(800)
    const written = JSON.parse(readFileSync(file, "utf8"))
    await p.reload()
    await p.waitForSelector("header")
    await wait(2500)
    await p.getByRole("button", { name: "Checkout sizes" }).first().click()
    await wait(800)
    const restored = await p.locator("[data-frame] figcaption").evaluateAll((els) => els.map((e) => e.textContent.match(/\d+ × \d+/)[0]))
    await p.getByRole("button", { name: "More layout actions" }).click()
    await p.getByRole("menuitem", { name: "Rename" }).click()
    await wait(600)
    await p.getByRole("button", { name: "More layout actions" }).click()
    await p.getByRole("menuitem", { name: "Duplicate" }).click()
    await wait(600)
    const two = JSON.parse(readFileSync(file, "utf8")).layouts.map((l) => l.name)
    await p.getByRole("button", { name: "More layout actions" }).click()
    await p.getByRole("menuitem", { name: "Delete" }).click()
    await wait(600)
    const one = JSON.parse(readFileSync(file, "utf8")).layouts.map((l) => l.name)
    // A save after layouts.json changed elsewhere (another browser) is refused with 409: nothing is overwritten, the list
    // shows the latest file, the working layout keeps its unsaved edit, and saving again then writes it.
    await p.getByRole("button", { name: "Checkout sizes, renamed" }).first().click()
    await wait(800)
    await p.getByRole("button", { name: "Remove 430 by 932" }).click()
    await wait(300)
    const theirs = JSON.parse(readFileSync(file, "utf8"))
    theirs.layouts.push({ ...theirs.layouts[0], id: "from-elsewhere", name: "From elsewhere" })
    const other = await browser.newContext()
    const q = await other.newPage()
    await q.goto(url)
    const otherStatus = await q.evaluate((body) => fetch("__studio/layouts", { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.status), JSON.stringify(theirs))
    await other.close()
    const onDisk = readFileSync(file, "utf8")
    await p.getByRole("button", { name: "Save", exact: true }).first().click()
    await wait(1000)
    const conflict = {
      kept: readFileSync(file, "utf8") === onDisk,
      listed: await p.getByRole("button", { name: "From elsewhere" }).count(),
      frames: await p.locator("[data-frame]").count(),
      unsaved: await p.getByText("Unsaved", { exact: true }).count(),
      told: await p.locator("[data-sonner-toast]").filter({ hasText: /changed elsewhere/ }).innerText().catch(() => ""),
    }
    await p.getByRole("button", { name: "Save", exact: true }).first().click()
    await wait(1000)
    const retried = JSON.parse(readFileSync(file, "utf8")).layouts.map((l) => `${l.name} ${l.frames.length}`)
    // A merge leaves layouts.json unreadable: a save (here Rename) is refused, the list keeps its layouts and the file is untouched.
    const merged = `<<<<<<< ours\n${readFileSync(file, "utf8")}=======\n{}\n>>>>>>> theirs\n`
    writeFileSync(file, merged)
    const listedBefore = await p.getByRole("button", { name: "From elsewhere" }).count()
    await p.getByRole("button", { name: "More layout actions" }).click()
    await p.getByRole("menuitem", { name: "Rename" }).click()
    await wait(1000)
    const unreadable = {
      untouched: readFileSync(file, "utf8") === merged,
      listed: await p.getByRole("button", { name: "From elsewhere" }).count(),
      before: listedBefore,
      told: await p.locator("[data-sonner-toast]").filter({ hasText: /not a valid layouts file/ }).innerText().catch(() => ""),
      // After that refusal the page offers no layouts save until it is reloaded.
      after: await p.getByRole("button", { name: /Save as/ }).first().isDisabled(),
    }
    // A page opened on a layouts.json that is JSON but not a layouts file never offers a save that would replace it.
    // (A file that is not JSON at all stops the dev server's bundled import before the page renders.)
    writeFileSync(file, `${JSON.stringify({ schema: "studio-layouts/1", layouts: "merged by hand" })}\n`)
    const fresh0 = await context.newPage()
    await fresh0.goto(`${url}#view=responsive&scenario=tasks.list&layout=phones`)
    await fresh0.waitForSelector("header")
    await wait(1500)
    unreadable.loaded = { disabled: await fresh0.getByRole("button", { name: /Save as/ }).first().isDisabled(), reason: await fresh0.getByText(/is not a valid layouts file/).count() }
    await fresh0.close()
    writeFileSync(file, `${JSON.stringify(theirs, null, 2)}\n`)
    // Until layouts.json (and its revision) has been read, no save is offered; then it is.
    let release
    const held = new Promise((r) => (release = r))
    const early = await context.newPage()
    await early.route("**/__studio/layouts", async (route) => (route.request().method() === "GET" ? (await held, route.continue()) : route.continue()))
    await early.goto(`${url}#view=responsive&scenario=tasks.list&layout=phones`)
    await early.waitForSelector("header")
    await wait(800)
    const loading = { disabled: await early.getByRole("button", { name: /Save as/ }).first().isDisabled(), reason: await early.getByText("Loading layouts…").count() }
    release()
    for (let i = 0; i < 50 && (await early.getByRole("button", { name: /Save as/ }).first().isDisabled()); i++) await wait(100)
    loading.after = await early.getByRole("button", { name: /Save as/ }).first().isDisabled()
    await early.close()
    await context.close()
    const post = (body, headers = {}) => fetch(`${url}__studio/layouts`, { method: "POST", headers: { "content-type": "application/json", origin: `http://localhost:${port}`, ...headers }, body })
    const cross = (await post(JSON.stringify(written), { origin: "https://evil.example" })).status
    const invalid = (await post(JSON.stringify({ schema: "studio-layouts/1", layouts: [{ id: "Bad ID", name: "", frames: [] }] }))).status
    const huge = (await post(JSON.stringify({ schema: "studio-layouts/1", pad: "x".repeat(300 * 1024), layouts: [] }))).status
    // A built Studio: saved layouts load, Save is disabled with the reason, unsaved edits survive a reload and travel in the link.
    const b = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones" })
    const builtSave = await b.getByRole("button", { name: /Save as/ }).first().isDisabled()
    const reason = await b.getByText(/Saving needs the local Studio/).count()
    await b.getByRole("button", { name: "Remove 430 by 932" }).click()
    await wait(300)
    const link = await b.evaluate(() => location.hash)
    await b.reload()
    await b.waitForSelector("header")
    await wait(1500)
    const kept = await b.locator("[data-frame]").count()
    const unsaved = await b.getByText("Unsaved", { exact: true }).count()
    await b.closeAll()
    const fresh = await open("normal", { hash: link.slice(1) })
    await wait(1200)
    const shared = await fresh.locator("[data-frame]").count()
    await fresh.closeAll()
    const ok = presetSave === 0 && written.schema === "studio-layouts/1" && written.layouts[0]?.name === "Checkout sizes" && written.layouts[0].frames.length === 2 && restored.join() === "390 × 844,430 × 932" && two.join("|") === "Checkout sizes, renamed|Checkout sizes, renamed copy" && one.join("|") === "Checkout sizes, renamed" && cross === 403 && invalid === 422 && huge === 413 && builtSave && reason > 0 && kept === 2 && unsaved > 0 && shared === 2 && /frames=/.test(link) && otherStatus === 200 && conflict.kept && conflict.listed > 0 && conflict.frames === 1 && conflict.unsaved > 0 && /latest is loaded/.test(conflict.told) && retried.join("|") === "Checkout sizes, renamed 1|From elsewhere 2" && unreadable.untouched && unreadable.before > 0 && unreadable.listed === unreadable.before && /not a valid layouts file/.test(unreadable.told) && unreadable.after && unreadable.loaded.disabled && unreadable.loaded.reason > 0 && loading.disabled && loading.reason > 0 && !loading.after
    return [ok ? "pass" : "fail", `a preset offers no Save (${presetSave}); Save as wrote ${written.layouts.length} layout "${written.layouts[0]?.name}" with ${written.layouts[0]?.frames.length} frames, restored after a reload as ${restored.join(", ")}; rename and duplicate gave ${two.join(" and ")} (the copy opens), and deleting the copy left ${one.join(", ")}; the endpoint answered ${cross} to another origin, ${invalid} to an invalid file, ${huge} to an oversized one; a built Studio disables Save as (${builtSave}) and says why, kept ${kept} unsaved frames across a reload marked Unsaved, and its link opened ${shared} frames in a fresh browser; after another browser saved (${otherStatus}) a stale Save left the file as that browser wrote it (${conflict.kept}), listed its layout (${conflict.listed}), kept ${conflict.frames} unsaved frame (Unsaved ${conflict.unsaved > 0}) and said "${conflict.told.replace(/\s+/g, " ")}"; saving again wrote ${retried.join(", ")}; with layouts.json left unreadable by a merge, a save left it untouched (${unreadable.untouched}), the list kept From elsewhere (${unreadable.before} then ${unreadable.listed}) and said "${unreadable.told.replace(/\s+/g, " ")}", then offered no save (${unreadable.after}); a page opened on it disabled Save as (${unreadable.loaded.disabled}) and said why (${unreadable.loaded.reason}) for a JSON file that is not a layouts file; while layouts.json was still loading Save as was disabled (${loading.disabled}) with "Loading layouts…" (${loading.reason}), and enabled once read (${!loading.after})`]
  } finally {
    dev.kill()
    if (backup) copyFileSync(backup, file), rmSync(backup)
    else rmSync(file, { force: true })
  }
})

// AC-24 A capture-only Studio: frames at recorded sizes show the capture; others say unavailable; nothing is substituted
await check("AC-24", async () => {
  const p = await open("captures", { hash: "view=responsive&layout=phone-tablet-laptop" })
  await wait(1500)
  const cards = await p.locator("[data-frame]").allInnerTexts()
  const imgs = await p.locator("[data-frame] img").count()
  await p.closeAll()
  const ok = imgs === 1 && /No capture at 390 × 844/.test(cards[0]) && /No capture at 834 × 1112/.test(cards[1]) && !/No capture/.test(cards[2])
  return [ok ? "pass" : "fail", `${imgs} capture shown (1280 × 800, the recorded size); the phone and tablet frames say ${cards.slice(0, 2).map((c) => `"${/No capture at [^\n]*/.exec(c)?.[0]}"`).join(" and ")}`]
})

// AC-25 On a phone the frames stack at one scale with no page scroll, the panel is a drawer, and targets are 44 px
await check("AC-25", async () => {
  const results = []
  for (const width of [360, 390, 430]) {
    const p = await open("normal", { width, height: 800, touch: true, hash: "view=responsive&scenario=tasks.list&layout=phones" })
    await wait(2500)
    const r = await p.evaluate(() => {
      const rects = [...document.querySelectorAll("[data-frame]")].map((e) => e.getBoundingClientRect())
      const targets = [...document.querySelectorAll("[data-frame] figcaption button")].map((b) => b.getBoundingClientRect()).filter((b) => b.width > 0)
      return { stacked: rects.every((b, i) => i === 0 || b.top >= rects[i - 1].bottom), scroll: document.documentElement.scrollWidth - innerWidth, small: targets.filter((b) => b.height < 44 || b.width < 44).length }
    })
    await p.getByRole("button", { name: "Panel" }).click()
    await wait(600)
    const drawer = await p.getByRole("dialog").getByText(/Frames/).count()
    results.push({ width, ...r, drawer })
    await p.closeAll()
  }
  const ok = results.every((r) => r.stacked && r.scroll <= 1 && r.small === 0 && r.drawer > 0)
  return [ok ? "pass" : "fail", results.map((r) => `${r.width}: stacked ${r.stacked}, page scroll ${r.scroll}px, small targets ${r.small}, drawer ${r.drawer > 0}`).join("; ")]
})

// AC-26 Full page: frames follow content height, only the stage scrolls, a 100vh page stops at the screen with the reason, a switch does not reload
await check("AC-26", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=help.guide&layout=phones" })
  await allReady(p, 3)
  const f = () => p.locator("[data-frame] iframe.opacity-100").first()
  const doc = await (await f().elementHandle()).contentFrame()
  await doc.evaluate(() => (window.__kept = "same"))
  await p.getByRole("toolbar", { name: "Responsive controls" }).getByRole("button", { name: "Full page" }).click()
  await wait(1500)
  const got = await (await f().elementHandle()).contentFrame()
  const m = await got.evaluate(() => ({ inner: innerHeight, content: document.documentElement.scrollHeight, kept: window.__kept }))
  await got.evaluate(() => { const s = document.createElement("section"); s.style.height = "600px"; s.id = "added"; document.querySelector(".doc").append(s) })
  await wait(600)
  const grown = await got.evaluate(() => ({ inner: innerHeight, content: document.documentElement.scrollHeight }))
  const pageScroll = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  await p.closeAll()
  const w = await open("normal", { hash: "view=responsive&scenario=help.welcome&layout=phones&height=full" })
  await allReady(w, 3)
  await wait(2500)
  const notes = await w.locator("[data-frame] p").allInnerTexts()
  const heights = await w.locator("[data-frame] iframe.opacity-100").evaluateAll((els) => els.map((e) => e.style.height))
  await w.closeAll()
  const ok = Math.abs(m.inner - m.content) <= 1 && m.inner > 844 && m.kept === "same" && Math.abs(grown.inner - grown.content) <= 1 && grown.inner >= m.inner + 590 && pageScroll <= 1 && notes.length === 3 && notes.every((n) => /sizes itself to the window/.test(n)) && heights.join() === "780px,844px,932px"
  return [ok ? "pass" : "fail", `the guide's first frame became ${m.inner} px for ${m.content} px of content in the same document (${m.kept}); adding 600 px grew it to ${grown.inner} px; page scroll ${pageScroll}px; the 100vh welcome page stayed at ${heights.join(", ")} with the reason on ${notes.length} frames`]
})

// AC-27 Keys and commands: the Responsive shortcut, Reset all, [ and ], and the command menu work in the view
await check("AC-27", async () => {
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list" })
  await p.keyboard.press("6")
  await wait(800)
  const view = await p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("view"))
  await allReady(p, 3)
  await p.keyboard.press("]")
  await wait(800)
  const next = await p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("scenario"))
  await allReady(p, 3)
  const before = await p.locator("iframe").evaluateAll((els) => els.map((e) => e.name).join())
  await p.getByRole("button", { name: "Reset all" }).click()
  await allReady(p, 3)
  const after = await p.locator("iframe").evaluateAll((els) => els.map((e) => e.name).join())
  await p.keyboard.press("Meta+k")
  await wait(400)
  const cmd = await p.getByRole("dialog").count()
  await p.keyboard.press("Escape")
  const labels = await p.locator("[data-frame-label]").count()
  const menus = await p.getByRole("button", { name: /frame actions$/ }).count()
  await p.closeAll()
  const ok = view === "responsive" && next !== "tasks.list" && before !== after && cmd > 0 && labels === 3 && menus === 3
  return [ok ? "pass" : "fail", `6 opened ${view}; ] moved to ${next}; Reset all remounted every frame ${before !== after}; the command menu opened ${cmd > 0}; every frame has a focusable label and an actions menu (${labels}, ${menus})`]
})

// ---------- Responsive canvas (AC-28 to AC-35) ----------
const vpOf = (p) => p.locator(".react-flow__viewport").evaluate((e) => { const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(e.style.transform); return m ? { x: +m[1], y: +m[2], z: +m[3] } : null })
const hashFrames = (p) => p.evaluate(() => (new URLSearchParams(location.hash.slice(1)).get("frames") ?? "").split(",").filter(Boolean).map((t) => { const m = /^(\d+)x(\d+):[\w.-]+(?:@(-?\d+)\.(-?\d+))?$/.exec(t); return { w: +m[1], h: +m[2], x: m[3] === undefined ? null : +m[3], y: m[4] === undefined ? null : +m[4] } }))
async function canvasReady(p, n, timeout = 30000) {
  await p.waitForFunction((count) => document.querySelectorAll("[data-frame] iframe.opacity-100").length === count && document.querySelectorAll(".react-flow__node").length === count, n, { timeout })
  await wait(1200)
}
const toCanvas = async (p) => { await p.getByRole("toolbar", { name: "Responsive controls" }).getByRole("button", { name: "Canvas" }).click() }
// A point on the canvas clear of every frame, label, the minimap, the controls and the zoom chip.
const emptySpot = (p) =>
  p.evaluate(() => {
    const pane = document.querySelector(".react-flow__pane").getBoundingClientRect()
    const blocked = [...document.querySelectorAll(".react-flow__node, .react-flow__minimap, .react-flow__controls, .react-flow__node-toolbar, [aria-label='Canvas zoom'], [aria-label='Preview controls']")].map((e) => e.getBoundingClientRect())
    for (let y = pane.top + 40; y < pane.bottom - 40; y += 20)
      for (let x = pane.left + 60; x < pane.right - 60; x += 20)
        if (!blocked.some((b) => x > b.left - 12 && x < b.right + 12 && y > b.top - 12 && y < b.bottom + 12)) return { x, y }
    return { x: pane.left + 20, y: pane.top + 20 }
  })

// AC-28 The canvas is its own chunk, loaded only when a canvas layout opens; the initial Studio bundle carries none of it
await check("AC-28", async () => {
  const dir = join(root, ".acceptance", "normal", "assets")
  const files = readdirSync(dir)
  const main = files.find((f) => /^studio-.*\.js$/.test(f))
  const canvas = files.find((f) => /^canvas-.*\.js$/.test(f))
  const mainText = readFileSync(join(dir, main), "utf8")
  const gz = (f) => gzipSync(readFileSync(join(dir, f))).length
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list" })
  const requested = []
  p.on("request", (r) => requested.push(r.url()))
  await p.getByRole("button", { name: "Responsive" }).first().click()
  await wait(1500)
  const before = requested.some((u) => /canvas-/.test(u))
  await toCanvas(p)
  await wait(1500)
  const after = requested.some((u) => /canvas-/.test(u))
  await p.closeAll()
  const ok = !!canvas && !/react-flow__pane/.test(mainText) && !before && after
  return [ok ? "pass" : "fail", `initial Studio chunk ${main} ${(gz(main) / 1024).toFixed(1)} KB gzipped with no canvas code; canvas chunk ${canvas} ${(gz(canvas) / 1024).toFixed(1)} KB gzipped, requested before opening a canvas ${before}, after ${after}`]
})

// AC-29 Row to canvas keeps every frame where it was within 1 px; canvas to row keeps the order
await check("AC-29", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phone-tablet-laptop" })
  await allReady(p, 3)
  const rects = () => p.locator("[data-frame] .preview-frame").evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width] }))
  const row = await rects()
  await toCanvas(p)
  await canvasReady(p, 3)
  const canvas = await rects()
  const drift = Math.max(...row.flatMap((r, i) => r.map((v, j) => Math.abs(v - canvas[i][j]))))
  await p.getByRole("toolbar", { name: "Responsive controls" }).getByRole("button", { name: "Row" }).click()
  await wait(1500)
  const order = await p.locator("[data-frame] figcaption").evaluateAll((els) => els.map((e) => e.textContent.match(/\d+ × \d+/)[0]))
  await p.closeAll()
  const ok = drift <= 1 && order.join() === "390 × 844,834 × 1112,1280 × 800"
  return [ok ? "pass" : "fail", `largest change in a frame's on-screen left, top or width on switching ${drift.toFixed(2)} px; back to Row the order is ${order.join(", ")}`]
})

// AC-30 Pan and zoom: empty canvas drag, Space plus drag, trackpad scroll, modifier plus wheel, keys, limits; over a live frame the wheel scrolls the product and a click reaches it
await check("AC-30", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=help.guide&layout=phones&frames=390x844:phone@0.0,834x1112:tablet@480.0&arrange=canvas&vp=40_60_0.5" })
  await canvasReady(p, 2)
  const at = await emptySpot(p)
  const v0 = await vpOf(p)
  await p.mouse.move(at.x, at.y)
  await p.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await p.mouse.move(at.x + i * 20, at.y - i * 10)
    await wait(30)
  }
  await p.mouse.up()
  await wait(300)
  const v1 = await vpOf(p)
  const frameBox = await p.locator(".react-flow__node").first().boundingBox()
  const doc = await (await p.locator("[data-frame] iframe.opacity-100").first().elementHandle()).contentFrame()
  await p.keyboard.down("Space")
  await wait(100)
  await p.mouse.move(frameBox.x + frameBox.width / 2, frameBox.y + frameBox.height / 2)
  await p.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await p.mouse.move(frameBox.x + frameBox.width / 2 + i * 10, frameBox.y + frameBox.height / 2 + i * 5)
    await wait(30)
  }
  await p.mouse.up()
  await p.keyboard.up("Space")
  await wait(300)
  const v2 = await vpOf(p)
  const at2 = await emptySpot(p)
  await p.mouse.move(at2.x, at2.y)
  await p.mouse.wheel(0, 120)
  await wait(300)
  const v3 = await vpOf(p)
  const fb = await p.locator(".react-flow__node").first().boundingBox()
  const scrollBefore = await doc.evaluate(() => scrollY)
  await p.mouse.move(fb.x + fb.width / 2, fb.y + Math.min(fb.height / 2, 200))
  await p.mouse.wheel(0, 300)
  await wait(500)
  const scrollAfter = await doc.evaluate(() => scrollY)
  const v5 = await vpOf(p)
  const at3 = await emptySpot(p)
  const under = await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${String(e?.className?.baseVal ?? e?.className).split(" ")[0]}` }, at3)
  await p.mouse.move(at3.x, at3.y)
  await p.keyboard.down("Control")
  await p.mouse.wheel(0, -200)
  await p.keyboard.up("Control")
  await wait(300)
  const v4 = await vpOf(p)
  await p.locator("[data-frame-label]").first().focus()
  for (let i = 0; i < 30; i++) await p.keyboard.press("-")
  await wait(400)
  const min = (await vpOf(p)).z
  for (let i = 0; i < 40; i++) await p.keyboard.press("=")
  await wait(400)
  const max = (await vpOf(p)).z
  await p.closeAll()
  const q = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones&frames=390x844:phone@0.0&arrange=canvas&vp=40_60_0.6" })
  await canvasReady(q, 1)
  const inner = await (await q.locator("[data-frame] iframe.opacity-100").first().elementHandle()).contentFrame()
  // Boxes of elements inside a frame come back in page coordinates, zoom included.
  const btn = await inner.getByRole("button", { name: "New task" }).boundingBox()
  await q.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2)
  await wait(600)
  const dialog = await inner.getByRole("dialog").count()
  await q.closeAll()
  const ok = Math.round(v1.x - v0.x) === 100 && Math.round(v1.y - v0.y) === -50 && Math.round(v2.x - v1.x) === 60 && Math.round(v3.y - v2.y) < 0 && v3.z === v2.z && v4.z > v3.z && scrollAfter > scrollBefore && v5.x === v3.x && v5.y === v3.y && v5.z === v3.z && Math.abs(min - 0.1) < 0.001 && Math.abs(max - 4) < 0.001 && dialog === 1
  return [ok ? "pass" : "fail", `drag on empty canvas panned ${Math.round(v1.x - v0.x)}, ${Math.round(v1.y - v0.y)}; Space plus drag over a frame panned ${Math.round(v2.x - v1.x)}, ${Math.round(v2.y - v1.y)}; scroll over empty canvas panned ${Math.round(v3.y - v2.y)} at zoom ${v3.z}; Control plus wheel over ${under} zoomed ${v3.z} to ${v4.z.toFixed(2)}; the wheel over a frame scrolled the product ${scrollBefore} to ${scrollAfter} and left the canvas still (${v5.x === v3.x && v5.y === v3.y && v5.z === v3.z}); keys reached ${min} and ${max}; a click inside a frame opened the product's dialog (${dialog})`]
})

// AC-31 Frames move by their label, snap to 8 px, move by keys (8 and 64 px), even across another frame's product; Tidy returns a row grouped by kind
await check("AC-31", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones&frames=1280x800:desktop@0.0,390x844:phone@1400.0,834x1112:tablet@1900.0&arrange=canvas&vp=20_80_0.4" })
  await canvasReady(p, 3)
  const f0 = await hashFrames(p)
  const label = p.locator("[data-frame-label]").nth(1)
  const lb = await label.boundingBox()
  const over = await p.locator(".react-flow__node").nth(0).boundingBox()
  await p.mouse.move(lb.x + 30, lb.y + lb.height / 2)
  await p.mouse.down()
  await p.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 8 })
  await p.mouse.move(lb.x + 30 + 97, lb.y + lb.height / 2 + 41, { steps: 8 })
  await p.mouse.up()
  await wait(500)
  const f1 = await hashFrames(p)
  await label.focus()
  await p.keyboard.press("ArrowRight")
  await p.keyboard.press("Shift+ArrowDown")
  await wait(400)
  const f2 = await hashFrames(p)
  const said = await p.locator("p[aria-live=polite]").allInnerTexts()
  await p.getByRole("button", { name: "Tidy" }).click()
  await wait(800)
  const f3 = await hashFrames(p)
  await p.closeAll()
  const want = (d) => Math.round(d / 0.4 / 8) * 8
  const moved = f1[1].x - f0[1].x === want(97) && f1[1].y - f0[1].y === want(41) && f1[1].x % 8 === 0 && f1[1].y % 8 === 0
  const keyed = f2[1].x - f1[1].x === 8 && f2[1].y - f1[1].y === 64
  const tidy = f3.map((f) => `${f.w}`).join() === "390,834,1280" && f3.every((f) => f.y === 0) && f3[1].x > f3[0].x && f3[2].x > f3[1].x
  const ok = moved && keyed && tidy && said.some((t) => /Moved 390 by 844 to/.test(t))
  return [ok ? "pass" : "fail", `a label drag of 97, 41 screen px at 40% moved the phone ${f1[1].x - f0[1].x}, ${f1[1].y - f0[1].y} (snapped, passing over the desktop frame's product); Right and Shift+Down moved it ${f2[1].x - f1[1].x}, ${f2[1].y - f1[1].y}; announced "${said.filter(Boolean).pop()}"; Tidy gave ${f3.map((f) => `${f.w}@${f.x},${f.y}`).join(" ")}`]
})

// AC-32 Resizing on the canvas follows the pointer divided by the zoom, without reloading the frame
await check("AC-32", async () => {
  const results = []
  for (const z of [0.5, 1.5]) {
    const p = await open("normal", { hash: `view=responsive&scenario=tasks.list&layout=phones&frames=390x844:phone@0.0&arrange=canvas&vp=40_100_${z}` })
    await canvasReady(p, 1)
    const doc = await (await p.locator("[data-frame] iframe.opacity-100").first().elementHandle()).contentFrame()
    await doc.evaluate(() => (window.__kept = "same"))
    const handle = p.getByRole("slider", { name: /frame width$/ })
    const hb = await handle.boundingBox()
    await p.mouse.move(hb.x + hb.width / 2, hb.y + Math.min(hb.height / 2, 200))
    await p.mouse.down()
    await p.mouse.move(hb.x + hb.width / 2 + 60, hb.y + Math.min(hb.height / 2, 200), { steps: 8 })
    await p.mouse.up()
    await wait(600)
    const [f] = await hashFrames(p)
    const kept = await doc.evaluate(() => window.__kept).catch(() => "reloaded")
    results.push({ z, got: f.w - 390, want: 60 / z, kept })
    await p.closeAll()
  }
  const ok = results.every((r) => Math.abs(r.got - r.want) <= 1 && r.kept === "same")
  return [ok ? "pass" : "fail", results.map((r) => `at ${r.z * 100}% a 60 px drag widened the frame ${r.got} px (expected ${r.want.toFixed(1)}), document ${r.kept}`).join("; ")]
})

// AC-33 Save keeps positions and the viewport; a reload and a fresh browser with the link both restore them
await check("AC-33", async () => {
  const file = join(root, "layouts.json")
  const backup = existsSync(file) ? `${file}.acceptance-backup` : null
  if (backup) copyFileSync(file, backup)
  const port = 5392
  const dev = spawn("npx", ["vite", "--port", String(port), "--strictPort", "--logLevel", "error"], { cwd: root, stdio: "ignore", env: { ...process.env, VITE_STUDIO_ADAPTER: "example" } })
  try {
    const url = `http://localhost:${port}/`
    for (let i = 0; i < 60 && !(await fetch(url).then((r) => r.ok).catch(() => false)); i++) await wait(500)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await context.newPage()
    await p.goto(`${url}#view=responsive&scenario=tasks.list&layout=phones&frames=390x844:phone@0.0,834x1112:tablet@520.160&arrange=canvas&vp=60_90_0.45`)
    await p.waitForSelector("header")
    await canvasReady(p, 2)
    await p.getByRole("button", { name: /Save as/ }).first().click()
    await p.getByLabel("Save as a new layout").fill("Canvas board")
    await p.getByRole("button", { name: "Save", exact: true }).last().click()
    await wait(800)
    const saved = JSON.parse(readFileSync(file, "utf8")).layouts.find((l) => l.name === "Canvas board")
    const positions = () => p.locator(".react-flow__node").evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)] }))
    const before = await positions()
    await p.goto(`${url}#view=responsive&scenario=tasks.list&layout=phones`)
    await p.reload()
    await p.waitForSelector("header")
    await wait(2000)
    await p.getByRole("button", { name: "Canvas board" }).first().click()
    await canvasReady(p, 2)
    const restored = await positions()
    const link = await p.evaluate(() => location.hash)
    await context.close()
    const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const q = await fresh.newPage()
    await q.goto(`${url}${link}`)
    await q.waitForSelector("header")
    await canvasReady(q, 2)
    const linked = await q.locator(".react-flow__node").evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)] }))
    await fresh.close()
    const same = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x[0] - b[i][0]) <= 1 && Math.abs(x[1] - b[i][1]) <= 1)
    const ok = saved?.arrangement === "canvas" && saved.frames[1].x === 520 && saved.frames[1].y === 160 && saved.viewport?.zoom === 0.45 && same(before, restored) && same(before, linked)
    return [ok ? "pass" : "fail", `layouts.json kept ${saved?.arrangement} with the tablet at ${saved?.frames[1].x}, ${saved?.frames[1].y} and zoom ${saved?.viewport?.zoom}; frames on screen ${JSON.stringify(before)}, after reopening ${JSON.stringify(restored)}, from the link in a fresh browser ${JSON.stringify(linked)}`]
  } finally {
    dev.kill()
    if (backup) copyFileSync(backup, file), rmSync(backup)
    else rmSync(file, { force: true })
  }
})

// AC-34 The zoom is stated in the dock's zoom control at every zoom, Fit and 100% are one action each in its menu, and labels stay legible at every zoom
await check("AC-34", async () => {
  const out = []
  for (const z of [0.1, 1, 2]) {
    const p = await open("normal", { hash: `view=responsive&scenario=tasks.list&layout=phones&frames=390x844:phone@0.0&arrange=canvas&vp=40_120_${z}` })
    await canvasReady(p, 1)
    const text = await chip(p)
    const font = await p.locator("[data-frame-label]").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize) * (e.getBoundingClientRect().height / e.offsetHeight))
    await p.locator('[aria-label^="Zoom, "]').first().click()
    await wait(300)
    out.push({ z, text, font, fit: await p.getByRole("menuitemradio", { name: /^Fit/ }).count(), hundred: await p.getByRole("menuitemradio", { name: /^100%/ }).count() })
    await p.closeAll()
  }
  const ok = out[0].text === "Zoom, 10%" && out[1].text === "Zoom, 100%" && out[2].text === "Zoom, 200%" && out.every((o) => o.font >= 11 && o.fit === 1 && o.hundred === 1)
  return [ok ? "pass" : "fail", out.map((o) => `${o.z * 100}%: "${o.text}", label text ${o.font.toFixed(1)} px`).join("; ") + "; Fit and 100% one action each in the zoom menu"]
})

// AC-35 Every frame is focusable and named; Tab moves between frames; selection and moves are announced; on a phone a canvas layout stacks with a note
await check("AC-35", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones&frames=390x844:phone@0.0,834x1112:tablet@480.0,1280x800:desktop@1400.0&arrange=canvas&vp=20_80_0.4" })
  await canvasReady(p, 3)
  const names = await p.locator("[data-frame-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))
  await p.locator("[data-frame-label]").first().focus()
  let reached = null
  for (let i = 0; i < 6 && !reached; i++) {
    await p.keyboard.press("Tab")
    reached = await p.evaluate(() => (document.activeElement?.hasAttribute("data-frame-label") ? document.activeElement.getAttribute("aria-label") : null))
  }
  await p.locator("[data-frame-label]").nth(2).click()
  await wait(300)
  const selected = await p.locator("p[aria-live=polite]").allInnerTexts()
  await p.closeAll()
  const q = await open("normal", { width: 390, height: 800, touch: true, hash: "view=responsive&scenario=tasks.list&layout=phones&frames=390x844:phone@0.0,834x1112:tablet@480.0&arrange=canvas" })
  await wait(2000)
  const note = await q.getByText(/The canvas opens on wider screens/).count()
  const stacked = await q.evaluate(() => { const r = [...document.querySelectorAll("[data-frame]")].map((e) => e.getBoundingClientRect()); return r.length === 2 && r[1].top >= r[0].bottom })
  const scroll = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  await q.closeAll()
  const ok = names.length === 3 && names.every((n) => /^\d+ by \d+, counts as .*frame \d of 3/.test(n)) && reached === names[1] && selected.some((t) => /Selected 1280 by 800/.test(t)) && note === 1 && stacked && scroll <= 1
  return [ok ? "pass" : "fail", `labels named "${names[0]}" and so on; Tab from the first reached "${reached?.slice(0, 40)}"; clicking a label announced "${selected.filter(Boolean).pop()}"; at 390 px the canvas layout stacked ${stacked} with the note (${note}) and no page scroll (${scroll}px)`]
})

// ---------- Responsive sync (AC-36 to AC-42) ----------
const liveDocs = async (p) => Promise.all((await p.locator("[data-frame] iframe.opacity-100").all()).map(async (e) => (await e.elementHandle()).contentFrame()))
// The anchored element at the top of a frame's view and how far through it the top edge is.
const topAnchor = (f) => f.evaluate(() => { const a = [...document.querySelectorAll("[data-studio-anchor]")].map((e) => ({ id: e.dataset.studioAnchor, r: e.getBoundingClientRect() })).filter((x) => x.r.height > 0); const at = a.filter((x) => x.r.top <= 1 && x.r.bottom > 0).pop(); return at ? { id: at.id, offset: -at.r.top / at.r.height } : null })
const offsetOf = (f, id) => f.evaluate((anchor) => { const r = document.querySelector(`[data-studio-anchor="${anchor}"]`).getBoundingClientRect(); return -r.top / r.height }, id)
async function wheelIn(p, index, dy, times = 4) {
  const box = await p.locator("[data-frame] iframe.opacity-100").nth(index).boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300))
  for (let i = 0; i < times; i++) {
    await p.mouse.wheel(0, dy)
    await wait(60)
  }
}
// The example's test hooks: a frame that stands in for an older client, or a product without navigate.
const frameFlag = (p, flag, minWidth, maxWidth) => p.addInitScript(({ flag, minWidth, maxWidth }) => { if (window !== window.top && innerWidth >= minWidth && innerWidth <= maxWidth) window[flag] = true }, { flag, minWidth, maxWidth })

// AC-36 Scroll: the same anchored element comes to the same place within 100 ms; a region follows proportionally within 2%; alternating leaders for thirty seconds never loop or drift
await check("AC-36", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=help.guide&layout=phone-tablet-laptop" })
  await allReady(p, 3)
  const docs = await liveDocs(p)
  await wheelIn(p, 0, 160)
  const t0 = Date.now()
  let lead = null
  let aligned = null
  for (let i = 0; i < 40 && aligned === null; i++) {
    lead = await topAnchor(docs[0])
    if (lead) {
      const offs = await Promise.all(docs.slice(1).map((f) => offsetOf(f, lead.id)))
      if (offs.every((o) => Math.abs(o - lead.offset) < 0.02)) aligned = Date.now() - t0
    }
    if (aligned === null) await wait(10)
  }
  // A region scrolls proportionally.
  const notes = await docs[1].locator("[data-studio-scroll=guide-notes]").boundingBox()
  await p.mouse.move(notes.x + notes.width / 2, notes.y + notes.height / 2)
  for (let i = 0; i < 2; i++) {
    await p.mouse.wheel(0, 40)
    await wait(60)
  }
  await wait(500)
  const ratios = await Promise.all(docs.map((f) => f.evaluate(() => { const e = document.querySelector("[data-studio-scroll=guide-notes]"); return e.scrollTop / (e.scrollHeight - e.clientHeight) })))
  // Thirty seconds, leaders alternating.
  const start = Date.now()
  let round = 0
  while (Date.now() - start < 30000) {
    await wheelIn(p, round % 2, round % 4 < 2 ? 120 : -90, 3)
    await wait(1400)
    round++
  }
  const last = (round - 1) % 2
  const a = await Promise.all(docs.map((f) => f.evaluate(() => scrollY)))
  await wait(1200)
  const b = await Promise.all(docs.map((f) => f.evaluate(() => scrollY)))
  const leadEnd = await topAnchor(docs[last])
  const endOffs = leadEnd ? await Promise.all(docs.map((f) => offsetOf(f, leadEnd.id))) : []
  await p.closeAll()
  const ok = aligned !== null && aligned <= 100 && Math.max(...ratios) - Math.min(...ratios) <= 0.02 && a.join() === b.join() && endOffs.every((o) => Math.abs(o - leadEnd.offset) < 0.02)
  return [ok ? "pass" : "fail", `the leader's top anchor "${lead?.id}" was at the same place in every frame ${aligned ?? "never"} ms after the scroll ended; the notes region stood at ${ratios.map((r) => r.toFixed(3)).join(", ")}; after ${round} alternating rounds over 30 s the frames were still (${a.join() === b.join()}) and aligned on "${leadEnd?.id}" (${endOffs.map((o) => o.toFixed(3)).join(", ")})`]
})

// AC-37 Clicks and typing: the same product state in every frame, composed (IME) text included
await check("AC-37", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phone-tablet-laptop" })
  await allReady(p, 3)
  const docs = await liveDocs(p)
  await docs[0].getByRole("button", { name: "New task" }).click()
  await wait(600)
  const dialogs = await Promise.all(docs.map((f) => f.getByRole("dialog").count()))
  const title = docs[0].locator("#title")
  await title.click()
  await title.pressSequentially("Plan ", { delay: 25 })
  const cdp = await p.context().newCDPSession(p)
  await cdp.send("Input.imeSetComposition", { text: "にほん", selectionStart: 3, selectionEnd: 3 })
  await wait(150)
  const mid = await Promise.all(docs.slice(1).map((f) => f.evaluate(() => document.querySelector("#title").value)))
  await cdp.send("Input.insertText", { text: "日本" })
  await wait(600)
  const values = await Promise.all(docs.map((f) => f.evaluate(() => document.querySelector("#title").value)))
  await docs[0].getByRole("button", { name: "Save" }).click()
  await wait(800)
  const firstRows = await Promise.all(docs.map((f) => f.evaluate(() => document.querySelector(".row .title")?.textContent)))
  await p.closeAll()
  const ok = dialogs.every((d) => d === 1) && values.every((v) => v === "Plan 日本") && mid.every((v) => v === "Plan ") && firstRows.every((t) => t === "Plan 日本")
  return [ok ? "pass" : "fail", `New task opened the dialog in ${dialogs.filter((d) => d === 1).length} of 3 frames; followers held "${mid[0]}" during composition and every frame ended with "${values.join('", "')}"; Save put "${firstRows[0]}" first in every list (${firstRows.join(" | ")})`]
})

// AC-38 Password, file and private fields never leave the frame: no message carries them
await check("AC-38", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=help.guide&layout=phones" })
  await p.evaluate(() => { window.__relayed = []; window.addEventListener("message", (e) => { if (e.data?.type === "interaction") window.__relayed.push(JSON.stringify(e.data)) }) })
  await allReady(p, 3)
  const docs = await liveDocs(p)
  for (const id of ["#guide-secret", "#guide-private"]) {
    const el = docs[0].locator(id)
    await el.scrollIntoViewIfNeeded()
    await el.click()
    await el.pressSequentially(id === "#guide-secret" ? "hunter2" : "my diary", { delay: 20 })
  }
  await docs[0].locator("#guide-file").setInputFiles({ name: "secret.png", mimeType: "image/png", buffer: Buffer.from("png") })
  await docs[0].locator("#guide-name").click()
  await docs[0].locator("#guide-name").pressSequentially("Grace", { delay: 20 })
  await wait(700)
  const relayed = await p.evaluate(() => window.__relayed)
  const followers = await Promise.all(docs.slice(1).map((f) => f.evaluate(() => [document.querySelector("#guide-secret").value, document.querySelector("#guide-private").value, document.querySelector("#guide-file").files.length, document.querySelector("#guide-name").value])))
  await p.closeAll()
  const leaked = relayed.filter((m) => /hunter2|my diary|secret\.png|guide-secret|guide-private|guide-file/.test(m))
  const ok = relayed.length > 0 && leaked.length === 0 && followers.every((f) => f[0] === "" && f[1] === "" && f[2] === 0 && f[3] === "Grace")
  return [ok ? "pass" : "fail", `${relayed.length} interaction messages reached the Studio, ${leaked.length} naming or carrying the password, private or file field; followers' password, private and file fields stayed empty while the name followed ("${followers[0]?.[3]}")`]
})

// AC-39 A follower that cannot find the target shows Out of sync naming it, is not clicked, and Reset all clears it
await check("AC-39", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phone-tablet-laptop" })
  await allReady(p, 3)
  const docs = await liveDocs(p)
  await docs[1].evaluate(() => document.querySelector('[data-studio-anchor="new-task"]').remove())
  await docs[0].getByRole("button", { name: "New task" }).click()
  await wait(800)
  const labels = await p.locator("[data-frame] figcaption").allInnerTexts()
  const dialogs = await Promise.all(docs.map((f) => f.getByRole("dialog").count()))
  const reason = (await p.locator("[data-frame] figcaption").nth(1).getByRole("status").getAttribute("aria-label").catch(() => "")) ?? ""
  await p.getByRole("button", { name: "Reset all" }).click()
  await allReady(p, 3)
  const after = await p.locator("[data-frame] figcaption").allInnerTexts()
  await p.closeAll()
  const ok = /Out of sync/.test(labels[1]) && !/Out of sync/.test(labels[2]) && dialogs[0] === 1 && dialogs[1] === 0 && dialogs[2] === 1 && /New task|new-task/.test(reason) && !after.some((t) => /Out of sync/.test(t))
  return [ok ? "pass" : "fail", `with New task removed from the tablet frame, it showed Out of sync (${/Out of sync/.test(labels[1])}) saying "${reason.split(".")[0]}", got no dialog (${dialogs[1]}), while the others opened theirs (${dialogs[0]}, ${dialogs[2]}); Reset all cleared it (${!after.some((t) => /Out of sync/.test(t))})`]
})

// AC-40 Navigation follows through the frame client's navigate handler; without one the switch says why
await check("AC-40", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phone-tablet-laptop&sync=scroll-navigation" })
  await allReady(p, 3)
  const docs = await liveDocs(p)
  await docs[2].locator(".nav a", { hasText: "Settings" }).click()
  await wait(800)
  const where = await Promise.all(docs.map((f) => f.evaluate(() => document.querySelector("h1")?.textContent)))
  await p.closeAll()
  const q = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await q.newPage()
  await frameFlag(page, "__studioNoNavigate", 0, 5000)
  await page.goto(servers.normal.url + "#view=responsive&scenario=tasks.list&layout=phones")
  await page.waitForSelector("header")
  await allReady(page, 3)
  const note = await page.getByText(/Unavailable here: this product's preview cannot navigate on request/).count()
  await q.close()
  const ok = where.every((h) => h === "Settings") && note === 1
  return [ok ? "pass" : "fail", `with clicks and typing off and navigation on, Settings in the laptop frame took every frame there (${where.join(", ")}); without a navigate handler the switch says it is unavailable and why (${note})`]
})

// AC-41 A frame whose client predates sync is labeled Not synced with the reason; the others keep syncing
await check("AC-41", async () => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await c.newPage()
  await frameFlag(p, "__studioLegacy", 360, 360)
  await p.goto(servers.normal.url + "#view=responsive&scenario=help.guide&layout=phones")
  await p.waitForSelector("header")
  await allReady(p, 3)
  const labels = await p.locator("[data-frame] figcaption").allInnerTexts()
  const docs = await liveDocs(p)
  await wheelIn(p, 1, 160)
  await wait(700)
  const ys = await Promise.all(docs.map((f) => f.evaluate(() => Math.round(scrollY))))
  const reason = (await p.locator("[data-frame] figcaption").nth(0).getByRole("status").getAttribute("aria-label").catch(() => "")) ?? ""
  await c.close()
  const ok = /Not synced/.test(labels[0]) && !/Not synced/.test(labels[1]) && ys[0] === 0 && ys[1] > 0 && ys[2] > 0 && /Not synced: this preview's scroll and interaction are not followed/.test(reason)
  return [ok ? "pass" : "fail", `the older frame read "${labels[0].replace(/\s+/g, " ")}" ("${reason.split(",")[0]}") and stayed at ${ys[0]} while the other two followed a scroll to ${ys[1]} and ${ys[2]}`]
})

// AC-42 New layouts start with every channel on; a switch turned off stops its channel at once; only a frame's parent can make it replay
await check("AC-42", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=help.guide&layout=phones" })
  await allReady(p, 3)
  const on = await Promise.all(["Scroll", "Clicks and typing", "Navigation"].map((n) => p.getByRole("switch", { name: n }).getAttribute("aria-checked")))
  await p.getByRole("switch", { name: "Scroll" }).click()
  await wait(200)
  const docs = await liveDocs(p)
  await wheelIn(p, 0, 160)
  await wait(700)
  const ys = await Promise.all(docs.map((f) => f.evaluate(() => Math.round(scrollY))))
  // Another window posts a well-formed replay straight at a frame: the frame answers only its parent.
  const acted = await p.evaluate(async () => {
    const target = document.querySelector("[data-frame] iframe.opacity-100")
    const intruder = document.createElement("iframe")
    document.body.append(intruder)
    await new Promise((r) => setTimeout(r, 100))
    intruder.contentWindow.eval(`parent.document.querySelector("[data-frame] iframe.opacity-100").contentWindow.postMessage({ protocol: "studio-preview/1", instance: "${target.name}", type: "replay", requestId: "x", event: { kind: "click", target: { anchor: "guide-send" } } }, "*")`)
    await new Promise((r) => setTimeout(r, 500))
    return !target.contentDocument.querySelector("#guide-sent").hidden
  })
  await p.closeAll()
  const ok = on.every((v) => v === "true") && ys[0] > 0 && ys[1] === 0 && ys[2] === 0 && acted === false
  return [ok ? "pass" : "fail", `a new layout starts with Scroll, Clicks and typing and Navigation on (${on.join(", ")}); with Scroll off the leader went to ${ys[0]} and the others stayed at ${ys[1]} and ${ys[2]}; a replay posted from another window was ignored (${!acted})`]
})

// Stage navigation helpers: the native stage scroller that holds the frame, and a point over the frame's product.
const stageScroll = (p) => p.evaluate(() => { const b = document.querySelector(".preview-frame")?.closest(".overflow-auto"); return b ? { x: Math.round(b.scrollLeft), y: Math.round(b.scrollTop) } : null })
const zoomPct = async (p) => Number(/(\d+)%/.exec((await chip(p)) ?? "")?.[1])
const overFrame = async (p, sel = ".preview-frame iframe.opacity-100") => {
  const r = await p.evaluate((q) => {
    const st = (document.querySelector(".react-flow") ?? document.querySelector(".preview-frame")?.closest(".overflow-auto")).getBoundingClientRect()
    const seen = (b) => Math.max(0, Math.min(b.right, st.right) - Math.max(b.left, st.left)) * Math.max(0, Math.min(b.bottom, st.bottom) - Math.max(b.top, st.top))
    const f = [...document.querySelectorAll(q)].map((e) => e.getBoundingClientRect()).sort((a, b) => seen(b) - seen(a))[0]
    const x = Math.max(f.left, st.left) + Math.min(f.right, st.right)
    const y = Math.max(f.top, st.top) + Math.min(f.bottom, st.bottom)
    return { x: x / 2, y: y / 2 }
  }, sel)
  await p.mouse.move(r.x, r.y)
  return r
}

// AC-49 One navigation on a scrolling stage: a scroll over a frame the page cannot use pans the stage; ⌘ or Ctrl with the
// wheel zooms at the pointer over the frame; Space and a drag, or a middle drag, pans; + and − step; the zoom menu names the gestures
await check("AC-49", async () => {
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list&profile=desktop" })
  await p.keyboard.press("Shift+Digit0")
  await wait(800)
  await p.evaluate(() => document.querySelector(".preview-frame").closest(".overflow-auto").scrollTo({ top: 0 }))
  await wait(200)
  const start = await stageScroll(p)
  const at = await overFrame(p)
  const pageY0 = await p.frames().find((f) => f !== p.mainFrame()).evaluate(() => scrollY)
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 200); await wait(60) }
  await wait(400)
  const pageY1 = await p.frames().find((f) => f !== p.mainFrame()).evaluate(() => Math.round(scrollY))
  const afterWheel = await stageScroll(p)
  // The point under the pointer, as a fraction of the frame, before and after a zoom there.
  const frac = () => p.evaluate(({ x, y }) => { const b = document.querySelector(".preview-frame").getBoundingClientRect(); return { fx: (x - b.left) / b.width, fy: (y - b.top) / b.height } }, at)
  const f0 = await frac()
  const z0 = await zoomPct(p)
  // Zoom in, so the stage overflows on both axes and the point can stay put on both.
  await p.keyboard.down("Control")
  await p.mouse.wheel(0, -100)
  await p.keyboard.up("Control")
  await wait(700)
  const z1 = await zoomPct(p)
  const f1 = await frac()
  const drift = Math.max(Math.abs(f1.fx - f0.fx), Math.abs(f1.fy - f0.fy))
  await p.keyboard.press("Shift+Digit0")
  await wait(700)
  await p.evaluate(() => document.activeElement?.blur())
  const s0 = await stageScroll(p)
  await overFrame(p)
  const m = await overFrame(p)
  await p.keyboard.down("Space")
  await wait(150)
  await p.mouse.down()
  await p.mouse.move(m.x + 90, m.y + 60, { steps: 6 })
  await p.mouse.up()
  await p.keyboard.up("Space")
  await wait(300)
  const s1 = await stageScroll(p)
  const shieldGone = (await p.locator("[data-stage-shield]").count()) === 0
  const box = await p.evaluate(() => { const b = document.querySelector(".preview-frame").closest(".overflow-auto").getBoundingClientRect(); return { x: b.left + 6, y: b.top + 6 } })
  await p.mouse.move(box.x, box.y)
  await p.mouse.down({ button: "middle" })
  await p.mouse.move(box.x + 40, box.y + 30, { steps: 4 })
  await p.mouse.up({ button: "middle" })
  await wait(200)
  const s2 = await stageScroll(p)
  await p.keyboard.press("Equal")
  await wait(500)
  const up = await zoomPct(p)
  await p.keyboard.press("Minus")
  await p.keyboard.press("Minus")
  await wait(500)
  const down = await zoomPct(p)
  await p.locator('[aria-label^="Zoom, "]').first().click()
  await wait(300)
  const hint = await p.locator("[data-navigation-hint]").innerText()
  await p.closeAll()
  const ok = afterWheel.y > start.y && z1 > z0 && drift < 0.01 && s1.x < s0.x - 60 && s1.y < s0.y - 40 && shieldGone && s2.x < s1.x && up === 125 && down === 75 && /Scroll to pan/.test(hint) && /pinch to zoom/.test(hint) && /Space/.test(hint)
  return [ok ? "pass" : "fail", `scroll over the frame (page at ${pageY0} to ${pageY1}) moved the stage ${start.y} to ${afterWheel.y}; Ctrl and the wheel over the frame zoomed ${z0}% to ${z1}% with the point under the pointer drifting ${(drift * 100).toFixed(1)}% of the frame; Space and a drag over the frame panned ${s0.x},${s0.y} to ${s1.x},${s1.y} (shield gone after: ${shieldGone}); a middle drag panned to ${s2.x},${s2.y}; + gave ${up}%, − twice gave ${down}%; hint "${hint}"`]
})

// AC-50 Responsive: no separate scale chips or canvas buttons; the row pans under a frame; on the canvas a scroll over a
// frame pans the viewport, Ctrl and the wheel zooms, the dock states the zoom, the map is off until asked for, and Tidy is in the toolbar
await check("AC-50", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phone-tablet-laptop" })
  await allReady(p, 3)
  await p.keyboard.press("Shift+Digit0")
  await wait(800)
  const chips = await p.locator('[aria-label="Scale"], [aria-label="Canvas zoom"]').count()
  const row0 = await p.evaluate(() => { const b = document.querySelector("[data-frame]").closest(".overflow-auto"); return b.scrollLeft })
  await overFrame(p, "[data-frame] iframe.opacity-100")
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(250, 0); await wait(60) }
  await wait(400)
  const row1 = await p.evaluate(() => { const b = document.querySelector("[data-frame]").closest(".overflow-auto"); return b.scrollLeft })
  const tidyRow = await p.getByRole("button", { name: "Tidy" }).count()
  await toCanvas(p)
  await canvasReady(p, 3)
  const controls = await p.locator(".react-flow__controls").count()
  const map0 = await p.locator(".react-flow__minimap").count()
  const tidy = await p.getByRole("toolbar", { name: "Responsive controls" }).getByRole("button", { name: "Tidy" }).count()
  const v0 = await vpOf(p)
  await p.keyboard.press("Shift+Digit0")
  await wait(500)
  const v1 = await vpOf(p)
  await overFrame(p, ".react-flow__node iframe.opacity-100")
  for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 200); await wait(60) }
  await wait(400)
  const v2 = await vpOf(p)
  await p.keyboard.down("Control")
  await p.mouse.wheel(0, 100)
  await p.keyboard.up("Control")
  await wait(500)
  const v3 = await vpOf(p)
  const stated = await chip(p)
  await p.locator('[aria-label^="Zoom, "]').first().click()
  await p.getByRole("menuitemcheckbox", { name: "Show map" }).click()
  await p.keyboard.press("Escape")
  await wait(300)
  const map1 = await p.locator(".react-flow__minimap").count()
  await p.closeAll()
  const ok = chips === 0 && row1 > row0 && tidyRow === 0 && controls === 0 && map0 === 0 && tidy === 1 && Math.abs(v1.z - 1) < 0.01 && v2.y < v1.y && v3.z < v2.z && stated === `Zoom, ${Math.round(v3.z * 100)}%` && map1 === 1
  return [ok ? "pass" : "fail", `scale chips ${chips}; a sideways scroll over a frame moved the row ${Math.round(row0)} to ${Math.round(row1)}; Tidy in the row ${tidyRow}, on the canvas ${tidy}; React Flow controls ${controls}; canvas at ⇧0 ${v1.z}, a scroll over a frame moved it ${Math.round(v1.y)} to ${Math.round(v2.y)}, Ctrl and the wheel zoomed to ${v3.z.toFixed(3)} and the dock said "${stated}"; map ${map0} then ${map1} after Show map`]
})

// AC-51 The dock shows the standard themes; its Design menu holds Contrast and the design lenses (Density) and leads to the
// Design view; choosing a theme keeps high contrast; the frame's outer line is quiet in light as in dark (AC-10)
await check("AC-51", async () => {
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list" })
  const frameTheme = () => p.frames().find((f) => f !== p.mainFrame()).evaluate(() => document.documentElement.dataset.theme)
  const themeButtons = await p.getByRole("group", { name: "Theme" }).getByRole("button").allInnerTexts().catch(() => [])
  const themeCount = await p.locator('[aria-label="Preview controls"] [aria-label="Theme"] button').count()
  const densityInDock = await p.getByRole("button", { name: /^Density,/ }).count()
  await p.getByRole("button", { name: /^Design,/ }).click()
  await wait(300)
  const menu = (await p.getByRole("menu").innerText()).replace(/\s+/g, " ")
  await p.getByRole("menuitemradio", { name: /^High/ }).click()
  await wait(1500)
  const high = [await frameTheme(), await p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("theme"))]
  await p.locator('[aria-label="Preview controls"] [aria-label="Theme"] button').nth(1).click()
  await wait(1500)
  const dark = await frameTheme()
  const label = await p.getByRole("button", { name: /^Design,/ }).getAttribute("aria-label")
  await p.getByRole("button", { name: /^Design,/ }).click()
  await wait(300)
  await p.getByRole("menuitemradio", { name: /^Standard/ }).click()
  await wait(1500)
  const standard = await frameTheme()
  await p.getByRole("button", { name: /^Design,/ }).click()
  await wait(300)
  await p.getByRole("menuitem", { name: /Draft changes in Design/ }).click()
  await wait(600)
  const view = await p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("view"))
  await p.closeAll()
  const ok = themeCount === 2 && densityInDock === 0 && /Contrast/.test(menu) && /Standard/.test(menu) && /High/.test(menu) && /Density/.test(menu) && /Draft changes in Design/.test(menu) && high[0] === "light-contrast" && high[1] === "light-contrast" && dark === "dark-contrast" && /High contrast/.test(label) && standard === "dark" && view === "design"
  return [ok ? "pass" : "fail", `${themeCount} theme buttons ${themeButtons.join("/")}; Density as its own dock control ${densityInDock}; Design menu: "${menu}"; High rendered ${high[0]} (link ${high[1]}); Dark then rendered ${dark} ("${label}"); Standard rendered ${standard}; Draft changes opened ${view}`]
})

// AC-52 Resize handles hug each frame, not the column around it, and keep their size on screen: in a row zoomed out below the label
// width and on the canvas at 10%, every grip sits 6 px off its frame's edge, the bottom grip is centered on the frame, and grips are 12 to 40 px
await check("AC-52", async () => {
  const measure = (p) => p.evaluate(() => [...document.querySelectorAll("[data-frame]")].map((fr) => {
    const f = fr.querySelector(".preview-frame").getBoundingClientRect()
    const e = fr.querySelector('[data-edge="e"] i').getBoundingClientRect()
    const s = fr.querySelector('[data-edge="s"] i').getBoundingClientRect()
    return { eGap: e.left - f.right, sGap: s.top - f.bottom, center: s.left + s.width / 2 - (f.left + f.width / 2), eLen: e.height, sLen: s.width }
  }))
  const bad = []
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones" })
  await allReady(p, 3)
  for (let i = 0; i < 4; i++) await p.keyboard.press("Minus")
  await wait(800)
  const row = await measure(p)
  await toCanvas(p)
  await canvasReady(p, 3)
  await p.keyboard.press("Minus")
  await p.keyboard.press("Minus")
  await wait(600)
  const canvas = await measure(p)
  const zoom = await chip(p)
  await p.closeAll()
  for (const [where, list] of [["row", row], ["canvas", canvas]])
    list.forEach((m, i) => {
      if (Math.abs(m.eGap - 6) > 1 || Math.abs(m.sGap - 6) > 1 || Math.abs(m.center) > 1 || m.eLen < 11.5 || m.eLen > 40.5 || m.sLen < 11.5 || m.sLen > 40.5) bad.push(`${where} frame ${i + 1} ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)])))}`)
    })
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : `row at 10% and canvas at "${zoom}": every grip 6 px off its frame, bottom grips centered, grip lengths ${[...row, ...canvas].map((m) => Math.round(m.eLen)).join(", ")} px`]
})

// ---------- Properties (AC-53 to AC-60) ----------
const CARD = "components.task-card"
/** The Inspect frame's document on screen, and Details. */
const liveFrame = async (p) => (await p.locator(".preview-frame iframe.opacity-100").first().elementHandle()).contentFrame()
const details = (p) => p.locator('[aria-label="Details"]')
const frameState = (f) => f.evaluate(() => ({ mounts: window.__studioMounts, mounted: window.__studioMounted, updated: window.__studioUpdated, card: document.querySelector(".task-card")?.className ?? "", text: document.querySelector(".task-card")?.textContent?.replace(/\s+/g, " ").trim() ?? "" }))
const badges = async (p) => (await p.locator("h2.font-heading + p + div").innerText()).replace(/\s+/g, " ")
/** A page whose preview frames carry a test flag from their first script. */
const flagged = async (flag, hash) => {
  const q = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await q.newPage()
  await frameFlag(page, flag, 0, 5000)
  await page.goto(servers.normal.url + `#${hash}`)
  await page.waitForSelector("header")
  await wait(1500)
  page.closeAll = () => q.close()
  return page
}

// AC-53 A Studio with no property inputs renders exactly as 0.10.2 (an empty range link value now reads as unset), and its build keeps
// the 0.11.0 chunks. Since 0.12.0 the initial chunk's size budget is per release and is checked by WS-01; this reports the growth only.
await check("AC-53", async () => {
  const dir = join(root, ".acceptance", "normal", "assets")
  const scripts = readdirSync(dir).filter((f) => f.endsWith(".js"))
  // A split would make the studio chunk look smaller while the initial load grows: expect exactly these chunks. The normal
  // build declares no workspace, so it has no workspace chunk either.
  const layout = scripts.map((f) => f.split("-")[0]).sort().join(",")
  const main = scripts.find((f) => /^studio-.*\.js$/.test(f))
  const grew = gzipSync(readFileSync(join(dir, main))).length - STUDIO_CHUNK_BASELINE_GZ
  // The stress Studio declares no properties.
  const p = await open("stress", { hash: "view=inspect&scenario=syn.tasks.2" })
  await wait(800)
  const tabs = await details(p).getByRole("tab").allInnerTexts()
  const section = await p.locator("[data-properties]").count()
  const picker = await details(p).getByRole("combobox", { name: "State" }).count()
  const edited = await p.getByText(/Edited ·/).count()
  const keys = await p.evaluate(() => [...new URLSearchParams(location.hash.slice(1)).keys()].join(","))
  const values = Object.keys((await frameState(await liveFrame(p))).mounted.values).join(",")
  // A built Studio never requests __studio/scenarios (dev builds only), so only the properties- chunk half of this can catch a regression here.
  const loaded = await p.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /properties-|__studio\/scenarios/.test(n)))
  const stored = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("property-edits")))
  // Without frameIsolation the frames carry no sandbox or credentialless attribute, as in 0.10.x.
  const isolated = await p.locator("iframe[sandbox], iframe[credentialless]").count()
  await p.closeAll()
  const same = isolated === 0 && tabs.join() === "Scenario,Fidelity,Evidence" && section === 0 && picker === 0 && edited === 0 && keys === "view,scenario,theme,profile" && values === "density" && loaded.length === 0 && stored.length === 0
  const ok = same && layout === "canvas,example,properties,protocol,studio"
  return [ok ? "pass" : "fail", `without properties: tabs ${tabs.join(", ")}, Properties ${section}, state picker ${picker}, Edited ${edited}, link keys ${keys}, mounted values ${values}, property chunk or scenarios requests ${loaded.length}, stored edits ${stored.length}, isolated frames ${isolated}; chunks ${layout}; initial chunk ${main} grew ${grew} bytes gzipped against ${STUDIO_CHUNK_BASELINE} (${STUDIO_CHUNK_BASELINE_GZ}; budget checked by WS-01)`]
})

// AC-54 Switch, text, number and choice change the live frame without a remount; booleans arrive as booleans; a choice sends only its ID;
// a frame without live-values, or whose update throws, is remounted with the new values instead; a value the product cannot mount
// keeps the previous preview with an error, and the next good value mounts and shows Ready
await check("AC-54", async () => {
  const p = await open("normal", { hash: `view=inspect&scenario=${CARD}` })
  await wait(800)
  const f = await liveFrame(p)
  const before = await frameState(f)
  await details(p).getByRole("switch", { name: "Done" }).click()
  await details(p).getByLabel("Title", { exact: true }).fill("Ship the release notes")
  await details(p).getByRole("button", { name: /All properties/ }).click()
  await details(p).getByRole("combobox", { name: "Assignee" }).click()
  await p.getByRole("option", { name: "A very long name" }).click()
  await details(p).getByRole("button", { name: "Set Estimate (hours)" }).click()
  await details(p).getByLabel("Estimate (hours)", { exact: true }).fill("3.5")
  await wait(1000)
  const iframes = await p.locator(".preview-frame iframe").count()
  const after = await frameState(f)
  await p.closeAll()
  const u = after.updated ?? {}
  const live = before.mounts === 1 && after.mounts === 1 && iframes === 1 && u.done === true && u.title === "Ship the release notes" && u.assignee === "long" && u.estimate === 3.5 && /done/.test(after.card) && /Maximiliana/.test(after.text) && /3\.5 h/.test(after.text)
  // An older frame client, without live-values: the change mounts a new runtime that carries it.
  const page = await flagged("__studioNoLive", `view=inspect&scenario=${CARD}`)
  await details(page).getByRole("switch", { name: "Done" }).click()
  await wait(2000)
  const legacy = await frameState(await liveFrame(page))
  const legacyStatus = await badges(page)
  await page.closeAll()
  const fallback = legacy.mounted.values.done === true && /done/.test(legacy.card) && /Ready/.test(legacyStatus)
  // A client whose update throws: the error reply mounts a new runtime with the values.
  const t = await flagged("__studioUpdateThrows", `view=inspect&scenario=${CARD}`)
  const firstDoc = await liveFrame(t)
  await details(t).getByRole("switch", { name: "Done" }).click()
  await wait(2000)
  const thrown = await frameState(await liveFrame(t))
  const thrownStatus = await badges(t)
  const replaced = (await liveFrame(t)) !== firstDoc
  await t.closeAll()
  const recovered = replaced && thrown.mounted.values.done === true && /done/.test(thrown.card) && thrown.updated === undefined && /Ready/.test(thrownStatus)
  // A value the product cannot show: update and mount both throw, so the previous preview stays with an error; the next good value mounts.
  const b = await flagged("__studioStrictTitle", `view=inspect&scenario=${CARD}`)
  await details(b).getByLabel("Title", { exact: true }).fill("Reject this title")
  await wait(2500)
  const bad = { status: await badges(b), text: (await frameState(await liveFrame(b))).text }
  await details(b).getByLabel("Title", { exact: true }).fill("A title it can show")
  await wait(2500)
  const good = await frameState(await liveFrame(b))
  const goodStatus = await badges(b)
  await b.closeAll()
  // A slow update overtaken by a newer one: updates run in order and the newest values are what the card shows.
  const o = await flagged("__studioSlowFirstUpdate", `view=inspect&scenario=${CARD}`)
  await details(o).getByRole("switch", { name: "Done" }).click()
  await wait(150)
  await details(o).getByRole("switch", { name: "Done" }).click()
  await wait(2000)
  const overtaken = await frameState(await liveFrame(o))
  await o.closeAll()
  const ordered = overtaken.mounts === 1 && overtaken.updated?.done === false && !/done/.test(overtaken.card)
  const retried = /Showing previous/.test(bad.status) && /Draft the quarterly plan/.test(bad.text) && /Ready/.test(goodStatus) && good.mounted.values.title === "A title it can show" && /A title it can show/.test(good.text)
  return [live && fallback && recovered && retried && ordered ? "pass" : "fail", `one document mounted ${after.mounts} time(s) across four edits, ${iframes} frame; the frame received done ${JSON.stringify(u.done)} (${typeof u.done}), title "${u.title}", assignee ${JSON.stringify(u.assignee)}, estimate ${JSON.stringify(u.estimate)}; it shows "${after.text}"; without live-values the change remounted with done ${legacy.mounted.values.done} ("${legacyStatus}"); when update threw, a new document (${replaced}) mounted with done ${thrown.mounted.values.done} ("${thrownStatus}"); a title the product rejects gave "${bad.status}" over "${bad.text}", then a good one mounted "${good.mounted.values.title}" ("${goodStatus}"); a slow update overtaken by a newer one left done ${JSON.stringify(overtaken.updated?.done)} on screen (card ${/done/.test(overtaken.card) ? "done" : "open"}, mounts ${overtaken.mounts})`]
})

// AC-55 Properties show only on their surfaces; curated rows first; All properties starts collapsed; optional rows show Set until used
await check("AC-55", async () => {
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list" })
  const elsewhere = await p.locator("[data-properties]").count()
  await p.goto(servers.normal.url + `#view=inspect&scenario=${CARD}`)
  await p.reload()
  await p.waitForSelector("[data-properties]")
  await wait(800)
  const rows = () => details(p).locator("[data-property]").evaluateAll((els) => els.map((e) => e.getAttribute("data-property")))
  const first = await rows()
  const trigger = details(p).getByRole("button", { name: /All properties/ })
  const collapsed = await trigger.getAttribute("aria-expanded")
  const label = await trigger.innerText()
  await trigger.click()
  await wait(300)
  const all = await rows()
  const unsentBefore = Object.keys((await frameState(await liveFrame(p))).mounted.values)
  const greyed = await details(p).locator('[data-property="estimate"]').innerText()
  const noteField = await details(p).locator('[data-property="note"] textarea').count()
  const readonly = await details(p).locator('[data-property="onOpen"]').innerText()
  const emptyNote = await details(p).locator('[data-property="note"]').innerText()
  // A control that removes itself hands focus on: Set to the field it reveals, Clear back to Set.
  const focusOn = () => p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
  await details(p).getByRole("button", { name: "Set Note" }).click()
  await wait(300)
  const noteShown = await details(p).locator('[data-property="note"] textarea').count()
  const afterSet = await focusOn()
  await details(p).locator('[data-property="note"]').getByRole("button", { name: "Clear Note" }).click()
  await wait(300)
  const setAgain = await details(p).getByRole("button", { name: "Set Note" }).count()
  const afterClear = await focusOn()
  await p.closeAll()
  const ok = elsewhere === 0 && first.join() === "title,done" && collapsed === "false" && /All properties \(4\)/.test(label) && all.join() === "title,done,assignee,note,estimate,onOpen" && !unsentBefore.includes("note") && !unsentBefore.includes("estimate") && /2 \(product default\)/.test(greyed) && noteField === 0 && /Handled by the sample data/.test(readonly) && noteShown === 1 && setAgain === 1 && /Empty \(product default\)/.test(emptyNote) && afterSet === "property-note" && afterClear === "property-note-set"
  return [ok ? "pass" : "fail", `on Today ${elsewhere} property sections; on the Task card ${first.join(", ")} shown, "${label.trim()}" expanded=${collapsed}, then ${all.join(", ")}; optional Note and Estimate not sent (${unsentBefore.join(", ")}), Estimate reads "${greyed.replace(/\s+/g, " ")}", Note field ${noteField} until Set (${noteShown}), Clear returns Set (${setAgain}), unset Note reads "${emptyNote.replace(/\s+/g, " ")}", focus after Set on ${afterSet} and after Clear on ${afterClear}; On open: "${readonly.replace(/\s+/g, " ")}"`]
})

// AC-56 Edited and Modified are independent; Reset properties clears edits; R does not
await check("AC-56", async () => {
  const p = await open("normal", { hash: `view=inspect&scenario=${CARD}` })
  await wait(800)
  await details(p).getByRole("switch", { name: "Done" }).click()
  await wait(500)
  const edited = await badges(p)
  await (await liveFrame(p)).click(".task-card .check")
  await wait(800)
  const both = await badges(p)
  await details(p).getByRole("button", { name: /^Reset \(1\)/ }).click()
  await wait(800)
  const cleared = await badges(p)
  const focusOn = () => p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
  const afterReset = await focusOn()
  const sent = (await frameState(await liveFrame(p))).updated?.done
  await details(p).getByRole("switch", { name: "Done" }).click()
  await wait(500)
  await p.locator("header").click({ position: { x: 600, y: 20 } })
  await p.keyboard.press("r")
  await wait(2000)
  const afterR = await badges(p)
  const remounted = (await frameState(await liveFrame(p))).mounted.values.done
  await details(p).getByRole("button", { name: "Back to designed: Done" }).click()
  await wait(500)
  const afterBack = await p.evaluate(() => `${document.activeElement?.closest("[data-property]")?.getAttribute("data-property")}:${document.activeElement?.getAttribute("role")}`)
  const back = await badges(p)
  await p.closeAll()
  const ok = afterReset === "property-title" && afterBack === "done:switch" && !/Edited/.test(back) && /Edited · 1 property/.test(edited) && !/Modified/.test(edited) && /Modified/.test(both) && /Edited · 1 property/.test(both) && /Modified/.test(cleared) && !/Edited/.test(cleared) && sent === false && /Edited · 1 property/.test(afterR) && !/Modified/.test(afterR) && remounted === true
  return [ok ? "pass" : "fail", `after an edit "${edited}"; after ticking the card in the frame "${both}"; Reset properties gave "${cleared}" and sent done ${sent}; after another edit and R "${afterR}", remounted with done ${remounted}; focus after Reset on ${afterReset}, after Back to designed on ${afterBack} ("${back}")`]
})

// AC-57 Shareable text travels in the link; other text stays in this browser and leaves edited=local; both survive a reload as specified
await check("AC-57", async () => {
  const p = await open("normal", { hash: `view=inspect&scenario=${CARD}` })
  await wait(800)
  await details(p).getByLabel("Title", { exact: true }).fill("Shared title")
  await details(p).getByRole("switch", { name: "Done" }).click()
  await details(p).getByRole("button", { name: /All properties/ }).click()
  await details(p).getByRole("button", { name: "Set Note" }).click()
  await details(p).getByLabel("Note", { exact: true }).fill("Private note")
  await wait(600)
  const link = await p.evaluate(() => location.hash)
  await p.reload()
  await p.waitForSelector("[data-properties]")
  await wait(1200)
  await details(p).getByRole("button", { name: /All properties/ }).click()
  const reloaded = { title: await details(p).getByLabel("Title", { exact: true }).inputValue(), note: await details(p).getByLabel("Note", { exact: true }).inputValue(), warned: await details(p).getByText(/The sender had local text edits/).count() }
  // A link that names the scenario shows its own state, but this browser's stored edits stay until the person edits that scenario here.
  const storedNote = () => p.evaluate(() => JSON.parse(localStorage.getItem("studio.example-tasks.property-edits.v1") ?? "{}")["components.task-card"]?.note ?? null)
  await p.goto(servers.normal.url + `#view=inspect&scenario=${CARD}&done=true`)
  await p.reload()
  await p.waitForSelector("[data-properties]")
  await wait(1200)
  const linked = { title: await details(p).getByLabel("Title", { exact: true }).inputValue(), stored: await storedNote() }
  await details(p).getByRole("switch", { name: "Done" }).click()
  await wait(600)
  linked.afterEdit = await storedNote()
  await p.closeAll()
  const fresh = await open("normal", { hash: link.slice(1) })
  await wait(1200)
  await details(fresh).getByRole("button", { name: /All properties/ }).click()
  const received = { title: await details(fresh).getByLabel("Title", { exact: true }).inputValue(), done: await details(fresh).getByRole("switch", { name: "Done" }).getAttribute("aria-checked"), noteSet: await details(fresh).getByRole("button", { name: "Set Note" }).count(), warned: await details(fresh).getByText(/The sender had local text edits/).count(), frame: (await frameState(await liveFrame(fresh))).mounted.values }
  await fresh.closeAll()
  const ok = /title=Shared\+title/.test(link) && /done=true/.test(link) && /edited=local/.test(link) && !/Private/.test(link) && reloaded.title === "Shared title" && reloaded.note === "Private note" && reloaded.warned === 0 && linked.title === "Draft the quarterly plan" && linked.stored === "Private note" && linked.afterEdit === null && received.title === "Shared title" && received.done === "true" && received.noteSet === 1 && received.warned === 1 && received.frame.note === undefined
  return [ok ? "pass" : "fail", `link ${link}; after a reload Title "${reloaded.title}" and Note "${reloaded.note}" (note shown ${reloaded.warned}); a link without them showed Title "${linked.title}" and kept the stored note ${JSON.stringify(linked.stored)} until an edit there (then ${JSON.stringify(linked.afterEdit)}); in a fresh browser Title "${received.title}", Done ${received.done}, Note unset ${received.noteSet === 1} with the sender note ${received.warned}, frame note ${JSON.stringify(received.frame.note)}`]
})

// AC-58 Save as scenario: the dev server writes a valid scenarios.json through the guarded endpoint; the saved state appears, survives a reload,
// renames, duplicates and deletes; a built Studio disables saving with the reason and offers Copy as JSON
await check("AC-58", async () => {
  const file = join(root, "scenarios.json")
  const backup = existsSync(file) ? `${file}.acceptance-backup` : null
  if (backup) copyFileSync(file, backup)
  rmSync(file, { force: true })
  const port = 5393
  const dev = spawn("npx", ["vite", "--port", String(port), "--strictPort", "--logLevel", "error"], { cwd: root, stdio: "ignore", env: { ...process.env, VITE_STUDIO_ADAPTER: "example" } })
  try {
    const url = `http://localhost:${port}/`
    for (let i = 0; i < 60 && !(await fetch(url).then((r) => r.ok).catch(() => false)); i++) await wait(500)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await context.newPage()
    p.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Finished card, renamed" : undefined))
    await p.goto(`${url}#view=inspect&scenario=${CARD}`)
    await p.waitForSelector("[data-properties]")
    await wait(2000)
    // The first save creates scenarios.json: the page must not reload or re-run the store (this marker survives).
    await p.evaluate(() => (window.__ac58 = "kept"))
    await details(p).getByRole("switch", { name: "Done" }).click()
    await details(p).getByRole("button", { name: /Save as scenario/ }).click()
    await p.getByLabel("Name the new state").fill("Finished card")
    await p.getByRole("button", { name: "Save", exact: true }).last().click()
    await wait(1000)
    const written = JSON.parse(readFileSync(file, "utf8"))
    const selected = await p.evaluate(() => new URLSearchParams(location.hash.slice(1)).get("scenario"))
    // In the same page: a duplicate, then deleting it, takes its row out of the catalog.
    await details(p).getByRole("button", { name: "More saved state actions" }).click()
    await p.getByRole("menuitem", { name: "Duplicate" }).click()
    await wait(600)
    const copyRow = await p.locator('[role="treeitem"][title="Finished card copy"]').count()
    await details(p).getByRole("button", { name: "More saved state actions" }).click()
    await p.getByRole("menuitem", { name: "Delete" }).click()
    await wait(600)
    const deletedRow = await p.locator('[role="treeitem"][title="Finished card copy"]').count()
    const marker = await p.evaluate(() => window.__ac58)
    await p.locator('[role="treeitem"][title="Finished card"]').click()
    await wait(600)
    // The client refuses a generated ID with the same rules as the endpoint (the save path passes the generated IDs).
    const clientRefuses = await p.evaluate(async (card) => {
      const { validateScenarios } = await import("/src/studio/scenarios.ts")
      return validateScenarios({ schema: "studio-scenarios/1", scenarios: [{ id: "saved.taken", label: "Taken", base: card, values: {} }] }, ["saved.taken", card]).join(" ")
    }, CARD)
    await p.reload()
    await p.waitForSelector("header")
    await wait(2500)
    const row = await p.locator('[role="treeitem"][title="Finished card"]').innerText().catch(() => "")
    const title = await details(p).locator("h2").innerText()
    const mounted = (await frameState(await liveFrame(p))).mounted
    await details(p).getByRole("button", { name: "More saved state actions" }).click()
    await p.getByRole("menuitem", { name: "Rename" }).click()
    await wait(600)
    await details(p).getByRole("button", { name: "More saved state actions" }).click()
    await p.getByRole("menuitem", { name: "Duplicate" }).click()
    await wait(600)
    const two = JSON.parse(readFileSync(file, "utf8")).scenarios.map((x) => x.label)
    await details(p).getByRole("button", { name: "More saved state actions" }).click()
    await p.getByRole("menuitem", { name: "Delete" }).click()
    await wait(600)
    const one = JSON.parse(readFileSync(file, "utf8")).scenarios.map((x) => x.label)
    // A save rewrites only its own entry: one the Studio skips (its base is not generated) and one holding a value the
    // Studio drops (not a property) are written back exactly as stored. Clearing an optional property a saved state
    // sets, then Save, leaves that property out of the file.
    const orphan = { id: "saved.orphan", label: "Orphan", base: "gone.scenario", values: { done: true } }
    const extra = { id: "saved.extra", label: "Extra", base: CARD, values: { done: true, ghost: "kept as written" } }
    const noted = { id: "saved.noted", label: "Noted", base: CARD, values: { note: "Saved note" } }
    const seeded = JSON.parse(readFileSync(file, "utf8"))
    writeFileSync(file, `${JSON.stringify({ ...seeded, scenarios: [...seeded.scenarios, orphan, extra, noted] }, null, 2)}\n`)
    await p.goto(`${url}#view=inspect&scenario=saved.noted`)
    await p.reload()
    await p.waitForSelector("[data-properties]")
    await wait(2500)
    const notedMounted = (await frameState(await liveFrame(p))).mounted.values.note
    const more = details(p).getByRole("button", { name: /All properties/ })
    if ((await more.getAttribute("aria-expanded")) === "false") await more.click()
    await details(p).getByRole("button", { name: "Clear Note" }).click()
    await wait(800)
    const clearedFrame = (await frameState(await liveFrame(p))).updated ?? {}
    await details(p).getByRole("button", { name: "Save", exact: true }).click()
    await wait(1000)
    const rewritten = JSON.parse(readFileSync(file, "utf8")).scenarios
    const same = (want) => JSON.stringify(rewritten.find((x) => x.id === want.id)) === JSON.stringify(want)
    const kept = same(orphan) && same(extra)
    const notedSaved = rewritten.find((x) => x.id === "saved.noted")
    const unset = notedMounted === "Saved note" && !("note" in clearedFrame) && !!notedSaved && !("note" in notedSaved.values) && rewritten.length === 4
    // Another browser saves between this page reading scenarios.json and writing it: the write is refused with 409,
    // nothing is overwritten, the catalog shows the other state, the edit stays unsaved, and saving again writes it.
    await details(p).getByRole("switch", { name: "Done" }).click()
    await wait(600)
    const other = await browser.newContext()
    const q = await other.newPage()
    await q.goto(url)
    let otherStatus = 0
    await p.route("**/__studio/scenarios", async (route) => {
      if (route.request().method() === "POST" && !otherStatus) {
        const theirs = JSON.parse(readFileSync(file, "utf8"))
        theirs.scenarios.push({ id: "saved.from-elsewhere", label: "From elsewhere", base: CARD, values: { done: true } })
        otherStatus = await q.evaluate((body) => fetch("__studio/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.status), JSON.stringify(theirs))
      }
      await route.continue()
    })
    await details(p).getByRole("button", { name: "Save", exact: true }).click()
    await wait(1000)
    await p.unroute("**/__studio/scenarios")
    await other.close()
    const onDisk = JSON.parse(readFileSync(file, "utf8")).scenarios
    const conflict = {
      kept: onDisk.some((x) => x.id === "saved.from-elsewhere") && !("done" in (onDisk.find((x) => x.id === "saved.noted")?.values ?? {})),
      listed: await p.locator('[role="treeitem"][title="From elsewhere"]').count(),
      edited: await details(p).getByRole("switch", { name: "Done" }).getAttribute("aria-checked"),
      told: await p.locator("[data-sonner-toast]").filter({ hasText: /changed elsewhere/ }).innerText().catch(() => ""),
    }
    await details(p).getByRole("button", { name: "Save", exact: true }).click()
    await wait(1000)
    const retried = JSON.parse(readFileSync(file, "utf8")).scenarios
    const retriedOk = retried.find((x) => x.id === "saved.noted")?.values?.done === true && retried.some((x) => x.id === "saved.from-elsewhere")
    // A merge leaves scenarios.json unreadable: a save is refused and the file is untouched.
    const merged = `<<<<<<< ours\n${readFileSync(file, "utf8")}=======\n{}\n>>>>>>> theirs\n`
    writeFileSync(file, merged)
    await details(p).getByRole("switch", { name: "Done" }).click()
    await wait(600)
    await details(p).getByRole("button", { name: "Save", exact: true }).click()
    await wait(1000)
    const unreadable = { untouched: readFileSync(file, "utf8") === merged, told: await p.locator("[data-sonner-toast]").filter({ hasText: /not a valid saved-states file/ }).innerText().catch(() => "") }
    writeFileSync(file, `${JSON.stringify({ schema: "studio-scenarios/1", scenarios: retried }, null, 2)}\n`)
    await context.close()
    const post = (body, headers = {}) => fetch(`${url}__studio/scenarios`, { method: "POST", headers: { "content-type": "application/json", origin: `http://localhost:${port}`, ...headers }, body })
    const cross = (await post(JSON.stringify(written), { origin: "https://evil.example" })).status
    const invalid = (await post(JSON.stringify({ schema: "studio-scenarios/1", scenarios: [{ id: "Bad ID", label: "", base: CARD, values: [] }] }))).status
    const generated = (await post(JSON.stringify({ schema: "studio-scenarios/1", scenarios: [{ id: CARD, label: "Over", base: CARD, values: {} }] }))).status
    const huge = (await post(JSON.stringify({ schema: "studio-scenarios/1", pad: "x".repeat(300 * 1024), scenarios: [] }))).status
    // A built Studio: Save as scenario is disabled with the reason; Copy as JSON is offered.
    const b = await open("normal", { hash: `view=inspect&scenario=${CARD}` })
    await b.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(b.url()).origin })
    await wait(800)
    await details(b).getByRole("switch", { name: "Done" }).click()
    const builtSave = await details(b).getByRole("button", { name: /Save as scenario/ }).isDisabled()
    const reason = await details(b).getByText(/Saving needs the local Studio/).count()
    const copy = await details(b).getByRole("button", { name: "Copy as JSON" }).count()
    await details(b).getByRole("button", { name: "Copy as JSON" }).click()
    await wait(400)
    const copied = await b.evaluate(() => navigator.clipboard.readText().then((t) => JSON.parse(t)).catch(() => ({})))
    // Without a clipboard the JSON is shown to select by hand.
    await b.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }))
    await details(b).getByRole("button", { name: "Copy as JSON" }).click()
    await wait(400)
    const shownJson = await details(b).locator("[data-copy-json]").innerText().then((t) => JSON.parse(t)).catch(() => ({}))
    await b.closeAll()
    const s0 = written.scenarios[0] ?? {}
    const ok = written.schema === "studio-scenarios/1" && s0.id === "saved.finished-card" && s0.base === CARD && s0.label === "Finished card" && s0.values?.done === true && selected === s0.id && /Finished card/.test(row) && /Saved/.test(row) && /Finished card/.test(title) && mounted.scenario === CARD && mounted.values.done === true && two.join("|") === "Finished card, renamed|Finished card, renamed copy" && one.join("|") === "Finished card, renamed" && cross === 403 && invalid === 422 && generated === 422 && huge === 413 && builtSave && reason > 0 && copy === 1 && marker === "kept" && copyRow === 1 && deletedRow === 0 && /cannot be overwritten/.test(clientRefuses) && copied.base === CARD && copied.values?.done === true && /^saved\./.test(copied.id ?? "") && shownJson.base === CARD && shownJson.values?.done === true && kept && unset && otherStatus === 200 && conflict.kept && conflict.listed === 1 && conflict.edited === "true" && /latest is loaded/.test(conflict.told) && retriedOk && unreadable.untouched && /not a valid saved-states file/.test(unreadable.told)
    return [ok ? "pass" : "fail", `Save as wrote ${written.scenarios.length} state ${s0.id} from ${s0.base} with ${JSON.stringify(s0.values)} and selected it (${selected}); after a reload the catalog row reads "${row.replace(/\s+/g, " ")}", Details "${title}", the frame mounted ${mounted.scenario} with done ${mounted.values.done}; rename and duplicate gave ${two.join(" and ")}, delete left ${one.join(", ")}; the endpoint answered ${cross} to another origin, ${invalid} to an invalid file, ${generated} to a generated ID, ${huge} to an oversized one; a built Studio disables Save as scenario (${builtSave}), says why (${reason}) and offers Copy as JSON (${copy}); in the page that created the file the marker was ${marker}, the duplicate's row showed (${copyRow}) and was gone after Delete (${deletedRow}); the client refuses a generated ID (${clientRefuses ? "yes" : "no"}); Copy as JSON gave ${copied.id} from ${copied.base} with ${JSON.stringify(copied.values)}, and without a clipboard showed ${shownJson.base} with ${JSON.stringify(shownJson.values)} to select; saving another state kept the skipped entry and the unknown value as written (${kept}); a saved state mounted with note ${JSON.stringify(notedMounted)}, Clear sent values without it (${!("note" in clearedFrame)}) and Save wrote ${JSON.stringify(notedSaved?.values)} among ${rewritten.length} entries; when another browser saved (${otherStatus}) between this page's read and write, the file kept its state and nothing of this edit (${conflict.kept}), the catalog listed it (${conflict.listed}), Done stayed edited (${conflict.edited}) and the page said "${conflict.told.replace(/\s+/g, " ")}"; saving again wrote the edit beside it (${retriedOk}); with scenarios.json left unreadable by a merge a save left it untouched (${unreadable.untouched}) and said "${unreadable.told.replace(/\s+/g, " ")}"`]
  } finally {
    dev.kill()
    if (backup) copyFileSync(backup, file), rmSync(backup)
    else rmSync(file, { force: true })
  }
})

// AC-59 A boolean or choice property is a Compare axis; text is not offered
await check("AC-59", async () => {
  const p = await open("normal", { hash: `view=compare&scenario=${CARD}` })
  await p.getByRole("combobox", { name: "Changing axis" }).click()
  await wait(400)
  const axes = await p.getByRole("option").allInnerTexts()
  await p.getByRole("option", { name: "Done", exact: true }).click()
  await wait(2500)
  const sides = await p.locator("figcaption").allInnerTexts()
  const done = await Promise.all((await p.locator(".preview-frame iframe.opacity-100").all()).map(async (e) => (await (await e.elementHandle()).contentFrame()).evaluate(() => document.querySelector(".task-card")?.classList.contains("done"))))
  await p.getByRole("combobox", { name: "Changing axis" }).click()
  await p.getByRole("option", { name: "Assignee", exact: true }).click()
  await wait(2500)
  const who = await Promise.all((await p.locator(".preview-frame iframe.opacity-100").all()).map(async (e) => (await (await e.elementHandle()).contentFrame()).evaluate(() => document.querySelector(".task-card .who")?.textContent)))
  // Compare sides never write into the Inspect edits: back in Inspect, Done is as designed and nothing is Edited.
  await p.getByRole("button", { name: "Inspect" }).first().click()
  await wait(1500)
  const inspectDone = await details(p).getByRole("switch", { name: "Done" }).getAttribute("aria-checked")
  const edited = await p.getByText(/Edited ·/).count()
  const backHash = await p.evaluate(() => location.hash)
  await p.closeAll()
  const ok = /(^#|&)view=inspect(&|$)/.test(backHash) && inspectDone === "false" && edited === 0 && axes.includes("Done") && axes.includes("Assignee") && axes.includes("Estimate (hours)") && !axes.includes("Title") && !axes.includes("Note") && !axes.includes("On open") && done.join() === "false,true" && new Set(who).size === 2
  return [ok ? "pass" : "fail", `axes offered ${axes.join(", ")}; Done sides ${sides.map((x) => x.replace(/\s+/g, " ").trim()).join(" | ")} rendered done ${done.join(" and ")}; Assignee sides showed ${who.join(" and ")}; back in Inspect (${backHash.includes("view=inspect") ? "view=inspect in the link" : "link lacks view=inspect"}) Done is ${inspectDone === "true" ? "on" : "off"} and Edited shows ${edited} time(s)`]
})

// AC-60 The Code tab appears only with the code capability and copies the snippet
await check("AC-60", async () => {
  const p = await open("normal", { hash: `view=inspect&scenario=${CARD}` })
  await wait(800)
  await p.evaluate(() => {
    window.__copied = []
    navigator.clipboard.writeText = async (t) => void window.__copied.push(t)
  })
  await details(p).getByRole("switch", { name: "Done" }).click()
  await details(p).getByLabel("Title", { exact: true }).fill("Ship it")
  await wait(600)
  await details(p).getByRole("tab", { name: "Code" }).click()
  await wait(800)
  const shown = await details(p).locator("[data-code]").innerText()
  await details(p).getByRole("button", { name: "Copy", exact: true }).click()
  await wait(300)
  const copied = await p.evaluate(() => window.__copied[0] ?? "")
  await p.closeAll()
  const q = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await q.newPage()
  await frameFlag(page, "__studioNoCode", 0, 5000)
  await page.goto(servers.normal.url + `#view=inspect&scenario=${CARD}`)
  await page.waitForSelector("[data-properties]")
  await wait(1500)
  const without = await details(page).getByRole("tab").allInnerTexts()
  await q.close()
  const ok = /<TaskCard/.test(shown) && /title=\{"Ship it"\}/.test(shown) && /\bdone\b/.test(shown) && !/assignee/.test(shown) && copied === shown && !without.includes("Code")
  return [ok ? "pass" : "fail", `with the capability the Code tab showed ${JSON.stringify(shown)} (only changed props) and Copy put the same text on the clipboard (${copied === shown}); a frame without it shows tabs ${without.join(", ")}`]
})

// AC-61 A preview that did not start offers Retry, and Retry mounts the frame again: once the cause is gone the preview is Ready
await check("AC-61", async () => {
  const until = async (read, test, ms) => {
    const end = Date.now() + ms
    let value = await read()
    while (!test(value) && Date.now() < end) {
      await wait(100)
      value = await read()
    }
    return value
  }
  const q = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await q.newPage()
  // Frames reject this title until the page says the cause is gone.
  await p.addInitScript(() => {
    if (window === window.top) return
    try {
      if (!window.top.__causeGone) window.__studioStrictTitle = true
    } catch {
      window.__studioStrictTitle = true
    }
  })
  await p.goto(servers.normal.url + `#view=inspect&scenario=${CARD}&title=${encodeURIComponent("Reject this title")}`)
  await p.waitForSelector("header")
  const retry = p.locator(".preview-frame").getByRole("button", { name: "Retry" })
  const offered = await until(() => retry.count(), (n) => n > 0, 8000)
  const failed = await p.locator("header").innerText()
  await p.evaluate(() => (window.__causeGone = true))
  if (offered) await retry.click()
  const ready = await until(() => p.locator("header").innerText(), (t) => /Ready/.test(t), 8000)
  const left = await retry.count()
  const shown = left ? "" : ((await frameState(await liveFrame(p))).text ?? "")
  await q.close()
  // A failure belongs to its frame: with the cause gone, choosing another theme mounts afresh without Retry.
  const r = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const t = await r.newPage()
  await t.addInitScript(() => {
    if (window === window.top) return
    try {
      if (!window.top.__causeGone) window.__studioStrictTitle = true
    } catch {
      window.__studioStrictTitle = true
    }
  })
  await t.goto(servers.normal.url + `#view=inspect&scenario=${CARD}&title=${encodeURIComponent("Reject this title")}`)
  await t.waitForSelector("header")
  const failedAgain = await until(() => t.locator(".preview-frame").getByRole("button", { name: "Retry" }).count(), (n) => n > 0, 8000)
  await t.evaluate(() => (window.__causeGone = true))
  await t.locator('[role="toolbar"] [aria-label="Dark"]').click()
  const moved = await until(() => t.locator("header").innerText(), (x) => /Ready/.test(x), 8000)
  const stuck = await t.locator(".preview-frame").getByRole("button", { name: "Retry" }).count()
  await r.close()
  const ok = offered > 0 && /Did not start/.test(failed) && /Ready/.test(ready) && left === 0 && /Reject this title/.test(shown) && failedAgain > 0 && /Ready/.test(moved) && stuck === 0
  return [ok ? "pass" : "fail", `a frame that failed to mount showed Retry (${offered > 0}) with "${/Did not start/.test(failed) ? "Did not start" : failed.replace(/\s+/g, " ").slice(0, 40)}" in the top bar; after the cause was removed, Retry mounted the frame (${left === 0 ? "Retry gone" : "Retry still shown"}), the top bar read ${/Ready/.test(ready) ? "Ready" : JSON.stringify(ready.replace(/\s+/g, " ").slice(0, 40))} and the card shows "${shown.slice(0, 40)}"; a second failure was cleared by choosing the Dark theme (${stuck === 0 ? "frame mounted" : "failure kept"}, top bar ${/Ready/.test(moved) ? "Ready" : JSON.stringify(moved.replace(/\s+/g, " ").slice(0, 40))})`]
})

/** Page helpers for AC-62 to AC-64: painted colors, contrast, the backdrop behind an element and a target's hit box. */
const floorHelpers = () => {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const g = canvas.getContext("2d", { willReadFrequently: true })
  const paint = (layers) => {
    g.clearRect(0, 0, 1, 1)
    for (const c of layers) {
      g.fillStyle = c
      g.fillRect(0, 0, 1, 1)
    }
    return Array.from(g.getImageData(0, 0, 1, 1).data)
  }
  const lum = (c) => {
    const f = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
    return (x + 0.05) / (y + 0.05)
  }
  const backdrop = (el) => {
    const chain = []
    for (let a = el; a; a = a.parentElement) chain.unshift(getComputedStyle(a).backgroundColor)
    return paint(["#ffffff", ...chain]).slice(0, 3)
  }
  const on = (color, el) => {
    const bg = backdrop(el)
    return ratio(paint([`rgb(${bg.join(",")})`, color]).slice(0, 3), bg)
  }
  // A switch, checkbox, radio or slider thumb counts the hit area its ::after adds; a slider's input is its thumb.
  const hit = (el) => {
    const e = (el.matches('input[type="range"]') && el.closest('[data-slot="slider-thumb"]')) || el
    const r = e.getBoundingClientRect()
    let w = r.width
    let h = r.height
    if (/^(switch|checkbox|radio)$/.test(e.getAttribute("role") ?? "") || e.matches('[data-slot="slider-thumb"]')) {
      const a = getComputedStyle(e, "::after")
      if (a.position === "absolute") {
        h -= (parseFloat(a.top) || 0) + (parseFloat(a.bottom) || 0)
        w -= (parseFloat(a.left) || 0) + (parseFloat(a.right) || 0)
      }
    }
    return { w: Math.round(w), h: Math.round(h) }
  }
  const name = (e) => (e.getAttribute("aria-label") || e.textContent.trim() || e.id || e.tagName).replace(/\s+/g, " ").slice(0, 24)
  const shown = (e) => {
    if (!e.getClientRects().length || e.closest("[inert]")) return false
    const r = e.getBoundingClientRect()
    return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== "hidden"
  }
  window.__floors = { paint, ratio, backdrop, on, hit, name, shown }
}
const openFloors = async (name, o) => {
  const p = await open(name, o)
  await p.evaluate(floorHelpers)
  return p
}

// AC-62 Tablets and phones (touch): the narration never overlaps its controls; the top bar truncates its breadcrumb and keeps every
// action on screen; every dock control stays on screen; Tokens values and stage are readable; the bottom bar's labels fit their entries
await check("AC-62", async () => {
  const bad = []
  const notes = []
  for (const appearance of ["light", "dark"]) {
    // 1. Present: text and controls never overlap, nothing spills sideways, no word runs out of the text column.
    for (const width of [390, 600, 768, 900, 1024]) {
      const p = await openFloors("normal", { appearance, width, height: width < 768 ? 844 : 1024, touch: true, hash: "view=present" })
      const m = await p.evaluate(() => {
        const sec = document.querySelector('section[aria-label="Narration"]')
        const text = sec.querySelector('[aria-live="polite"]')
        const ctl = sec.querySelector('[aria-label="Walkthrough controls"]')
        const a = text.getBoundingClientRect()
        const b = ctl.getBoundingClientRect()
        const box = sec.getBoundingClientRect()
        const overlap = a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1
        const spill = [...sec.querySelectorAll("*")].filter((e) => e.getClientRects().length && (e.getBoundingClientRect().right > box.right + 1 || e.getBoundingClientRect().left < box.left - 1)).length
        return { overlap, spill, words: text.scrollWidth > text.clientWidth + 1, buttons: ctl.querySelectorAll("button").length, columns: getComputedStyle(text.parentElement).gridTemplateColumns.split(" ").length }
      })
      // A phone (under 768 px) keeps one column.
      if (m.overlap || m.spill || m.words || !m.buttons || (width < 768 && m.columns !== 1)) bad.push(`${appearance} Present@${width}: ${JSON.stringify(m)}`)
      await p.closeAll()
    }
    // 2. Top bar at 768 with the panel open, a status and an Edited badge: nothing overlaps, every action is on screen.
    {
      const p = await openFloors("normal", { appearance, width: 768, height: 1024, touch: true, hash: `view=inspect&scenario=${CARD}&title=${encodeURIComponent("Edited in the link")}` })
      await wait(800)
      const m = await p.evaluate(() => {
        const h = document.querySelector("header")
        const hr = h.getBoundingClientRect()
        const parts = [...h.children].filter((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0).map((e) => ({ n: e.tagName === "NAV" ? "breadcrumb" : e.getAttribute("aria-live") ? "status" : e.matches("button") ? "button" : e.className.includes("ml-auto") ? "actions" : "badge", r: e.getBoundingClientRect().toJSON() }))
        const overlaps = []
        for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (parts[i].r.right > parts[j].r.left + 1) overlaps.push(`${parts[i].n}/${parts[j].n}`)
        const off = [...h.querySelectorAll("button")].filter((b) => window.__floors.shown(b)).filter((b) => { const r = b.getBoundingClientRect(); return r.left < hr.left - 1 || r.right > Math.min(hr.right, innerWidth) + 1 }).map((b) => window.__floors.name(b))
        const crumb = h.querySelector("nav")
        return { overlaps, off, truncated: crumb.scrollWidth > crumb.clientWidth + 1 || [...crumb.querySelectorAll(".truncate")].some((e) => e.scrollWidth > e.clientWidth + 1), status: h.querySelector("[aria-live]")?.innerText.replace(/\s+/g, " ") }
      })
      if (m.overlaps.length || m.off.length || !/Ready/.test(m.status)) bad.push(`${appearance} top bar@768: ${JSON.stringify(m)}`)
      if (appearance === "light") notes.push(`top bar at 768: status "${m.status}", breadcrumb ${m.truncated ? "truncated" : "whole"}`)
      await p.closeAll()
    }
    // 3. The dock (and the phone's control strip) on Inspect and Responsive: every control on screen and inside the dock.
    for (const [width, view] of [[768, "inspect"], [768, "responsive"], [390, "inspect"], [390, "responsive"]]) {
      const p = await openFloors("normal", { appearance, width, height: width < 768 ? 844 : 1024, touch: true, hash: `view=${view}&scenario=tasks.list${view === "responsive" ? "&layout=task-sizes" : ""}` })
      await wait(800)
      const m = await p.evaluate(() => {
        const t = document.querySelector('[role="toolbar"][aria-label="Preview controls"]')
        const tr = t.getBoundingClientRect()
        const vp = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
        const names = [...t.querySelectorAll("button")].filter((b) => b.getClientRects().length).map((b) => {
          const r = b.getBoundingClientRect()
          const onScreen = r.left >= -1 && r.right <= vp.right + 1 && r.top >= -1 && r.bottom <= vp.bottom + 1 && r.left >= tr.left - 1 && r.right <= tr.right + 1 && r.top >= tr.top - 1 && r.bottom <= tr.bottom + 1
          return { n: window.__floors.name(b), onScreen }
        })
        return { off: names.filter((x) => !x.onScreen).map((x) => x.n), names: names.map((x) => x.n), scrolls: t.scrollWidth > t.clientWidth + 1 }
      })
      const zoom = m.names.some((n) => /^Zoom/.test(n))
      const role = m.names.some((n) => /^Role/.test(n))
      const reset = view === "responsive" || m.names.some((n) => /Reset preview/.test(n))
      if (m.off.length || m.scrolls || !zoom || !role || !reset) bad.push(`${appearance} dock ${view}@${width}: off ${JSON.stringify(m.off)}, scrolls ${m.scrolls}, zoom ${zoom}, Role lens ${role}, reset ${reset}`)
      if (appearance === "light" && view === "inspect") notes.push(`dock at ${width}: ${m.names.length} controls on screen`)
      await p.closeAll()
    }
    // 4. Tokens: every value is shown in full and the stage (its toggles and preview) is on screen.
    for (const width of [768, 390]) {
      const p = await openFloors("normal", { appearance, width, height: width < 768 ? 844 : 1024, touch: true, hash: "view=tokens" })
      await wait(800)
      const m = await p.evaluate(() => {
        const cut = [...document.querySelectorAll('[role="treegrid"] [role="row"] > [role="gridcell"]:not(:first-child) code')].filter((c) => c.getClientRects().length && (c.scrollWidth > c.clientWidth + 1 || c.scrollHeight > c.clientHeight + 1)).map((c) => c.textContent)
        const values = document.querySelectorAll('[role="treegrid"] [role="row"] > [role="gridcell"]:not(:first-child) code').length
        const vp = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
        const toggles = [...document.querySelectorAll('[aria-label="Preview theme"] button, [aria-label="Values"] button')].filter((b) => b.getClientRects().length)
        const offToggles = toggles.filter((b) => !((r) => r.left >= -1 && r.right <= vp.right + 1 && r.top >= -1 && r.bottom <= vp.bottom + 1)(b.getBoundingClientRect())).map((b) => b.textContent)
        const f = document.querySelector('[aria-label="Token preview"]')?.closest(".preview-frame")?.getBoundingClientRect()
        return { values, cut, toggles: toggles.length, offToggles, frame: f ? { left: Math.round(f.left), right: Math.round(f.right), width: Math.round(f.width) } : null, page: document.documentElement.scrollWidth - innerWidth }
      })
      const frameOk = m.frame && m.frame.left >= -1 && m.frame.right <= width + 1 && m.frame.width >= 60
      if (!m.values || m.cut.length || m.toggles < 3 || m.offToggles.length || !frameOk || m.page > 0) bad.push(`${appearance} tokens@${width}: ${JSON.stringify(m)}`)
      if (appearance === "light") notes.push(`Tokens at ${width}: ${m.values} values in full, stage frame ${m.frame?.width} px wide`)
      await p.closeAll()
    }
    // 8. The bottom bar: each label stays inside its entry; at 390 and 430 it is shown in full (with and without a workspace).
    for (const [name, width] of [["workspace", 360], ["workspace", 390], ["workspace", 430], ["normal", 390]]) {
      const p = await openFloors(name, { appearance, width, height: 844, touch: true, hash: "view=inspect&scenario=tasks.list" })
      const m = await p.evaluate(() =>
        [...document.querySelectorAll('nav[aria-label="Views"] > button')].map((b) => {
          // The label's own box: a truncated label is clipped to it.
          const label = b.querySelector("span") ?? b
          const t = label.getBoundingClientRect()
          const c = b.getBoundingClientRect()
          return { n: b.textContent, within: t.left >= c.left - 0.5 && t.right <= c.right + 0.5, whole: label.scrollWidth <= label.clientWidth + 1, w: Math.round(c.width), h: Math.round(c.height) }
        })
      )
      const out = m.filter((x) => !x.within || x.w < 44 || x.h < 44 || (width >= 390 && !x.whole))
      if (out.length || !m.length) bad.push(`${appearance} ${name} bottom bar@${width}: ${JSON.stringify(out)}`)
      if (appearance === "light" && name === "workspace" && width === 390) notes.push(`bottom bar at 390 with a workspace: ${m.map((x) => `${x.n} ${x.w}`).join(", ")}`)
      await p.closeAll()
    }
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.slice(0, 8).join("; ") : `light and dark, touch: Present at 390, 600, 768, 900 and 1024 keeps narration and controls apart with nothing spilling; ${notes.join("; ")}; every label fits its entry at 360, 390 and 430`]
})

// AC-63 Coarse pointers at any width: every Studio target is at least 44 px and text fields use 16 px text (768 and 390, both appearances)
await check("AC-63", async () => {
  const measure = (p) =>
    p.evaluate(() => {
      const f = window.__floors
      const targets = [...document.querySelectorAll('button, a[href], summary, select, textarea, input:not([type="hidden"]), [role="button"], [role="tab"], [role="treeitem"], [role="option"], [role^="menuitem"], [role="combobox"], [role="switch"], [role="checkbox"], [role="radio"]')].filter((e) => f.shown(e) && !e.closest(".react-flow__viewport") && !e.matches('[data-sidebar="rail"]'))
      const small = targets.map((e) => ({ n: f.name(e), ...f.hit(e) })).filter((m) => m.w < 44 || m.h < 44)
      const text = targets.filter((e) => e.matches('textarea, select, input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"])')).map((e) => ({ n: f.name(e), px: parseFloat(getComputedStyle(e).fontSize) })).filter((m) => m.px < 16)
      return { count: targets.length, small: small.map((m) => `${m.n} ${m.w}×${m.h}`), text: text.map((m) => `${m.n} ${m.px}px`) }
    })
  const bad = []
  let measured = 0
  let states = 0
  for (const appearance of ["light", "dark"]) {
    // A tablet: every view with its panel, Details on Inspect, and an open dock menu.
    for (const hash of ["view=inspect&scenario=tasks.list", "view=compare", "view=responsive&scenario=tasks.list&layout=task-sizes", "view=gallery", "view=present", "view=design", "view=tokens", "view=inspect&scenario=components.task-card&details"]) {
      const p = await openFloors("normal", { appearance, width: 768, height: 1024, touch: true, hash: hash.replace("&details", "") })
      if (hash.endsWith("&details")) {
        await p.getByRole("button", { name: "Toggle details" }).click()
        await wait(800)
      }
      const m = await measure(p)
      measured += m.count
      states++
      if (m.small.length || m.text.length) bad.push(`${appearance} 768 ${hash}: under 44 px ${m.small.slice(0, 6).join(", ")}${m.text.length ? `; text ${m.text.slice(0, 4).join(", ")}` : ""}`)
      if (hash.startsWith("view=inspect&scenario=tasks.list")) {
        await p.getByRole("button", { name: /^Size,/ }).click()
        await wait(500)
        const menu = await measure(p)
        measured += menu.count
        states++
        if (menu.small.length) bad.push(`${appearance} 768 size menu: ${menu.small.slice(0, 6).join(", ")}`)
        await p.keyboard.press("Escape")
        await wait(300)
        // The folded top bar's actions and Studio settings.
        if (await p.getByRole("button", { name: "More actions" }).count()) {
          await p.getByRole("button", { name: "More actions" }).click()
          await wait(500)
        }
        await p.getByRole("button", { name: "Studio settings" }).click()
        await wait(600)
        const settings = await measure(p)
        measured += settings.count
        states++
        if (settings.small.length || settings.text.length) bad.push(`${appearance} 768 Studio settings: ${settings.small.slice(0, 6).join(", ")}${settings.text.length ? `; text ${settings.text.slice(0, 4).join(", ")}` : ""}`)
      }
      await p.closeAll()
    }
    // A phone: every view, and the Panel and Details drawers.
    for (const hash of ["view=inspect&scenario=tasks.list", "view=compare", "view=responsive&scenario=tasks.list&layout=task-sizes", "view=gallery", "view=present", "view=design", "view=tokens", "drawer=Panel", "drawer=Details"]) {
      const drawer = hash.startsWith("drawer=") ? hash.slice(7) : null
      const p = await openFloors("normal", { appearance, width: 390, height: 844, touch: true, hash: drawer ? `view=inspect&scenario=${CARD}` : hash })
      if (drawer) {
        await p.getByRole("button", { name: drawer, exact: true }).click()
        await wait(800)
      }
      const m = await measure(p)
      measured += m.count
      states++
      if (m.small.length || m.text.length) bad.push(`${appearance} 390 ${hash}: under 44 px ${m.small.slice(0, 6).join(", ")}${m.text.length ? `; text ${m.text.slice(0, 4).join(", ")}` : ""}`)
      await p.closeAll()
    }
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.slice(0, 8).join("; ") : `${states} states on a 768 px tablet and a 390 px phone with touch, light and dark (every view with its panel, Details, the Size menu, the Panel and Details drawers): ${measured} targets, every one at least 44 px (a switch, checkbox or radio by its hit area) and every text field at 16 px. Real devices are not covered.`]
})

// AC-64 Keyboard focus in the core shell (rail, top bar, panel, dock; on a phone the top bar, control strip, bottom bar and drawers)
// adds exactly one indicator at 3:1 or more, and the active view label reaches 4.5:1, in both appearances and with a pale brand color
await check("AC-64", async () => {
  const bad = []
  const notes = []
  // Every ring utility leaves a computed box-shadow even unfocused: record each element unfocused, then count only what focus adds.
  const record = (p) =>
    p.evaluate(() => {
      const before = new WeakMap()
      for (const e of document.querySelectorAll("body *")) {
        const s = getComputedStyle(e)
        before.set(e, { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`, shadow: s.boxShadow })
      }
      window.__unfocused = before
    })
  const walk = async (p, stops, regions, faint, doubled) => {
    for (let i = 0; i < stops; i++) {
      await p.keyboard.press("Tab")
      // Controls transition their ring in: read once the running transitions end.
      await p.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        await Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => null)))
      })
      const f = await p.evaluate(() => {
        const e = document.activeElement
        if (!e || e === document.body || e.tagName === "IFRAME") return null
        const region = e.closest('[role="dialog"]') ? "drawer" : e.closest('[aria-label="Studio"]') ? "rail" : e.closest("header") ? "header" : e.closest('[role="toolbar"]') ? "dock" : e.closest('nav[aria-label="Views"]') ? "bar" : e.closest('[data-sidebar="sidebar"]') ? "panel" : null
        if (!region || e.matches("input, textarea, select")) return null
        const F = window.__floors
        const s = getComputedStyle(e)
        const was = window.__unfocused.get(e) ?? { outline: "none", shadow: "none" }
        const split = (v) => (v === "none" ? [] : v.split(/,(?![^(]*\))/).map((x) => x.trim()))
        const marks = []
        if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 1 && `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` !== was.outline && F.paint([s.outlineColor])[3] > 0) marks.push({ color: s.outlineColor, inside: parseFloat(s.outlineOffset) < 0, width: parseFloat(s.outlineWidth) })
        for (const layer of split(s.boxShadow)) {
          if (split(was.shadow).includes(layer)) continue
          const color = /^(rgba?|oklch|oklab|lab|lch|color|hsla?)\([^)]*\)/.exec(layer)?.[0]
          const lengths = layer.replace(color ?? "", "").match(/-?[\d.]+px/g)?.map(parseFloat) ?? []
          const width = Math.max(lengths[3] ?? 0, lengths[2] ?? 0)
          if (color && F.paint([color])[3] > 0 && width > 0) marks.push({ color, inside: /\binset\b/.test(layer), width })
        }
        const strong = marks.filter((m) => m.width >= 2).map((m) => F.on(m.color, m.inside ? e : e.parentElement))
        return { region, n: F.name(e), ratio: Math.max(0, ...strong), marks: marks.length }
      })
      if (!f) continue
      regions[f.region]?.push(f.ratio)
      if (f.ratio < 3) faint.push(`${f.region} "${f.n}" ${f.ratio.toFixed(2)}`)
      if (f.marks > 1) doubled.push(`${f.region} "${f.n}"`)
    }
  }
  const runs = []
  for (const appearance of ["light", "dark"]) for (const width of [1440, 768, 390]) runs.push({ appearance, width })
  // A pale brand color: the light ring and the active rail label are lowered from it.
  for (const width of [1440, 768]) runs.push({ appearance: "light", width, brand: "#fde68a" })
  for (const { appearance, width, brand } of runs) {
    const phone = width < 768
    const p = await openFloors("normal", { appearance, width, height: width === 1440 ? 900 : phone ? 844 : 1024, touch: width < 1440, hash: "view=inspect&scenario=tasks.list", brand })
    const label = `${appearance}${brand ? ` brand ${brand}` : ""} ${width}`
    await p.mouse.move(0, 0)
    await record(p)
    const active = await p.evaluate((phone) => {
      const b = phone ? document.querySelector('nav[aria-label="Views"] button[aria-current="page"]') : document.querySelector('[aria-label="Studio"] nav[aria-label="Views"] button[aria-pressed="true"]')
      const text = b.querySelector("span") ?? b
      return { text: text.textContent, ratio: window.__floors.on(getComputedStyle(text).color, b), size: parseFloat(getComputedStyle(text).fontSize) }
    }, phone)
    if (active.ratio < 4.5) bad.push(`${label}: active view label "${active.text}" ${active.ratio.toFixed(2)}:1`)
    const regions = phone ? { header: [], dock: [], bar: [], drawer: [] } : { rail: [], header: [], panel: [], dock: [] }
    const faint = []
    const doubled = []
    await walk(p, phone ? 40 : 70, regions, faint, doubled)
    if (phone) {
      // The Panel and Details drawers.
      for (const name of ["Panel", "Details"]) {
        await p.getByRole("button", { name, exact: true }).click()
        await wait(800)
        await record(p)
        await walk(p, 12, regions, faint, doubled)
        await p.keyboard.press("Escape")
        await wait(600)
      }
    }
    const missing = Object.entries(regions).filter(([, r]) => !r.length).map(([k]) => k)
    if (faint.length || missing.length || doubled.length) bad.push(`${label}:${faint.length ? ` under 3:1 ${faint.slice(0, 6).join(", ")}` : ""}${doubled.length ? ` two indicators on ${doubled.slice(0, 6).join(", ")}` : ""}${missing.length ? ` not reached ${missing.join(", ")}` : ""}`)
    const low = Object.entries(regions).filter(([, r]) => r.length).map(([k, r]) => `${k} ${Math.min(...r).toFixed(1)}`)
    notes.push(`${label}: active label ${active.ratio.toFixed(1)}:1 at ${active.size} px, lowest indicator ${low.join(", ")}`)
    await p.closeAll()
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : `${notes.join("; ")} (Tab walks; an indicator counts only where focus adds it, and every stop has exactly one)`]
})

/**
 * Probes a target's effective hit area with elementFromPoint: from the target's centre (or, when a neighbour covers the centre,
 * from the reachable point nearest it) outward along each axis at 1 px, refined to 0.25 px. A hit counts on the target itself,
 * its hit extension (::after hit-tests as the element), an associated label, or for a slider thumb its slider.
 */
const probeHelpers = () => {
  const own = (el, h) => {
    if (!h) return false
    if (h === el || el.contains(h)) return true
    const slider = el.closest('[data-slot="slider"]')
    if (slider?.contains(h)) return true
    const label = h.closest("label")
    if (!label) return false
    const c = label.control
    return label.contains(el) || (!!label.htmlFor && label.htmlFor === el.id) || c === el || (!!c && (el.contains(c) || c.previousElementSibling === el))
  }
  const at = (el, x, y) => own(el, document.elementFromPoint(x, y))
  const reach = (el, x, y, dx, dy) => {
    let d = 0
    while (d < 240 && at(el, x + dx * (d + 1), y + dy * (d + 1))) d++
    for (const s of [0.5, 0.25]) if (at(el, x + dx * (d + s), y + dy * (d + s))) d += s
    return d
  }
  // The box the target and its hit extension claim, clipped to nothing: the probe decides what is reachable.
  const claim = (el) => {
    const r = el.getBoundingClientRect()
    const a = getComputedStyle(el, "::after")
    if (a.content === "none" || a.position !== "absolute") return r
    const [t, rt, b, l] = [a.top, a.right, a.bottom, a.left].map((v) => parseFloat(v) || 0)
    return new DOMRect(Math.min(r.left, r.left + l), Math.min(r.top, r.top + t), Math.max(r.width, r.width - l - rt), Math.max(r.height, r.height - t - b))
  }
  // A target whose box, or whose 44 px area along a scrolling axis, is scrolled partly out of view is not at rest: a scroll
  // brings it in first. An ancestor that clips without scrolling still counts against the area.
  const atRest = (el) => {
    const r = el.getBoundingClientRect()
    if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) return false
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const area = { left: Math.min(r.left, cx - 22), right: Math.max(r.right, cx + 22), top: Math.min(r.top, cy - 22), bottom: Math.max(r.bottom, cy + 22) }
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (s.overflowX === "visible" && s.overflowY === "visible") continue
      const c = a.getBoundingClientRect()
      const x = /auto|scroll/.test(s.overflowX) && a.scrollWidth > a.clientWidth ? area : r
      const y = /auto|scroll/.test(s.overflowY) && a.scrollHeight > a.clientHeight ? area : r
      if (x.left < c.left - 0.5 || x.right > c.right + 0.5 || y.top < c.top - 0.5 || y.bottom > c.bottom + 0.5) return false
    }
    return true
  }
  const probe = (el) => {
    const r = el.getBoundingClientRect()
    let x = r.left + r.width / 2
    let y = r.top + r.height / 2
    let covered = false
    if (!at(el, x, y)) {
      covered = true
      const c = claim(el)
      let best = null
      for (let px = c.left + 1; px < c.right; px += 2) for (let py = c.top + 1; py < c.bottom; py += 2) {
        if (!at(el, px, py)) continue
        const d = (px - x) ** 2 + (py - y) ** 2
        if (!best || d < best.d) best = { px, py, d }
      }
      if (!best) return { w: 0, h: 0, covered }
      ;({ px: x, py: y } = best)
    }
    return { w: reach(el, x, y, -1, 0) + reach(el, x, y, 1, 0), h: reach(el, x, y, 0, -1) + reach(el, x, y, 0, 1), covered }
  }
  window.__probe = { own, probe, atRest }
}

// AC-65 Coarse pointers: every Studio target keeps its own 44 by 44 px where a finger lands, measured by elementFromPoint probing,
// so stacked switches, checkboxes and row buttons never share or lose their hit area (390, 768 and 1440 px, both appearances)
await check("AC-65", async () => {
  const measure = (p) =>
    p.evaluate(() => {
      const f = window.__floors
      const P = window.__probe
      const all = [...document.querySelectorAll('button, a[href], summary, select, textarea, input:not([type="hidden"]), [role="button"], [role="tab"], [role="treeitem"], [role="option"], [role^="menuitem"], [role="combobox"], [role="switch"], [role="checkbox"], [role="radio"]')].filter((e) => f.shown(e) && !e.closest(".react-flow__viewport") && !e.matches('[data-sidebar="rail"]'))
      // A slider's range input is its thumb; a switch or checkbox's hidden native input is not a target of its own.
      const targets = [...new Set(all.map((e) => (e.matches('input[type="range"]') && e.closest('[data-slot="slider-thumb"]')) || e))].filter((e) => !(e.matches('input[type="checkbox"], input[type="radio"]') && getComputedStyle(e).opacity === "0" && e.previousElementSibling?.matches('[role="switch"], [role="checkbox"], [role="radio"]')))
      // A disabled control takes no pointer, so it is not a target until it is enabled.
      // While a drawer or dialog is open, only its own controls are targets.
      const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter((d) => f.shown(d))
      const live = targets.filter((e) => (!dialogs.length || dialogs.some((d) => d.contains(e))) && !e.disabled && e.getAttribute("aria-disabled") !== "true" && !e.hasAttribute("data-disabled") && getComputedStyle(e).pointerEvents !== "none")
      const rest = live.filter((e) => P.atRest(e))
      // A switch or checkbox is named by its label, a slider thumb by its input.
      const named = (e) => e.getAttribute("aria-label") || e.querySelector("input[aria-label]")?.getAttribute("aria-label") || e.closest("label")?.textContent.trim() || (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent.trim()) || (e.nextElementSibling?.id && document.querySelector(`label[for="${CSS.escape(e.nextElementSibling.id)}"]`)?.textContent.trim()) || f.name(e)
      const rows = rest.map((e) => ({ n: named(e).replace(/\s+/g, " ").slice(0, 24), role: e.getAttribute("role") ?? e.tagName.toLowerCase(), ...P.probe(e) }))
      // 1 px for the probe: hit testing with touch emulation lands up to a pixel short of a box's edge.
      const small = rows.filter((m) => m.w < 43 || m.h < 43).map((m) => `${m.n} ${m.w}×${m.h}${m.covered ? " (centre covered)" : ""}`)
      return { count: rows.length, skipped: live.length - rest.length, small, named: rows.map((m) => `${m.role}:${m.n}`) }
    })
  const openProbe = async (o) => {
    const p = await openFloors("normal", o)
    await p.evaluate(probeHelpers)
    return p
  }
  // The stacked controls the shell draws must be among the targets measured, so a layout change cannot skip them.
  const required = {
    gallery: [/^checkbox:/, /^switch:/],
    present: [/^switch:/],
    responsive: [/^switch:/, /^button:Remove /],
  }
  const bad = []
  const missed = []
  let measured = 0
  let states = 0
  let skipped = 0
  const run = async (label, p, view) => {
    const m = await measure(p)
    measured += m.count
    skipped += m.skipped
    states++
    if (m.small.length) bad.push(`${label}: ${m.small.slice(0, 6).join(", ")}`)
    for (const re of required[view] ?? []) if (!m.named.some((n) => re.test(n))) missed.push(`${label} ${re.source}`)
  }
  for (const appearance of ["light", "dark"]) {
    for (const [width, height] of [[1440, 900], [768, 1024]]) {
      for (const view of ["inspect", "compare", "responsive", "gallery", "present", "design", "tokens"]) {
        const p = await openProbe({ appearance, width, height, touch: true, hash: `view=${view}&scenario=tasks.list${view === "responsive" ? "&layout=task-sizes" : ""}` })
        await p.mouse.move(0, 0)
        await run(`${appearance} ${width} ${view}`, p, view)
        await p.closeAll()
      }
    }
    // A phone: the Panel drawer of each view and the Details drawer.
    for (const view of ["inspect", "responsive", "gallery", "present", "design", "details"]) {
      const p = await openProbe({ appearance, width: 390, height: 844, touch: true, hash: view === "details" ? `view=inspect&scenario=${CARD}` : `view=${view}&scenario=tasks.list${view === "responsive" ? "&layout=task-sizes" : ""}` })
      await run(`${appearance} 390 ${view}`, p, "none")
      await p.getByRole("button", { name: view === "details" ? "Details" : "Panel", exact: true }).click()
      await wait(800)
      await run(`${appearance} 390 ${view} drawer`, p, view)
      await p.closeAll()
    }
  }
  const ok = !bad.length && !missed.length
  return [ok ? "pass" : "fail", ok ? `${states} states at 1440 and 768 px with touch and in the 390 px phone drawers, light and dark: ${measured} targets probed with elementFromPoint (${skipped} scrolled partly out of view were left for a scroll), each with its own area of at least 44 by 44 px; the Gallery area checkboxes and switch, Present's Autoplay, the Responsive Sync switches and each frame's Remove button were among them. The panel edge handle and resize grips are excluded (their 44 px equivalents are the top bar's panel toggle and the Size menu or width list).` : `${bad.slice(0, 12).join("; ")}${missed.length ? `; not measured ${missed.slice(0, 6).join(", ")}` : ""}`]
})

// AC-66 Keyboard focus is drawn whole: at every stop in the rail, top bar, panel, dock and the phone's bars and drawers, the
// rendered pixels whose own change between unfocused and focused reaches 3:1 cover at least the perimeter of the part in view (a
// 1 px ring all the way round), so no clipping ancestor or viewport edge can cut the indicator to its corners (1440, 768 and 390 px, both appearances)
await check("AC-66", async () => {
  const bad = []
  const notes = []
  const settle = (p) =>
    p.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => null)))
    })
  // Pixels whose change between two screenshots of the same box reaches 3:1.
  const changed = (p, a, b) =>
    p.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${src}` })
      const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data }
      const [da, db] = (await Promise.all([load(a), load(b)])).map(px)
      let n = 0
      for (let i = 0; i < da.length; i += 4) if (window.__floors.ratio([da[i], da[i + 1], da[i + 2]], [db[i], db[i + 1], db[i + 2]]) >= 3) n++
      return n
    }, [a, b])
  const walk = async (p, n, found) => {
    for (let i = 0; i < n; i++) {
      await p.keyboard.press("Tab")
      await settle(p)
      const f = await p.evaluate(() => {
        const a = document.activeElement
        // A slider's focus sits on its range input inside the thumb, so the thumb is what draws the indicator. Text fields
        // and selects keep their focus border and are not measured here.
        const range = !!a?.matches('input[type="range"]')
        if (!a || a === document.body || a.tagName === "IFRAME" || (!range && a.matches("input, textarea, select"))) return null
        const e = (range && a.closest('[data-slot="slider-thumb"]')) || a
        const region = e.closest('[role="dialog"]') ? "drawer" : e.closest('[aria-label="Studio"]') ? "rail" : e.closest("header") ? "header" : e.closest('[role="toolbar"]') ? "dock" : e.closest('nav[aria-label="Views"]') ? "bar" : e.closest('[data-sidebar="sidebar"]') ? "panel" : null
        if (!region) return null
        // The part of the control in view: a panel taller than its scroller is measured on what shows.
        const b = e.getBoundingClientRect()
        const v = { l: Math.max(0, b.left), t: Math.max(0, b.top), r: Math.min(innerWidth, b.right), b: Math.min(innerHeight, b.bottom) }
        for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
          const st = getComputedStyle(a)
          const c = a.getBoundingClientRect()
          if (st.overflowX !== "visible") ((v.l = Math.max(v.l, c.left)), (v.r = Math.min(v.r, c.right)))
          if (st.overflowY !== "visible") ((v.t = Math.max(v.t, c.top)), (v.b = Math.min(v.b, c.bottom)))
        }
        return { region, n: range ? a.getAttribute("aria-label") ?? "slider" : window.__floors.name(e), range, crumb: !!e.closest('[data-slot="breadcrumb"]'), visible: a.matches(":focus-visible"), r: { x: v.l, y: v.t, w: v.r - v.l, h: v.b - v.t } }
      })
      if (!f || f.r.w < 2 || f.r.h < 2) continue
      const x = Math.max(0, Math.floor(f.r.x) - 6)
      const y = Math.max(0, Math.floor(f.r.y) - 6)
      const clip = { x, y, width: Math.min(p.viewportSize().width, Math.ceil(f.r.x + f.r.w) + 6) - x, height: Math.min(p.viewportSize().height, Math.ceil(f.r.y + f.r.h) + 6) - y }
      const after = (await p.screenshot({ clip })).toString("base64")
      // Blurring keeps the sequential focus starting point, so the next Tab moves on from here.
      await p.evaluate(() => document.activeElement?.blur())
      await settle(p)
      const before = (await p.screenshot({ clip })).toString("base64")
      const count = await changed(p, before, after)
      found.push({ ...f, count, perimeter: Math.round(2 * (f.r.w + f.r.h)) })
    }
  }
  for (const appearance of ["light", "dark"]) {
    for (const width of [1440, 768, 390]) {
      const phone = width < 768
      const p = await openFloors("normal", { appearance, width, height: width === 1440 ? 900 : phone ? 844 : 1024, touch: width < 1440, hash: "view=inspect&scenario=tasks.list" })
      // Tooltips open on focus; hide them so only the indicator is compared.
      await p.addStyleTag({ content: '[data-slot="tooltip-content"], [role="tooltip"] { visibility: hidden !important; }' })
      await p.mouse.move(0, 0)
      const found = []
      await walk(p, phone ? 40 : 70, found)
      if (phone) {
        for (const name of ["Panel", "Details"]) {
          await p.getByRole("button", { name, exact: true }).click()
          await wait(800)
          await walk(p, 12, found)
          await p.keyboard.press("Escape")
          await wait(600)
        }
      }
      await p.closeAll()
      // Design: the panel's sliders take keyboard focus on their range inputs.
      const d = await openFloors("normal", { appearance, width, height: width === 1440 ? 900 : phone ? 844 : 1024, touch: width < 1440, hash: "view=design&scenario=tasks.list" })
      await d.addStyleTag({ content: '[data-slot="tooltip-content"], [role="tooltip"] { visibility: hidden !important; }' })
      await d.mouse.move(0, 0)
      if (phone) {
        await d.getByRole("button", { name: "Panel", exact: true }).click()
        await wait(800)
      }
      const before = found.length
      await walk(d, phone ? 30 : 60, found)
      const sliders = found.slice(before).filter((f) => f.range)
      await d.closeAll()
      const label = `${appearance} ${width}`
      if (!sliders.length) bad.push(`${label}: no Design slider was reached`)
      const short = found.filter((f) => !f.visible || f.count < f.perimeter)
      const crumb = found.find((f) => f.crumb)
      const regions = phone ? ["header", "dock", "bar", "drawer"] : ["rail", "header", "panel", "dock"]
      const missing = regions.filter((r) => !found.some((f) => f.region === r))
      if (short.length || !crumb || missing.length) bad.push(`${label}:${short.length ? ` under the perimeter ${short.slice(0, 6).map((f) => `${f.region} "${f.n}" ${f.count}/${f.perimeter} px${f.visible ? "" : " (not focus-visible)"}`).join(", ")}` : ""}${crumb ? "" : " the scenario trigger was not reached"}${missing.length ? ` not reached ${missing.join(", ")}` : ""}`)
      const low = Math.min(...found.map((f) => f.count / f.perimeter))
      notes.push(`${label}: ${found.length} stops, lowest ${low.toFixed(2)}× perimeter, scenario trigger ${crumb ? `${crumb.count} px for a ${crumb.perimeter} px perimeter` : "not reached"}, Design sliders ${sliders.map((f) => `${f.n} ${(f.count / f.perimeter).toFixed(2)}×`).join(", ") || "none"}`)
    }
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : `${notes.join("; ")}. Screenshots of each stop focused and unfocused, tooltips hidden; a stop passes when the pixels changed by 3:1 or more cover at least its perimeter.`]
})

/** Every visible text run in the Studio document (product frames are their own documents) against its painted ground. */
const textFloor = (p) =>
  p.evaluate(() => {
    const F = window.__floors
    const low = []
    let n = 0
    for (const el of document.querySelectorAll("body *")) {
      if (!el.getClientRects().length || ![...el.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim())) continue
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue
      const st = getComputedStyle(el)
      if (st.visibility === "hidden" || el.closest("[inert], [aria-hidden='true'], :disabled, [aria-disabled='true'], [data-disabled]")) continue
      // Text faded out by an ancestor is on its way in or out, not at rest.
      let op = 1
      for (let a = el; a; a = a.parentElement) op *= parseFloat(getComputedStyle(a).opacity)
      if (op < 0.99) continue
      const size = parseFloat(st.fontSize)
      const need = size >= 24 || (size >= 18.66 && Number(st.fontWeight) >= 700) ? 3 : 4.5
      const q = F.on(st.color, el)
      n++
      if (q < need) low.push(`"${el.textContent.trim().slice(0, 28)}" ${q.toFixed(2)}`)
    }
    return { n, low }
  })
const settleFrames = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const until = async (read, test, ms = 8000) => {
  const end = Date.now() + ms
  let value = await read()
  while (!test(value) && Date.now() < end) {
    await wait(150)
    value = await read()
  }
  return value
}

// AC-67 Present's anchor highlight and its label: the label reaches 4.5:1 in both appearances and with a pale brand color,
// stays whole inside the frame and the visible stage at 390, 768 and 1440 px for every anchored step, and in forced colors
// the highlight is drawn in system colors (box shadows are dropped there) and the label keeps a 4.5:1 system-color pair.
await check("AC-67", async () => {
  const bad = []
  const notes = []
  const label = (p) =>
    p.evaluate(() => {
      const l = document.querySelector(".anchor-label") ?? document.querySelector(".anchor-ring span")
      const ring = document.querySelector(".anchor-ring")
      if (!l || !ring || !window.__floors.shown(l)) return null
      const frame = l.closest(".preview-frame").getBoundingClientRect()
      const r = l.getBoundingClientRect()
      // The visible stage: the frame, inside every clipping ancestor, inside the viewport.
      const v = { l: Math.max(0, frame.left), t: Math.max(0, frame.top), r: Math.min(innerWidth, frame.right), b: Math.min(innerHeight, frame.bottom) }
      for (let a = l.closest(".preview-frame").parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const st = getComputedStyle(a)
        const c = a.getBoundingClientRect()
        if (st.overflowX !== "visible") ((v.l = Math.max(v.l, c.left)), (v.r = Math.min(v.r, c.right)))
        if (st.overflowY !== "visible") ((v.t = Math.max(v.t, c.top)), (v.b = Math.min(v.b, c.bottom)))
      }
      const out = Math.max(0, v.l - r.left, v.t - r.top, r.right - v.r, r.bottom - v.b)
      // A truncated label is whole only if its full name stays in its text for assistive technology (it takes no pointer, so no tooltip).
      const text = [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("")
      const cut = l.scrollWidth > l.clientWidth + 1
      return { text, ratio: window.__floors.on(getComputedStyle(l).color, l), out: Math.round(out * 100) / 100, cut: cut && (!!l.closest("[aria-hidden='true']") || !l.textContent.includes(text)), truncated: cut, placement: l.dataset.placement }
    })
  // A test-only long name written into the shown label: the label must stay inside the frame, truncating, on either side.
  const LONG = "A deliberately long anchor name that no frame at these sizes can show whole, so the label has to truncate inside it"
  const lengthen = (p) =>
    p.evaluate((long) => {
      const l = document.querySelector(".anchor-label") ?? document.querySelector(".anchor-ring span")
      const t = [...l.childNodes].filter((n) => n.nodeType === 3).pop()
      const was = t.textContent
      t.textContent = long
      return was
    }, LONG)
  const restore = (p, was) =>
    p.evaluate((was) => {
      const l = document.querySelector(".anchor-label") ?? document.querySelector(".anchor-ring span")
      ;[...l.childNodes].filter((n) => n.nodeType === 3).pop().textContent = was
    }, was)
  let lengthened = 0
  let truncatedLong = 0
  const runs = []
  for (const appearance of ["light", "dark"]) for (const width of [1440, 768, 390]) runs.push({ appearance, width })
  for (const appearance of ["light", "dark"]) runs.push({ appearance, width: 768, brand: "#fde68a" })
  let measured = 0
  for (const { appearance, width, brand } of runs) {
    const tag = `${appearance}${brand ? ` brand ${brand}` : ""} ${width}`
    const p = await openFloors("normal", { appearance, width, height: width === 1440 ? 900 : width < 768 ? 844 : 1024, touch: width < 1440, hash: "view=present", brand })
    await p.mouse.move(0, 0)
    const seen = []
    // The example walkthrough anchors its first four steps.
    for (let step = 0; step < 4; step++) {
      if (step) await p.keyboard.press("ArrowRight")
      const m = await until(() => label(p), (x) => !!x && !seen.includes(x.text))
      if (!m || seen.includes(m.text)) {
        bad.push(`${tag} step ${step + 1}: no anchor label shown`)
        continue
      }
      seen.push(m.text)
      measured++
      if (m.ratio < 4.5) bad.push(`${tag} step ${step + 1} "${m.text}": ${m.ratio.toFixed(2)}:1`)
      // The example's names are short: an ordinary step's label shows whole. Only the long name below may truncate.
      if (m.out > 0.5 || m.truncated) bad.push(`${tag} step ${step + 1} "${m.text}": ${m.out > 0.5 ? `${m.out} px outside the visible stage` : ""}${m.truncated ? " truncated" : ""} (${m.placement ?? "above"})`)
      if (step === 0) notes.push(`${tag} "${m.text}" ${m.ratio.toFixed(2)}:1 ${m.placement ?? "above"}`)
      // The first step anchors past the frame's midpoint and the second before it, so both label sides get a long name.
      if (!brand && step < 2) {
        const was = await lengthen(p)
        await settleFrames(p)
        const long = await label(p)
        await restore(p, was)
        lengthened++
        if (!long || long.out > 0.5 || long.cut) bad.push(`${tag} step ${step + 1} long name: ${!long ? "not shown" : long.out > 0.5 ? `${long.out} px outside the visible stage` : "truncated without its full name in its text"}`)
        else if (long.truncated) truncatedLong++
      }
    }
    // Forced colors, on the first step.
    if (!brand) {
      await p.keyboard.press("Home").catch(() => {})
      for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowLeft")
      await until(() => label(p), (x) => x?.text === seen[0])
      await p.emulateMedia({ forcedColors: "active" })
      await wait(400)
      await settleFrames(p)
      const box = await p.evaluate(() => {
        const ring = document.querySelector(".anchor-ring")
        const r = ring.getBoundingClientRect()
        const f = ring.closest(".preview-frame").getBoundingClientRect()
        const v = { l: Math.max(r.left, f.left, 0), t: Math.max(r.top, f.top, 0), r: Math.min(r.right, f.right, innerWidth), b: Math.min(r.bottom, f.bottom, innerHeight) }
        return { x: v.l, y: v.t, w: v.r - v.l, h: v.b - v.t }
      })
      const clip = { x: Math.max(0, Math.floor(box.x) - 4), y: Math.max(0, Math.floor(box.y) - 4), width: Math.ceil(box.w) + 8, height: Math.ceil(box.h) + 8 }
      const shown = (await p.screenshot({ clip })).toString("base64")
      await p.addStyleTag({ content: ".anchor-ring { visibility: hidden !important; }" })
      await settleFrames(p)
      const hidden = (await p.screenshot({ clip })).toString("base64")
      const count = await p.evaluate(async ([a, b]) => {
        const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${src}` })
        const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data }
        const [da, db] = (await Promise.all([load(a), load(b)])).map(px)
        let n = 0
        for (let i = 0; i < da.length; i += 4) if (window.__floors.ratio([da[i], da[i + 1], da[i + 2]], [db[i], db[i + 1], db[i + 2]]) >= 3) n++
        return n
      }, [shown, hidden])
      const perimeter = Math.round(2 * (box.w + box.h))
      const forced = await label(p)
      if (count < perimeter) bad.push(`${tag} forced colors: the highlight changed ${count} px by 3:1 for a ${perimeter} px perimeter`)
      if (!forced || forced.ratio < 4.5) bad.push(`${tag} forced colors: label ${forced ? `${forced.ratio.toFixed(2)}:1` : "not shown"}`)
      notes.push(`${tag} forced colors ${count}/${perimeter} px`)
    }
    await p.closeAll()
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.slice(0, 10).join("; ") : `${measured} anchored steps (the example walkthrough's four, at 1440, 768 and 390 px, light and dark, and with a pale brand color at 768): every label reached 4.5:1 and sat whole inside its frame and the visible stage; ${lengthened} labels given a test-only long name (one each side of the frame's midpoint) stayed inside the frame, ${truncatedLong} of them truncated with the full name in their text; ${notes.join("; ")}. In forced colors the highlight's pixels changed by 3:1 or more cover at least its perimeter. Real forced-color themes are not covered.`]
})

// AC-68 Present and Compare at 390, 768 and 1440 px (touch below 1440), light and dark: every Compare side header is whole on
// screen inside the stage with its full name and its contents inside it, nothing scrolls sideways, and all Studio text in both
// views reaches AA (4.5:1, or 3:1 at 24 px or 18.66 px bold): Present on an anchored step and on a step that cannot run, Compare
// side by side (2-up and 3-up, and Profile 3-up at Fit below 1440 px), split and flip.
await check("AC-68", async () => {
  const bad = []
  const notes = []
  let texts = 0
  const headers = (p) =>
    p.evaluate(() => {
      const box = document.querySelector("figure figcaption")?.closest(".overflow-auto")
      const v = box?.getBoundingClientRect()
      return {
        scroll: box ? box.scrollWidth - box.clientWidth : 0,
        doc: document.documentElement.scrollWidth - innerWidth,
        caps: [...document.querySelectorAll("figure > figcaption")].filter((c) => !c.closest("[data-frame]")).map((c) => {
          // The header and everything in it: a part that runs past the stage's edge counts.
          const rs = [c, ...c.querySelectorAll("*")].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect())
          const r = { left: Math.min(...rs.map((x) => x.left)), right: Math.max(...rs.map((x) => x.right)), top: Math.min(...rs.map((x) => x.top)) }
          const name = c.querySelector("b")
          const out = Math.max(0, v.left - r.left, r.right - Math.min(v.right, innerWidth), v.top - r.top)
          // Everything in the header's visible box (its pill) stays inside it; visually hidden text is not drawn.
          const pill = [c, ...c.querySelectorAll("*")].filter((e) => e.getClientRects().length && getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)").find((e) => e.contains(name)) ?? c
          const p = pill.getBoundingClientRect()
          const spill = Math.max(0, ...[...pill.querySelectorAll("*")].filter((e) => e.getClientRects().length && getComputedStyle(e).clip === "auto" && getComputedStyle(e).clipPath === "none").map((e) => { const q = e.getBoundingClientRect(); return Math.max(p.left - q.left, q.right - p.right, p.top - q.top, q.bottom - p.bottom) }))
          return { text: c.textContent, out: Math.round(out * 100) / 100, spill: Math.round(spill * 100) / 100, named: !!name && (name.scrollWidth <= name.clientWidth + 1 || name.title === name.textContent) }
        }),
      }
    })
  const headerFault = (h, want, where) => {
    const off = h.caps.filter((x) => x.out > 0.5 || x.spill > 0.5 || !x.named)
    if (h.caps.length < want || off.length || h.scroll > 1 || h.doc > 0) bad.push(`${where}: ${h.caps.length} headers${off.length ? `, cut ${off.map((x) => `"${x.text}" ${x.out > 0.5 ? `${x.out} px off the stage` : ""}${x.spill > 0.5 ? ` contents ${x.spill} px outside the header` : ""}${x.named ? "" : " unnamed"}`).join(", ")}` : ""}${h.scroll > 1 ? `, the stage scrolls ${h.scroll} px sideways` : ""}${h.doc > 0 ? `, the page scrolls ${h.doc} px sideways` : ""}`)
  }
  const sweep = async (p, tag) => {
    const t = await textFloor(p)
    texts += t.n
    if (t.low.length) bad.push(`${tag}: under AA ${t.low.slice(0, 4).join(", ")}`)
  }
  for (const appearance of ["light", "dark"]) {
    for (const width of [1440, 768, 390]) {
      const phone = width < 768
      const opts = { appearance, width, height: width === 1440 ? 900 : phone ? 844 : 1024, touch: width < 1440 }
      const tag = `${appearance} ${width}`
      // Present: the first step (anchored), then the walkthrough's last step, which cannot run and says why.
      const p = await openFloors("normal", { ...opts, hash: "view=present" })
      await p.mouse.move(0, 0)
      await until(() => p.locator(".anchor-label, .anchor-ring span").count(), (n) => n > 0)
      await wait(400)
      await sweep(p, `${tag} Present step 1`)
      await p.keyboard.press("End")
      for (let i = 0; i < 6; i++) await p.keyboard.press("ArrowRight")
      await until(() => p.getByRole("alert").count(), (n) => n > 0)
      await wait(400)
      await sweep(p, `${tag} Present last step`)
      await p.closeAll()
      // Compare.
      const c = await openFloors("normal", { ...opts, hash: "view=compare&scenario=tasks.list" })
      await c.mouse.move(0, 0)
      await until(() => c.getByText("Ready", { exact: true }).count(), (n) => n >= (phone ? 1 : 2))
      await wait(400)
      const modes = []
      if (!phone) {
        for (const count of ["2-up", "3-up"]) {
          const item = c.getByRole("radio", { name: count }).or(c.getByRole("button", { name: count }))
          if (count !== "2-up") {
            // The example's Theme axis has more than two values, so 3-up must be reachable here.
            if (await item.first().isDisabled().catch(() => true)) {
              bad.push(`${tag} Compare ${count}: not available`)
              continue
            }
            await item.first().click()
            await until(() => c.locator("figure > figcaption").count(), (n) => n >= 3)
            await wait(800)
          }
          const h = await headers(c)
          headerFault(h, count === "2-up" ? 2 : 3, `${tag} Compare ${count}`)
          modes.push(`${count} ${h.caps.length} headers`)
          await sweep(c, `${tag} Compare ${count}`)
        }
        const two = c.getByRole("radio", { name: "2-up" }).or(c.getByRole("button", { name: "2-up" }))
        await two.first().click()
        await wait(500)
        await c.getByRole("radio", { name: "Split" }).or(c.getByRole("button", { name: "Split" })).first().click()
        await wait(900)
        const split = await c.evaluate(() => { const s = document.querySelector('[aria-label="Split position"]')?.closest(".overflow-auto"); return s ? s.scrollWidth - s.clientWidth : -1 })
        if (split < 0) bad.push(`${tag} Compare split: the split stage was not found`)
        else if (split > 1) bad.push(`${tag} Compare split: the stage scrolls ${split} px sideways`)
        modes.push("split")
        await sweep(c, `${tag} Compare split`)
      }
      // Profile, 3-up, at Fit: a phone frame scales to a few dozen pixels, and its header must still hold its status and Reset.
      if (width < 1440) {
        await c.getByRole("combobox", { name: "Changing axis" }).click()
        await wait(400)
        const chosen = await c.getByRole("option", { name: "Profile" }).click().then(() => true, () => false)
        await wait(800)
        const three = c.getByRole("radio", { name: "3-up" }).or(c.getByRole("button", { name: "3-up" })).first()
        if (!chosen || (await three.isDisabled().catch(() => true))) bad.push(`${tag} Compare Profile 3-up: not available`)
        else {
          await three.click()
          await until(() => c.locator("figure > figcaption").count(), (n) => n >= 3)
          await until(() => c.getByText("Ready", { exact: true }).count(), (n) => n >= 3)
          await wait(800)
          headerFault(await headers(c), 3, `${tag} Compare Profile 3-up`)
          modes.push("Profile 3-up")
          await sweep(c, `${tag} Compare Profile 3-up`)
        }
        await c.getByRole("combobox", { name: "Changing axis" }).click()
        await wait(400)
        await c.getByRole("option", { name: "Theme" }).click().catch(() => {})
        await c.getByRole("radio", { name: "2-up" }).or(c.getByRole("button", { name: "2-up" })).first().click().catch(() => {})
        await wait(800)
      }
      // Flip (the phone's only mode).
      const flipped = await c.getByRole("radio", { name: "Flip" }).or(c.getByRole("button", { name: "Flip" })).first().click().then(() => true, () => false)
      await wait(900)
      // Flip shows its A and B toggle above the preview.
      if (!flipped || !(await c.getByText(/^A · /).first().isVisible().catch(() => false))) bad.push(`${tag} Compare flip: ${flipped ? "the A and B toggle is not shown" : "Flip could not be chosen"}`)
      const doc = await c.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      if (doc > 0) bad.push(`${tag} Compare flip: the page scrolls ${doc} px sideways`)
      modes.push("flip")
      await sweep(c, `${tag} Compare flip`)
      await c.closeAll()
      notes.push(`${tag}: ${modes.join(", ")}`)
    }
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.slice(0, 10).join("; ") : `${texts} text runs measured in Present (an anchored step, a step that cannot run) and Compare (${notes.join("; ")}): every one reached AA, every side header sat whole inside the stage with its full name and its contents inside it, and nothing scrolled sideways. Product frames are their own documents and are not measured here.`]
})

// ---------- Workspace modules (WS-01 to WS-10, references/workspace.md) ----------

const railModule = (p, name) => p.locator('[aria-label="Studio"] nav[aria-label="Workspace"] button', { hasText: name })
const railView = (p, name) => p.locator('[aria-label="Studio"] nav[aria-label="Views"] button', { hasText: name })
const resources = (p) => p.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name))
const siteName = (p) => p.getByLabel("Site name", { exact: true })
/** Reads until the test passes or the time runs out, and returns the last reading. */
const poll = async (read, test, ms = 5000) => {
  const end = Date.now() + ms
  let value = await read()
  while (!test(value) && Date.now() < end) {
    await wait(100)
    value = await read()
  }
  return value
}
const ops = async (name, body, actor) => {
  const base = servers.workspace.url
  const res = await fetch(`${base}__studio/ops/${name}`, { method: "POST", headers: { "content-type": "application/json", origin: base.replace(/\/$/, ""), "x-studio-operation-kind": name.endsWith(".write") ? "write" : "read", ...(actor ? { "x-example-actor": actor } : {}) }, body: JSON.stringify(body) })
  return res.json()
}
/** Kit controls smaller than 44 px (a switch counts its hit area), and kit inputs under 16 px text. */
const kitTargets = (p) =>
  p.evaluate(() => {
    const kit = [...document.querySelectorAll('[data-kit] button:not([data-inline]), [data-kit] input, [data-kit] [role="combobox"], [data-kit] [role="switch"], [data-kit] [role="option"]')].filter((e) => {
      const r = e.getBoundingClientRect()
      return r.width > 2 && r.height > 2
    })
    const measured = kit.map((e) => {
      const r = e.getBoundingClientRect()
      let w = r.width
      let h = r.height
      if (e.getAttribute("role") === "switch") {
        const a = getComputedStyle(e, "::after")
        h -= (parseFloat(a.top) || 0) + (parseFloat(a.bottom) || 0)
        w -= (parseFloat(a.left) || 0) + (parseFloat(a.right) || 0)
      }
      return { n: e.getAttribute("aria-label") || e.id || e.textContent.trim().slice(0, 16), w: Math.round(w), h: Math.round(h), input: e.tagName === "INPUT", text: parseFloat(getComputedStyle(e).fontSize) }
    })
    return { small: measured.filter((m) => m.w < 44 || m.h < 44), smallText: measured.filter((m) => m.input && m.text < 16), count: measured.length }
  })
/**
 * Walks the Site page of the example through the kit's states and measures each: the page, an unsaved edit (SaveBar with Discard
 * and Save), an open Select, a conflict (Use current value, Save mine again) and the leave dialog. The page is left in the conflict.
 * Returns the measurements by state and `missed`, every state (or closing step) the walk did not reach in time; a measurement taken
 * after a missed step is not of the state it is named for, so callers fail on any miss.
 */
const kitStates = async (p, measure, between = async () => {}) => {
  const measured = { page: await measure() }
  const missed = []
  const reach = async (state, read, test, ms) => {
    if (!test(await poll(read, test, ms))) missed.push(state)
  }
  await siteName(p).fill("Floors")
  await reach("dirty", () => p.getByRole("button", { name: "Save", exact: true }).isVisible().catch(() => false), Boolean)
  measured.dirty = await measure()
  await between("dirty")
  await p.locator('[data-kit] [role="combobox"]').first().click()
  await reach("select", () => p.locator('[data-kit] [role="listbox"] [role="option"]').first().isVisible().catch(() => false), Boolean)
  await wait(300)
  measured.select = await measure()
  await p.keyboard.press("Escape")
  // The select keeps its closed list mounted and hidden, so closing is judged by visibility.
  await reach("select closed", () => p.locator('[data-kit] [role="listbox"]:visible').count(), (n) => n === 0, 2000)
  const current = await ops("site.read", { input: null })
  await ops("site.write", { input: { siteName: "Theirs" }, expectedRevision: current.revision }, "someone else")
  await p.getByRole("button", { name: "Save", exact: true }).click()
  await reach("conflict", () => p.getByRole("button", { name: "Save mine again" }).isVisible().catch(() => false), Boolean)
  measured.conflict = await measure()
  await p.locator('nav[aria-label="Views"] button:visible', { hasText: "Compare" }).first().click()
  await reach("leave", () => p.getByRole("dialog", { name: "Leave without saving?" }).isVisible().catch(() => false), Boolean)
  await wait(300)
  measured.leave = await measure()
  await p.keyboard.press("Escape")
  await reach("leave closed", () => p.getByRole("dialog", { name: "Leave without saving?" }).count(), (n) => n === 0, 2000)
  return { measured, missed }
}

// WS-01 Without a workspace nothing changes: the AC suite, at most 3 KB more initial chunk, no workspace chunk; with one, module code loads only when a module opens
await check("WS-01", async () => {
  const dir = join(root, ".acceptance", "normal", "assets")
  const files = readdirSync(dir)
  const main = files.find((f) => /^studio-.*\.js$/.test(f))
  const gz = gzipSync(readFileSync(join(dir, main))).length
  const growth = gz - STUDIO_CHUNK_BASELINE_GZ
  // A Studio without a declaration is built without the workspace layer: no workspace chunk exists to request.
  const built = files.filter((f) => /^workspace-/.test(f))
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list" })
  for (const name of ["Compare", "Responsive", "Gallery", "Present", "Design", "Inspect"]) {
    await railView(p, name).click()
    await wait(500)
  }
  await p.keyboard.press("ControlOrMeta+k")
  await wait(400)
  await p.keyboard.press("Escape")
  const plain = (await resources(p)).filter((u) => /workspace-/.test(u))
  const railItems = await p.locator('nav[aria-label="Workspace"]').count()
  const errors = [...p.errors]
  await p.closeAll()
  servers.workspace.host = createMockHost()
  const w = await open("workspace", { hash: "view=inspect&scenario=tasks.list" })
  const start = await resources(w)
  const navEarly = start.some((u) => /workspace-nav-/.test(u))
  const pageEarly = start.some((u) => /workspace-page-/.test(u))
  // Reported, not gated: the scripts a Studio with a workspace loads before any interaction, so a core split stays visible.
  const wsDir = join(root, ".acceptance", "workspace", "assets")
  const initial = [...new Set(start.map((u) => new URL(u).pathname).filter((u) => /^\/assets\/[^/]+\.js$/.test(u)).map((u) => u.slice("/assets/".length)))].filter((f) => existsSync(join(wsDir, f))).sort()
  const initialGz = initial.reduce((sum, f) => sum + gzipSync(readFileSync(join(wsDir, f))).length, 0)
  await railModule(w, "Site").click()
  await wait(1200)
  const pageAfter = (await resources(w)).some((u) => /workspace-page-/.test(u))
  errors.push(...w.errors)
  await w.closeAll()
  const acRun = results.filter((r) => r.id.startsWith("AC-"))
  const acFailed = acRun.filter((r) => r.status === "fail").map((r) => r.id)
  const met = growth <= 3072 && built.length === 0 && plain.length === 0 && railItems === 0 && navEarly && !pageEarly && pageAfter && !errors.length
  const status = !met || acFailed.length ? "fail" : acRun.length ? "pass" : "not-measured"
  const acNote = acRun.length ? `${acRun.length} AC criteria ran in this pass, failing: ${acFailed.join(", ") || "none"}` : "the AC suite did not run in this pass (ONLY), so that part is not measured"
  return [status, `initial Studio chunk ${(gz / 1024).toFixed(1)} KB gzipped, ${growth >= 0 ? "+" : ""}${growth} bytes against the ${STUDIO_CHUNK_BASELINE} baseline of ${STUDIO_CHUNK_BASELINE_GZ} (budget 3,072); without a workspace the build has ${built.length} workspace chunks, ${plain.length} were requested across every view and Go to, and the rail has ${railItems} workspace items; with one, the navigation chunk loaded at start ${navEarly}, module code before a module opened ${pageEarly} and after ${pageAfter}, and the scripts loaded before any interaction were ${initial.map((f) => f.replace(/-[\w-]{8}\.js$/, "")).join(", ")} at ${(initialGz / 1024).toFixed(1)} KB gzipped in all (reported, not gated); page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}; ${acNote}`]
})

// WS-02 Modules follow the views with the views' marker, focus and labels; keyboard, Go to, links and Back reach every module and section
await check("WS-02", async () => {
  const errors = []
  servers.workspace.host = createMockHost()
  const p = await open("workspace", { hash: "view=inspect&scenario=tasks.list" })
  const hash = () => p.evaluate(() => location.hash)
  const order = await p.evaluate(() => {
    const views = document.querySelector('[aria-label="Studio"] nav[aria-label="Views"]')
    const ws = document.querySelector('[aria-label="Studio"] nav[aria-label="Workspace"]')
    return { after: !!views && !!ws && !!(views.compareDocumentPosition(ws) & Node.DOCUMENT_POSITION_FOLLOWING), divider: ws?.previousElementSibling?.getAttribute("role") === "separator", labels: [...(ws?.querySelectorAll("button") ?? [])].map((b) => b.textContent.trim()) }
  })
  const marker = (locator) => locator.first().evaluate((el) => {
    const b = getComputedStyle(el, "::before")
    return `${b.width} ${b.backgroundColor}`
  })
  const viewMarker = await marker(p.locator('[aria-label="Studio"] nav[aria-label="Views"] button[aria-pressed="true"]'))
  await railView(p, "Design").focus()
  await p.keyboard.press("Tab")
  // The views' focus indicator, drawn inside the rail item: an inset outline (0.12) or an inset ring.
  const focused = await p.evaluate(() => {
    const s = getComputedStyle(document.activeElement)
    return { text: document.activeElement?.textContent?.trim(), ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 && parseFloat(s.outlineOffset) < 0 ? `inset outline ${s.outlineWidth} ${s.outlineColor}` : s.boxShadow }
  })
  await p.keyboard.press("Enter")
  await poll(hash, (h) => /module=site/.test(h))
  await wait(600)
  const moduleMarker = await marker(p.locator('[aria-label="Studio"] nav[aria-label="Workspace"] button[aria-pressed="true"]'))
  const viewsPressed = await p.locator('[aria-label="Studio"] nav[aria-label="Views"] button[aria-pressed="true"]').count()
  const opened = await p.evaluate(() => ({ hash: location.hash, h1: document.querySelector("h1")?.textContent, crumbs: document.querySelector("header")?.innerText ?? "" }))
  // Sections by keyboard: focus Secrets in the module's panel and press Enter.
  await p.locator('nav[aria-label="Sections"] button', { hasText: "Secrets" }).focus()
  await p.keyboard.press("Enter")
  const sectionHash = await poll(hash, (h) => /section=secrets/.test(h))
  const goTo = async (target) => {
    await p.keyboard.press("ControlOrMeta+k")
    await wait(400)
    await p.keyboard.type("workspace")
    await wait(300)
    // An option's name is its parts in order, e.g. "Secrets Site" for the Secrets section of Site.
    const options = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] [role="option"]')].map((o) => [...o.childNodes].map((n) => n.textContent.trim()).filter(Boolean).join(" ")))
    let selected = ""
    for (let i = 0; i < 40 && selected !== target; i++) {
      selected = await p.evaluate(() => {
        const o = document.querySelector('[role="dialog"] [role="option"][aria-selected="true"]')
        return o ? [...o.childNodes].map((n) => n.textContent.trim()).filter(Boolean).join(" ") : ""
      })
      if (selected !== target) await p.keyboard.press("ArrowDown")
    }
    await p.keyboard.press("Enter")
    await wait(700)
    return { options, selected }
  }
  const viaGoTo = { first: await goTo("General Site") }
  viaGoTo.hash = await poll(hash, (h) => /section=general/.test(h))
  const back = []
  for (let i = 0; i < 3; i++) {
    const was = await hash()
    await p.evaluate(() => history.back())
    const h = await poll(hash, (x) => x !== was)
    await wait(300)
    back.push({ hash: h, open: await p.evaluate(() => !!document.querySelector('[aria-label="Studio"] nav[aria-label="Workspace"] button[aria-pressed="true"]')) })
  }
  // The second module by keyboard: Tab from Site to Audit, then Enter.
  await railModule(p, "Site").focus()
  await p.keyboard.press("Tab")
  const nextFocused = await p.evaluate(() => document.activeElement?.textContent?.trim())
  await p.keyboard.press("Enter")
  const auditHash = await poll(hash, (h) => /module=audit/.test(h))
  const audit = await poll(() => p.getByText(/No component for the "audit" module/).first().isVisible().catch(() => false), Boolean)
  // Go to reaches every module and section.
  const reached = {}
  for (const [target, want] of [["Site", /^#module=site&section=general/], ["General Site", /^#module=site&section=general/], ["Secrets Site", /^#module=site&section=secrets/], ["Audit", /^#module=audit/]]) {
    if (target === "General Site") {
      // Leave General first so this entry is a real move.
      await goTo("Audit")
      await poll(hash, (h) => /module=audit/.test(h))
    }
    const { selected } = await goTo(target)
    const h = await poll(hash, (x) => want.test(x))
    reached[target] = selected === target && want.test(h)
  }
  const options = viaGoTo.first.options
  await p.closeAll()
  // Links reach every module and section.
  const links = {}
  for (const [link, pressed, expect] of [["module=site&section=general", "Site", (m) => m.h1 === "Site" && m.field && !m.secret], ["module=site&section=secrets", "Site", (m) => m.h1 === "Site" && m.secret], ["module=audit", "Audit", (m) => m.reason]]) {
    servers.workspace.host = createMockHost()
    const l = await open("workspace", { hash: link })
    const m = await poll(() => l.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, field: !!document.querySelector('[data-kit] input[type="text"], [data-kit] input:not([type])'), secret: !!document.querySelector('input[type="password"]'), reason: /No component for the "audit" module/.test(document.body.innerText), pressed: document.querySelector('[aria-label="Studio"] nav[aria-label="Workspace"] button[aria-pressed="true"]')?.textContent?.trim(), hash: location.hash })), (m) => m.pressed === pressed && expect(m))
    links[link] = m.pressed === pressed && expect(m)
    errors.push(...l.errors)
    await l.closeAll()
  }
  errors.push(...p.errors)
  const wantOptions = ["Site", "General Site", "Secrets Site", "Audit"]
  const listed = wantOptions.every((o) => options.includes(o))
  const ok = order.after && order.divider && order.labels.join() === "Site,Audit" && /^2px /.test(viewMarker) && viewMarker === moduleMarker && focused.text === "Site" && /inset/.test(focused.ring) && /module=site&section=general/.test(opened.hash) && opened.h1 === "Site" && /Site/.test(opened.crumbs) && /General/.test(opened.crumbs) && viewsPressed === 0 && /section=secrets/.test(sectionHash) && /section=general/.test(viaGoTo.hash) && /section=secrets/.test(back[0].hash) && /section=general/.test(back[1].hash) && !/module=/.test(back[2].hash) && !back[2].open && nextFocused === "Audit" && /module=audit/.test(auditHash) && audit && listed && Object.values(reached).every(Boolean) && Object.values(links).every(Boolean) && !errors.length
  return [ok ? "pass" : "fail", `rail order ${order.after ? "views then modules" : "wrong"}${order.divider ? " after a divider" : ", no divider"}, labels ${order.labels.join(", ")}; marker ${viewMarker} on a view and ${moduleMarker} on a module; Tab from the last view reached "${focused.text}" with ${/inset/.test(focused.ring) ? "the inset ring" : "no ring"}; Enter opened ${opened.hash} titled "${opened.h1}" (views pressed ${viewsPressed}); Enter on Secrets in the panel opened ${sectionHash}; Go to opened ${viaGoTo.hash}; Back went to ${back.map((b) => b.hash || "(none)").join(", then ")}; Tab then Enter reached "${nextFocused}" at ${auditHash}, which ${audit ? "says it has no component" : "gave no reason"}; Go to listed ${options.join(", ")} and reached ${Object.entries(reached).map(([k, v]) => `${k} ${v ? "yes" : "no"}`).join(", ")}; links reached ${Object.entries(links).map(([k, v]) => `${k} ${v ? "yes" : "no"}`).join(", ")}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// WS-03 A deep import from shell internals in src/workspace/ fails lint; an undeclared module fails the build by name
await check("WS-03", async () => {
  for (const f of readdirSync(join(root, "src/workspace"))) if (/^acceptance-probe.*\.tsx$/.test(f)) rmSync(join(root, "src/workspace", f), { force: true })
  const probe = join(root, `src/workspace/acceptance-probe-${process.pid}-${Date.now()}.tsx`)
  const lint = (code) => {
    writeFileSync(probe, code)
    const r = spawnSync("npx", ["eslint", "--no-warn-ignored", probe], { cwd: root, encoding: "utf8" })
    return { code: r.status, out: `${r.stdout}${r.stderr}` }
  }
  let deep
  let own
  try {
    deep = lint('import { Button } from "@/components/ui/button"\nimport { cn } from "../lib/utils"\nexport const probe = [Button, cn]\n')
    own = lint('import { ModulePage } from "@studio/kit"\nimport { useModule } from "@studio/workspace"\nimport workspace from "./index"\nexport const probe = [ModulePage, useModule, workspace]\n')
  } finally {
    rmSync(probe, { force: true })
  }
  const b = spawnSync("npx", ["vite", "build", "--outDir", join(root, ".acceptance", "orphan"), "--emptyOutDir", "--logLevel", "error"], { cwd: root, encoding: "utf8", env: { ...process.env, VITE_STUDIO_ADAPTER: "workspace", VITE_STUDIO_WORKSPACE: "orphan" } })
  const built = `${b.stdout}${b.stderr}`
  const named = /@\/components\/ui\/button is outside the workspace boundary/.test(deep.out) && /\.\.\/lib\/utils is outside the workspace boundary/.test(deep.out)
  const ok = deep.code !== 0 && named && own.code === 0 && b.status !== 0 && /"orphan", which the adapter does not declare/.test(built)
  return [ok ? "pass" : "fail", `a deep import and a relative escape from src/workspace/ ${deep.code !== 0 ? "fail" : "pass"} lint${named ? ", each named" : ""}; imports of the kit, the workspace API and the module's own files ${own.code === 0 ? "pass" : `fail: ${own.out.split("\n").slice(0, 3).join(" ")}`}; a module map that defines an undeclared module ${b.status !== 0 ? "fails the build" : "builds"}${/"orphan"/.test(built) ? ' naming "orphan"' : ""}`]
})

// WS-04 Undeclared operations, kind mismatches and cross-origin endpoints are refused without a request
await check("WS-04", async () => {
  const { stripTypeScriptTypes } = await import("node:module")
  const tmp = mkdtempSync(join(tmpdir(), "studio-ops-"))
  let sent = 0
  let codes
  let before
  let control
  // Node marks type stripping experimental; keep that notice out of the acceptance output.
  const emitWarning = process.emitWarning
  process.emitWarning = (warning, ...rest) => (/stripTypeScriptTypes/.test(String(warning)) ? undefined : emitWarning.call(process, warning, ...rest))
  try {
    const file = join(tmp, "operations.mjs")
    writeFileSync(file, stripTypeScriptTypes(readFileSync(join(root, "src/studio/workspace/operations.ts"), "utf8"), { mode: "strip" }))
    const { createOperationClient } = await import(pathToFileURL(file).href)
    const transport = async () => {
      sent++
      return { status: 200, text: async () => JSON.stringify({ ok: true, data: null }) }
    }
    const uses = [{ name: "site.read", kind: "read" }, { name: "site.write", kind: "write" }]
    const client = (base) => createOperationClient({ base, uses, location: "http://127.0.0.1:4000/", fetch: transport })
    const refused = [
      await client("./__studio/ops")("audit.list", "read"),
      await client("./__studio/ops")("site.write", "read"),
      await client("./__studio/ops")("site.read", "write"),
      await client("https://elsewhere.example/ops")("site.read", "read"),
      await client("//elsewhere.example/ops")("site.read", "read"),
    ]
    codes = refused.map((r) => (r.ok ? "sent" : r.error.code))
    before = sent
    await client("./__studio/ops")("site.read", "read")
    control = sent - before
  } finally {
    process.emitWarning = emitWarning
    rmSync(tmp, { recursive: true, force: true })
  }
  servers.workspace.host = createMockHost()
  const p = await open("workspace", { hash: "module=site&section=general" })
  const names = []
  p.on("request", (r) => {
    const m = /\/__studio\/ops\/([^?]+)/.exec(r.url())
    if (m) names.push(decodeURIComponent(m[1]))
  })
  await p.reload()
  await p.waitForSelector("header")
  await wait(1500)
  await siteName(p).fill("Acceptance")
  await p.getByRole("button", { name: "Save", exact: true }).click()
  await poll(() => names.filter((n) => n === "site.write").length, (n) => n > 0)
  await wait(300)
  const errors = [...p.errors]
  await p.closeAll()
  const declared = names.every((n) => n === "site.read" || n === "site.write")
  const ok = codes.join() === "undeclared,kind-mismatch,kind-mismatch,cross-origin,cross-origin" && before === 0 && control === 1 && declared && names.includes("site.read") && names.includes("site.write") && !errors.length
  return [ok ? "pass" : "fail", `the operation client answered ${codes.join(", ")} for an undeclared name, a write declared as a read, a read declared as a write, another origin and a protocol-relative origin, with ${before} requests sent; a declared read sent ${control}; in the browser the example module requested only ${[...new Set(names)].join(" and ") || "nothing"}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// WS-05 A conflicting write keeps the edit, shows the current value and offers retry; nothing is overwritten
await check("WS-05", async () => {
  servers.workspace.host = createMockHost()
  const p = await open("workspace", { hash: "module=site&section=general" })
  await wait(1000)
  await siteName(p).fill("Mine")
  const opened = await ops("site.read", { input: null })
  const theirs = await ops("site.write", { input: { siteName: "Theirs" }, expectedRevision: opened.revision }, "someone else")
  await p.getByRole("button", { name: "Save", exact: true }).click()
  const barText = () => p.getByRole("region", { name: "Changes", exact: true }).innerText().catch(() => "")
  const bar = await poll(barText, (t) => /Changed elsewhere/.test(t))
  const kept = await siteName(p).inputValue()
  const host1 = (await ops("site.read", { input: null })).data.settings.siteName
  await p.getByRole("button", { name: "Save mine again" }).click()
  const after = await poll(barText, (t) => /Saved/.test(t))
  const host2 = (await ops("site.read", { input: null })).data.settings.siteName
  const errors = [...p.errors]
  await p.closeAll()
  const ok = !errors.length && theirs.ok && /Changed elsewhere/.test(bar) && /Theirs/.test(bar) && kept === "Mine" && host1 === "Theirs" && host2 === "Mine" && /Saved/.test(after)
  return [ok ? "pass" : "fail", `another writer set the site name to "${host1}"; Save then showed ${/Changed elsewhere/.test(bar) ? "the conflict" : "no conflict"} with the current value ${/Theirs/.test(bar) ? '"Theirs"' : "missing"}, kept the edit "${kept}" and left the host at "${host1}"; Save mine again wrote "${host2}"${/Saved/.test(after) ? " and said Saved" : ""}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// WS-05b A host that stops answering after a module opened fails only that operation: the page and the edit stay, SaveBar shows
// the error with Retry, leaving still asks, and Retry saves once the host answers again
await check("WS-05b", async () => {
  const host = createMockHost()
  servers.workspace.host = host
  const p = await open("workspace", { hash: "module=site&section=general" })
  try {
    await wait(1200)
    await siteName(p).fill("Kept edit")
    // The host goes away: whatever answers now is not the operations host (a proxy's HTML error page).
    servers.workspace.host = (req, res) => {
      res.statusCode = 502
      res.setHeader("content-type", "text/html")
      res.end("<html><body>Bad gateway</body></html>")
    }
    await p.getByRole("button", { name: "Save", exact: true }).click()
    const barText = () => p.getByRole("region", { name: "Changes", exact: true }).innerText().catch(() => "")
    const bar = await poll(barText, (t) => /No operations host answered/.test(t))
    const failed = { retry: await p.getByRole("button", { name: "Retry", exact: true }).count(), value: await siteName(p).inputValue(), h1: await p.locator("h1").first().innerText().catch(() => ""), unavailable: await p.getByText(/is unavailable/).count() }
    await railView(p, "Compare").click()
    await wait(500)
    const asked = await p.getByRole("dialog", { name: "Leave without saving?" }).isVisible().catch(() => false)
    await p.getByRole("button", { name: "Stay", exact: true }).click()
    await wait(400)
    servers.workspace.host = host
    await p.getByRole("button", { name: "Retry", exact: true }).click()
    const after = await poll(barText, (t) => /Saved/.test(t))
    const stored = (await ops("site.read", { input: null })).data.settings.siteName
    const errors = [...p.errors]
    const ok = !errors.length && /No operations host answered/.test(bar) && failed.retry === 1 && failed.value === "Kept edit" && failed.h1 === "Site" && failed.unavailable === 0 && asked && /Saved/.test(after) && stored === "Kept edit"
    return [ok ? "pass" : "fail", `with the host gone Save ${/No operations host answered/.test(bar) ? "showed the host error" : "showed no host error"} with ${failed.retry} Retry, kept "${failed.value}" on the ${failed.h1} page (${failed.unavailable} unavailable notices) and leaving ${asked ? "asked" : "did not ask"}; with the host back Retry ${/Saved/.test(after) ? "saved" : "did not save"} and the host holds "${stored}"; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
  } finally {
    servers.workspace.host = host
    await p.closeAll()
  }
})

// WS-06 The dirty guard stops leaving unsaved changes (rail, view keys and Back) and Esc keeps them
await check("WS-06", async () => {
  servers.workspace.host = createMockHost()
  const p = await open("workspace", { hash: "view=inspect&scenario=tasks.list" })
  await railModule(p, "Site").click()
  await wait(1500)
  await siteName(p).fill("Unsaved edit")
  const dialog = () => p.getByRole("dialog", { name: "Leave without saving?" })
  await railView(p, "Compare").click()
  await wait(500)
  const asked = await dialog().isVisible().catch(() => false)
  await p.keyboard.press("Escape")
  await wait(500)
  const stayed = { open: await dialog().count(), hash: await p.evaluate(() => location.hash), value: await siteName(p).inputValue() }
  await p.locator("h1").click()
  await p.keyboard.press("2")
  await wait(500)
  const keyAsked = await dialog().isVisible().catch(() => false)
  await p.getByRole("button", { name: "Stay", exact: true }).click()
  await wait(400)
  await p.evaluate(() => history.back())
  const backAsked = await poll(() => dialog().isVisible().catch(() => false), Boolean)
  await p.getByRole("button", { name: "Stay", exact: true }).click()
  await wait(400)
  const afterBack = { hash: await poll(() => p.evaluate(() => location.hash), (h) => /module=site/.test(h)), value: await siteName(p).inputValue() }
  await railView(p, "Compare").click()
  await wait(500)
  await p.getByRole("button", { name: "Leave without saving", exact: true }).click()
  const left = await poll(() => p.evaluate(() => ({ hash: location.hash, pressed: document.querySelector('[aria-label="Studio"] nav[aria-label="Views"] button[aria-pressed="true"]')?.textContent?.trim() })), (l) => l.pressed === "Compare")
  const errors = [...p.errors]
  await p.closeAll()
  const ok = !errors.length && asked && stayed.open === 0 && /module=site/.test(stayed.hash) && stayed.value === "Unsaved edit" && keyAsked && backAsked && /module=site/.test(afterBack.hash) && afterBack.value === "Unsaved edit" && /view=compare/.test(left.hash) && left.pressed === "Compare"
  return [ok ? "pass" : "fail", `with an unsaved edit the rail ${asked ? "asked" : "did not ask"}, Esc kept ${stayed.hash} with "${stayed.value}"; the 2 key ${keyAsked ? "asked" : "did not ask"}; Back ${backAsked ? "asked" : "did not ask"} and Stay kept ${afterBack.hash} with "${afterBack.value}"; Leave without saving opened ${left.hash} with ${left.pressed} pressed; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// WS-06b Back and Forward out of a module with unsaved changes ask on any step; Stay keeps the module's link and page and later
// history steps still work; leaving through history leaves no duplicate entry behind (the example workspace in the dev server)
await check("WS-06b", async () => {
  const port = 5396
  const dev = spawn("npx", ["vite", "--port", String(port), "--strictPort", "--logLevel", "error"], { cwd: root, stdio: "ignore", env: { ...process.env, VITE_STUDIO_ADAPTER: "workspace" } })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    const url = `http://localhost:${port}/`
    for (let i = 0; i < 60 && !(await fetch(url).then((r) => r.ok).catch(() => false)); i++) await wait(500)
    const p = await context.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e)))
    const hash = () => p.evaluate(() => location.hash)
    const h1 = () => p.locator("h1").first().innerText().catch(() => "")
    const dialog = () => p.getByRole("dialog", { name: "Leave without saving?" })
    const rail = (label) => p.locator('[aria-label="Studio"] nav[aria-label="Workspace"] button', { hasText: label })
    const name = () => p.getByLabel("Site name", { exact: true })
    await p.goto(`${url}#view=inspect&scenario=tasks.list`)
    await p.waitForSelector('nav[aria-label="Workspace"]')
    await rail("Site").click()
    await name().waitFor()
    await rail("Audit").click()
    await wait(600)
    await p.goBack()
    await name().waitFor()
    await wait(600)
    await name().fill("Unsaved edit")
    // Forward would leave Site for Audit: it asks, and Stay keeps Site.
    await p.goForward()
    await wait(800)
    const forwardAsked = await dialog().isVisible().catch(() => false)
    await p.getByRole("button", { name: "Stay", exact: true }).click()
    await wait(500)
    const stayed = { hash: await hash(), h1: await h1(), value: await name().inputValue() }
    // Stay put Site's place back on top of Audit's entry, so the next Back asks again; Leave without saving opens Audit.
    await p.goBack()
    await wait(800)
    const backAsked = await dialog().isVisible().catch(() => false)
    await p.getByRole("button", { name: "Leave without saving", exact: true }).click()
    await wait(900)
    const leftTo = { hash: await hash(), h1: await h1() }
    // The next Back reaches Site's own entry, not a duplicate of Audit's.
    await p.goBack()
    await name().waitFor()
    await wait(600)
    const backAgain = { hash: await hash(), h1: await h1() }
    // A guarded Back out to the view, then Leave: Forward returns to Site, not to a duplicate of the view.
    await name().fill("Second edit")
    await p.goBack()
    await wait(800)
    const viewAsked = await dialog().isVisible().catch(() => false)
    await p.getByRole("button", { name: "Leave without saving", exact: true }).click()
    await wait(900)
    const atView = { hash: await hash(), h1: await p.locator("h1").count() }
    await p.goForward()
    await wait(900)
    const forwardAgain = { hash: await hash(), h1: await h1() }
    const ok = !errors.length && forwardAsked && /module=site/.test(stayed.hash) && stayed.h1 === "Site" && stayed.value === "Unsaved edit" && backAsked && /module=audit/.test(leftTo.hash) && leftTo.h1 === "Audit" && /module=site/.test(backAgain.hash) && backAgain.h1 === "Site" && viewAsked && /view=inspect/.test(atView.hash) && atView.h1 === 0 && /module=site/.test(forwardAgain.hash) && forwardAgain.h1 === "Site"
    return [ok ? "pass" : "fail", `Forward with an unsaved edit ${forwardAsked ? "asked" : "did not ask"}; Stay kept ${stayed.hash} showing ${stayed.h1} with "${stayed.value}"; the next Back ${backAsked ? "asked" : "did not ask"} and Leave opened ${leftTo.hash} (${leftTo.h1}); Back then opened ${backAgain.hash} (${backAgain.h1}); a guarded Back to the view ${viewAsked ? "asked" : "did not ask"}, Leave opened ${atView.hash}, and Forward opened ${forwardAgain.hash} (${forwardAgain.h1}); page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
  } finally {
    await context.close()
    dev.kill()
  }
})

// WS-07 Without an operations host every module says why it is unavailable; nothing is simulated
await check("WS-07", async () => {
  const p = await open("nohost", { hash: "module=site&section=general" })
  await wait(1800)
  const site = { reason: await p.getByText(/No operations host answered at \.\/__studio\/ops/).first().isVisible().catch(() => false), form: await siteName(p).count() }
  await railModule(p, "Audit").click()
  await wait(900)
  const audit = await p.getByText(/No component for the "audit" module/).first().isVisible().catch(() => false)
  await railModule(p, "Site").click()
  await wait(900)
  const still = await p.getByText(/No operations host answered/).first().isVisible().catch(() => false)
  const errors = [...p.errors]
  await p.closeAll()
  const ok = !errors.length && site.reason && site.form === 0 && audit && still
  return [ok ? "pass" : "fail", `a built Studio served without its host: Site ${site.reason ? "says no operations host answered" : "gave no reason"} and shows ${site.form} form fields; Audit ${audit ? "says it has no component" : "gave no reason"}; reopening Site ${still ? "still says why" : "lost the reason"}. A Studio that declares no operations is covered by the model test WM-01; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// WS-08 At 360 to 430 px modules open from the bottom bar's Workspace drawer: no sideways scroll, 44 px targets, 16 px input text
await check("WS-08", async () => {
  const bad = []
  const errors = []
  const wideRegions = (p) =>
    p.evaluate(() => {
      const wide = [...document.querySelectorAll("body *")].filter((e) => e.scrollWidth > innerWidth + 1 && !["auto", "scroll"].includes(getComputedStyle(e).overflowX) && !e.closest(".preview-frame"))
      return { doc: document.documentElement.scrollWidth, iw: innerWidth, wide: wide.length, h1: document.querySelector("h1")?.textContent, dialogs: document.querySelectorAll('[role="dialog"]').length, secret: !!document.querySelector('[data-kit] input[type="password"]') }
    })
  // Every kit target and input across the page's states, named by state.
  const misses = (states) => Object.entries(states).flatMap(([state, m]) => [...m.small.map((x) => `${state}: ${x.n} ${x.w}x${x.h}`), ...m.smallText.map((x) => `${state}: ${x.n} text ${x.text}px`), ...(m.count ? [] : [`${state}: no kit controls`])])
  for (const width of [360, 390, 430]) {
    servers.workspace.host = createMockHost()
    const p = await open("workspace", { width, height: 844, touch: true, hash: "view=inspect&scenario=tasks.list" })
    const bottomDetails = await p.locator('nav[aria-label="Views"] button', { hasText: "Details" }).count()
    const headerDetails = await p.locator('header button[aria-label="Details"]').count()
    await p.locator('nav[aria-label="Views"] button', { hasText: "Workspace" }).click()
    await wait(800)
    const drawer = p.getByRole("dialog")
    const listed = await drawer.getByRole("button", { name: "Site", exact: true }).count()
    const small = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] button, nav[aria-label="Views"] button, header button')].filter((e) => e.offsetParent).map((e) => {
      const r = e.getBoundingClientRect()
      return { n: e.getAttribute("aria-label") || e.textContent.trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height) }
    }).filter((r) => r.w < 44 || r.h < 44))
    await drawer.getByRole("button", { name: "Site", exact: true }).click()
    await poll(() => siteName(p).isVisible().catch(() => false), Boolean)
    await wait(600)
    const page = await wideRegions(p)
    const { measured: states, missed: unreached } = await kitStates(p, () => kitTargets(p))
    errors.push(...p.errors)
    await p.closeAll()
    // The Secrets section: a secret field with Reveal inside an input group.
    servers.workspace.host = createMockHost()
    const s = await open("workspace", { width, height: 844, touch: true, hash: "module=site&section=secrets" })
    await poll(() => s.locator('[data-kit] input[type="password"]').count(), (n) => n > 0)
    const secrets = await wideRegions(s)
    const secretKit = await kitTargets(s)
    errors.push(...s.errors)
    await s.closeAll()
    const fits = (m) => m.doc <= m.iw && m.wide === 0 && m.h1 === "Site" && m.dialogs === 0
    const missed = misses({ ...states, secrets: secretKit })
    const fine = bottomDetails === 0 && headerDetails === 1 && listed === 1 && !small.length && fits(page) && fits(secrets) && secrets.secret && !missed.length && !unreached.length
    if (!fine) bad.push(`${width}: ${JSON.stringify({ bottomDetails, headerDetails, listed, small, page, secrets, missed, unreached })}`)
  }
  if (errors.length) bad.push(`page errors ${errors.slice(0, 2).join(" | ")}`)
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : "at 360, 390 and 430 px the bottom bar's Workspace entry (Details in the top bar) opened a drawer listing Site; every bar, header and drawer target is at least 44 px, and every kit control is at least 44 px with 16 px input text on the General section as loaded, with an unsaved edit (Discard, Save), with the Region list open, in a conflict (Use current value, Save mine again) and in the leave dialog, and on the Secrets section (the secret field and Reveal); the drawer closed on choosing, nothing scrolls sideways, and no page errors. Real devices and swipe are not covered."]
})

// Floors shared by WS-09 and LB-08: AA text in [data-kit], a focus walk that measures the indicator focus adds (a preview
// frame is skipped: its product draws its own focus), and drawn control boundaries for forced colors.
const contrast = (p) =>
  p.evaluate(() => {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const g = canvas.getContext("2d", { willReadFrequently: true })
    const rgb = (layers) => {
      g.clearRect(0, 0, 1, 1)
      for (const c of layers) {
        g.fillStyle = c
        g.fillRect(0, 0, 1, 1)
      }
      return Array.from(g.getImageData(0, 0, 1, 1).data.slice(0, 3))
    }
    const lum = (c) => {
      const f = (v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
      return (x + 0.05) / (y + 0.05)
    }
    const low = []
    for (const el of document.querySelectorAll("[data-kit] *")) {
      if (!el.getClientRects().length) continue
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      if (el.closest(":disabled, [aria-disabled='true'], [data-disabled]")) continue
      const chain = []
      for (let a = el; a; a = a.parentElement) chain.unshift(getComputedStyle(a).backgroundColor)
      const bg = rgb(["#ffffff", ...chain])
      const st = getComputedStyle(el)
      const fg = rgb([`rgb(${bg.join(",")})`, st.color])
      const size = parseFloat(st.fontSize)
      const need = size >= 24 || (size >= 18.66 && Number(st.fontWeight) >= 700) ? 3 : 4.5
      const r = ratio(fg, bg)
      if (r < need) low.push(`"${el.textContent.trim().slice(0, 24)}" ${r.toFixed(2)}`)
    }
    // Typed values and placeholders are text too.
    for (const el of document.querySelectorAll('[data-kit] input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), [data-kit] textarea')) {
      if (!el.getClientRects().length || el.disabled) continue
      const text = el.value || el.placeholder
      if (!text) continue
      const chain = []
      for (let a = el; a; a = a.parentElement) chain.unshift(getComputedStyle(a).backgroundColor)
      const bg = rgb(["#ffffff", ...chain])
      const st = getComputedStyle(el, el.value ? null : "::placeholder")
      const fg = rgb([`rgb(${bg.join(",")})`, st.color])
      const size = parseFloat(getComputedStyle(el).fontSize)
      const r = ratio(fg, bg)
      if (r < (size >= 24 ? 3 : 4.5)) low.push(`${el.value ? "value" : "placeholder"} "${text.slice(0, 24)}" ${r.toFixed(2)}`)
    }
    return low
  })
// Tailwind gives every ring utility a computed box-shadow even unfocused, so "has a box-shadow" proves nothing: record each kit
// element's outline and shadow layers unfocused, then count a focus indicator only where focus adds a visible layer.
// Controls transition their ring in: read styles once the running transitions end (infinite animations such as spinners are skipped).
const settle = (p) => p.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => null))))
const unfocused = async (p) => {
  await p.mouse.move(0, 0)
  await p.evaluate(() => document.activeElement?.blur?.())
  await settle(p)
  await p.evaluate(() => {
    const before = new WeakMap()
    for (const e of document.querySelectorAll("[data-kit] *")) {
      const s = getComputedStyle(e)
      before.set(e, { outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`, shadow: s.boxShadow })
    }
    window.__kitUnfocused = before
  })
}
const tabWalk = async (p, forced) => {
  await p.evaluate(() => {
    const h = document.querySelector("[data-kit] h1")
    h.tabIndex = -1
    h.focus()
  })
  const lost = []
  const faint = []
  const ratios = []
  let reached = 0
  for (let i = 0; i < 14; i++) {
    await p.keyboard.press("Tab")
    await settle(p)
    const f = await p.evaluate(() => {
      const e = document.activeElement
      if (!e?.closest("[data-kit]") || e.tagName === "IFRAME") return null
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 1
      const g = canvas.getContext("2d", { willReadFrequently: true })
      const paint = (layers) => {
        g.clearRect(0, 0, 1, 1)
        for (const c of layers) {
          g.fillStyle = c
          g.fillRect(0, 0, 1, 1)
        }
        return Array.from(g.getImageData(0, 0, 1, 1).data)
      }
      const lum = (c) => {
        const f = (v) => {
          v /= 255
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
      }
      const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
        return (x + 0.05) / (y + 0.05)
      }
      // The backdrop the indicator is drawn on: the parent's for an outer ring, the element's own for an inset one.
      const backdrop = (inside) => {
        const chain = []
        for (let a = inside ? e : e.parentElement; a; a = a.parentElement) chain.unshift(getComputedStyle(a).backgroundColor)
        return paint(["#ffffff", ...chain]).slice(0, 3)
      }
      const split = (v) => (v === "none" ? [] : v.split(/,(?![^(]*\))/).map((x) => x.trim()))
      const s = getComputedStyle(e)
      const before = window.__kitUnfocused?.get(e) ?? { outline: "none", shadow: "none" }
      const marks = []
      const outline = `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`
      if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && outline !== before.outline && paint([s.outlineColor])[3] > 0) marks.push({ kind: "outline", color: s.outlineColor, inside: parseFloat(s.outlineOffset) < 0 })
      const was = split(before.shadow)
      for (const layer of split(s.boxShadow)) {
        if (was.includes(layer)) continue
        const color = /^(rgba?|oklch|oklab|lab|lch|color|hsla?)\([^)]*\)/.exec(layer)?.[0] ?? /^#\w+/.exec(layer)?.[0]
        const lengths = layer.replace(color ?? "", "").match(/-?[\d.]+px/g)?.map(parseFloat) ?? []
        const [, , blur = 0, spread = 0] = lengths
        if (color && paint([color])[3] > 0 && (spread > 0 || blur > 0)) marks.push({ kind: "ring", color, inside: /\binset\b/.test(layer) })
      }
      const best = marks.map((m) => {
        const bg = backdrop(m.inside)
        return ratio(paint([`rgb(${bg.join(",")})`, m.color]).slice(0, 3), bg)
      }).sort((a, b) => b - a)[0]
      return { n: e.getAttribute("aria-label") || e.textContent.trim().slice(0, 16) || e.id, outline: marks.some((m) => m.kind === "outline"), visible: marks.length > 0, ratio: best ?? 0 }
    })
    if (!f) continue
    reached++
    if (forced ? !f.outline : !f.visible) lost.push(f.n)
    else if (!forced) {
      ratios.push(f.ratio)
      if (f.ratio < 3) faint.push(`${f.n} ${f.ratio.toFixed(2)}`)
    }
  }
  return { reached, lost, faint, min: ratios.length ? Math.min(...ratios) : 0 }
}
// A control's boundary in forced colors is a drawn border; a control inside an input group uses the group's.
const boundaryless = (p) =>
  p.evaluate(() => {
    const drawn = (e) => {
      const s = getComputedStyle(e)
      return s.borderTopStyle !== "none" && parseFloat(s.borderTopWidth) > 0
    }
    return [...document.querySelectorAll('[data-kit] button:not([data-inline]), [data-kit] input, [data-kit] [role="switch"], [data-kit] [role="combobox"]')].filter((e) => e.getBoundingClientRect().width > 2).filter((e) => {
      const group = e.closest('[data-slot="input-group"]')
      return !drawn(e) && !(group && drawn(group))
    }).map((e) => e.getAttribute("aria-label") || e.textContent.trim().slice(0, 16) || e.id)
  })

// WS-09 Kit components meet the contrast, focus, target, reduced-motion and forced-color floors in both appearances
await check("WS-09", async () => {
  const notes = []
  const errors = []
  let ok = true
  for (const appearance of ["light", "dark"]) {
    for (const section of ["general", "secrets"]) {
      servers.workspace.host = createMockHost()
      const p = await open("workspace", { appearance, hash: `module=site&section=${section}` })
      await poll(() => p.locator("[data-kit] h1").count(), (n) => n > 0)
      await wait(600)
      let focus
      let low
      const unreached = []
      if (section === "general") {
        // The page as loaded, with an unsaved edit (where the focus walk runs, through Discard and Save), with the Region list open, in a
        // conflict and in the leave dialog.
        const { measured: states, missed } = await kitStates(p, () => contrast(p), async () => {
          await unfocused(p)
          focus = await tabWalk(p, false)
        })
        unreached.push(...missed.map((state) => `desktop ${state}`))
        low = Object.entries(states).flatMap(([state, l]) => l.map((x) => `${state}: ${x}`))
      } else {
        low = await contrast(p)
        await unfocused(p)
        focus = await tabWalk(p, false)
      }
      await p.emulateMedia({ reducedMotion: "reduce" })
      const moving = await p.evaluate(() => [...document.querySelectorAll("[data-kit], [data-kit] *")].filter((e) => {
        const s = getComputedStyle(e)
        return (s.animationName !== "none" && parseFloat(s.animationDuration) > 0) || s.transitionDuration.split(",").some((d) => parseFloat(d) > 0)
      }).length)
      await p.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" })
      await unfocused(p)
      const forced = await tabWalk(p, true)
      const borderless = await boundaryless(p)
      errors.push(...p.errors)
      await p.closeAll()
      servers.workspace.host = createMockHost()
      const t = await open("workspace", { appearance, width: 390, height: 844, touch: true, hash: `module=site&section=${section}` })
      await poll(() => t.locator("[data-kit] h1").count(), (n) => n > 0)
      await wait(600)
      const touch = section === "general" ? await kitStates(t, () => kitTargets(t)) : { measured: { page: await kitTargets(t) }, missed: [] }
      const measured = touch.measured
      unreached.push(...touch.missed.map((state) => `touch ${state}`))
      errors.push(...t.errors)
      await t.closeAll()
      const small = Object.entries(measured).flatMap(([state, m]) => [...m.small.map((x) => `${state}: ${x.n} ${x.w}x${x.h}`), ...m.smallText.map((x) => `${state}: ${x.n} text ${x.text}px`), ...(m.count ? [] : [`${state}: no kit controls`])])
      const stops = section === "general" ? 5 : 2
      const fine = !low.length && focus.reached >= stops && !focus.lost.length && !focus.faint.length && moving === 0 && forced.reached >= stops && !forced.lost.length && !borderless.length && !small.length && !unreached.length
      ok &&= fine
      notes.push(`${appearance} ${section}: text below AA (text, values and placeholders${section === "general" ? "; as loaded, unsaved, Region list open, conflict and leave dialog" : ""}) ${low.length ? low.slice(0, 4).join(", ") : "none"}; focus adds a visible indicator on ${focus.reached - focus.lost.length} of ${focus.reached} kit stops${focus.lost.length ? `, none on ${focus.lost.join(", ")}` : ""}, lowest indicator contrast ${focus.min.toFixed(2)}:1${focus.faint.length ? ` (under 3:1 on ${focus.faint.join(", ")})` : ""}; ${moving} kit elements still moving under reduced motion; in forced colors focus outlined on ${forced.reached - forced.lost.length} of ${forced.reached}${borderless.length ? `, controls without a drawn boundary ${borderless.join(", ")}` : ", every control keeps a drawn boundary"}; on a touch screen ${small.length ? `misses ${small.slice(0, 6).join(", ")}` : `every kit target at least 44 px with 16 px input text in ${Object.keys(measured).join(", ")}`}${unreached.length ? `; states not reached ${unreached.join(", ")}` : ""}`)
    }
  }
  if (errors.length) {
    ok = false
    notes.push(`page errors ${errors.slice(0, 2).join(" | ")}`)
  }
  return [ok ? "pass" : "fail", `${notes.join("; ")}. Forced colors is Chromium's emulation; assistive technologies are not covered.`]
})

// WS-10 On a phone (390 px, touch), in both appearances: the SaveBar in its conflict state keeps its message clear of its actions,
// with no text cut off and 44 px actions; and a module page with a long DataTable scrolls inside the page, never the document,
// so the top bar stays at the top, and every positioned element on the page (the table's sort announcement) is placed inside it
await check("WS-10", async () => {
  const bad = []
  const notes = []
  const errors = []
  for (const appearance of ["light", "dark"]) {
    // 1. The conflict: the message, its reason and the current value against the bar's buttons.
    servers.workspace.host = createMockHost()
    const p = await open("workspace", { appearance, width: 390, height: 844, touch: true, hash: "module=site&section=general" })
    await poll(() => siteName(p).isVisible().catch(() => false), Boolean)
    await siteName(p).fill("Mine")
    await poll(() => p.getByRole("button", { name: "Save", exact: true }).isVisible().catch(() => false), Boolean)
    const current = await ops("site.read", { input: null })
    await ops("site.write", { input: { siteName: "Theirs" }, expectedRevision: current.revision }, "someone else")
    await p.getByRole("button", { name: "Save", exact: true }).click()
    const reached = await poll(() => p.getByRole("button", { name: "Save mine again" }).isVisible().catch(() => false), Boolean)
    await wait(400)
    const m = await p.evaluate(() => {
      const bar = document.querySelector('[data-kit] [role="region"][aria-label="Changes"]')
      if (!bar) return null
      const message = bar.querySelector('[role="status"]')
      const buttons = [...bar.querySelectorAll("button")].map((b) => ({ n: b.textContent.trim(), r: b.getBoundingClientRect() }))
      // Every line of text in the message, as laid out.
      const lines = []
      const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT)
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.textContent.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(t)
        for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) lines.push({ t: t.textContent.trim().slice(0, 24), r })
      }
      const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
      const mr = message.getBoundingClientRect()
      const overlaps = []
      for (const b of buttons) {
        if (hit(mr, b.r)) overlaps.push(`message box/${b.n}`)
        for (const l of lines) if (hit(l.r, b.r)) overlaps.push(`"${l.t}"/${b.n}`)
      }
      const box = bar.getBoundingClientRect()
      const outside = lines.filter((l) => l.r.left < box.left - 0.5 || l.r.right > box.right + 0.5 || l.r.top < box.top - 0.5 || l.r.bottom > box.bottom + 0.5).map((l) => l.t)
      const cut = [...message.querySelectorAll("*")].filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible").map((e) => e.textContent.trim().slice(0, 24))
      const small = buttons.filter((b) => b.r.width < 44 || b.r.height < 44).map((b) => `${b.n} ${Math.round(b.r.width)}×${Math.round(b.r.height)}`)
      return { overlaps: [...new Set(overlaps)], outside, cut, small, buttons: buttons.map((b) => b.n), width: Math.round(mr.width), lines: lines.length }
    })
    errors.push(...p.errors)
    await p.closeAll()
    if (!reached || !m || m.overlaps.length || m.outside.length || m.cut.length || m.small.length || m.buttons.length < 2) bad.push(`${appearance} conflict: ${JSON.stringify(m ?? { reached })}`)
    else notes.push(`${appearance}: conflict message ${m.width} px wide, ${m.lines} lines clear of ${m.buttons.join(" and ")}`)
    // 2. A long page: 40 recorded changes in the Recent changes table.
    servers.workspace.host = createMockHost()
    let rev = (await ops("site.read", { input: null })).revision
    for (let i = 0; i < 40; i++) rev = (await ops("site.write", { input: { siteName: `Name ${i}` }, expectedRevision: rev })).revision
    // A short phone (390 by 520) puts the table's announcement below the fold, where a region positioned outside the page's
    // scroller stretches the document (0.12.0 scrolled it 39 px and the top bar with it).
    const q = await open("workspace", { appearance, width: 390, height: 520, touch: true, hash: "module=site&section=general" })
    await poll(() => q.locator('[data-kit] [role="grid"] [role="row"]').count(), (n) => n > 20)
    await wait(400)
    const before = await q.evaluate(() => {
      // Every positioned element on the page must be placed inside the page's own scroller.
      const scroller = [...document.querySelectorAll("[data-kit] *")].find((e) => getComputedStyle(e).overflowY === "auto" && e.scrollHeight > e.clientHeight)
      const loose = [...document.querySelectorAll("[data-kit] *")].filter((e) => getComputedStyle(e).position === "absolute" && scroller?.contains(e) && !(e.offsetParent && (e.offsetParent === scroller || scroller.contains(e.offsetParent)))).map((e) => `${e.tagName.toLowerCase()}${e.getAttribute("role") ? `[${e.getAttribute("role")}]` : ""}.${String(e.className).slice(0, 20)}`)
      return { doc: document.documentElement.scrollHeight, body: document.body.scrollHeight, ih: innerHeight, loose }
    })
    // Scroll the module page to its end, then try to scroll the document as a finger or wheel would.
    await q.evaluate(() => {
      const s = [...document.querySelectorAll("[data-kit] *")].find((e) => getComputedStyle(e).overflowY === "auto" && e.scrollHeight > e.clientHeight)
      if (s) s.scrollTop = s.scrollHeight
    })
    await q.mouse.move(195, 400)
    await q.mouse.wheel(0, 4000)
    await wait(400)
    await q.evaluate(() => window.scrollTo(0, 100000))
    await wait(200)
    const after = await q.evaluate(() => ({ y: scrollY, header: Math.round(document.querySelector("header").getBoundingClientRect().top), scroller: [...document.querySelectorAll("[data-kit] *")].some((e) => getComputedStyle(e).overflowY === "auto" && e.scrollTop > 0) }))
    errors.push(...q.errors)
    await q.closeAll()
    if (before.loose.length || before.doc > before.ih || before.body > before.ih || after.y !== 0 || after.header !== 0 || !after.scroller) bad.push(`${appearance} long table: ${JSON.stringify({ before, after })}`)
    else notes.push(`${appearance}: with 41 changes the document stayed ${before.doc} px for a 390 by ${before.ih} px viewport, the page scrolled inside and the top bar stayed at 0`)
  }
  if (errors.length) bad.push(`page errors ${errors.slice(0, 2).join(" | ")}`)
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : `390 px with touch: ${notes.join("; ")}.`]
})

// ---------- Component library (LB-01 to LB-10, references/library.md) ----------

const LIBRARY_SECTIONS = ["Preview", "When to use", "When not to use", "Usage", "Examples", "API reference", "Keyboard", "Accessibility", "Motion", "Responsive behavior", "Performance", "Notes for AI"]
const railLibrary = (p) => p.locator('[aria-label="Studio"] nav[aria-label="Library"] button')
const libTitle = (p) => p.locator("[data-library-page] h1").first().textContent({ timeout: 500 }).catch(() => "")
/** Opens the library build (with its workspace host) at a link, waiting for the page title when the link names a component. */
const openLibrary = async (hash, o = {}) => {
  servers.library.host = createMockHost()
  const p = await open("library", { ...o, hash })
  if (/library=/.test(hash)) await poll(() => libTitle(p), Boolean, 8000)
  return p
}
const blockFrame = async (p, id) => (await p.locator(`[data-library-page] [data-preview-block="${id}"] iframe.opacity-100`).first().elementHandle())?.contentFrame()
const frameReady = (p, id, ms = 15000) => poll(() => p.locator(`[data-library-page] [data-preview-block="${id}"] iframe.opacity-100`).count(), (n) => n === 1, ms)
const toSection = (p, id) =>
  p.evaluate((section) => {
    const page = document.querySelector("[data-library-page]")
    page.scrollTop += document.querySelector(`#lib-${section}`).getBoundingClientRect().top - page.getBoundingClientRect().top
  }, id)

// LB-01 Without a library nothing changes: no library chunk is built or requested, no rail item or Go to group, at most 3 KB more
// initial chunk; with one, the navigation chunk loads at start, the page chunk when the library opens, and only that component's docs
await check("LB-01", async () => {
  const dir = join(root, ".acceptance", "normal", "assets")
  const files = readdirSync(dir)
  const gz = gzipSync(readFileSync(join(dir, files.find((f) => /^studio-.*\.js$/.test(f))))).length
  const growth = gz - STUDIO_CHUNK_BASELINE_GZ
  const built = files.filter((f) => /^(library-|example-library)/.test(f))
  const p = await open("normal", { hash: "view=inspect&scenario=tasks.list" })
  for (const name of ["Compare", "Gallery", "Design", "Inspect"]) {
    await railView(p, name).click()
    await wait(400)
  }
  await p.keyboard.press("ControlOrMeta+k")
  await wait(400)
  const headings = await p.locator("[cmdk-group-heading]").allTextContents()
  await p.keyboard.press("Escape")
  const requested = (await resources(p)).filter((u) => /\/(library-|example-library)/.test(u))
  const rail = await p.locator('nav[aria-label="Library"]').count()
  const errors = [...p.errors]
  await p.closeAll()
  const l = await openLibrary("view=inspect&scenario=tasks.list")
  const start = await resources(l)
  const navEarly = start.some((u) => /\/library-nav-/.test(u))
  const pageEarly = start.some((u) => /\/library-page-/.test(u))
  await railLibrary(l).click()
  await poll(() => libTitle(l), (t) => t === "Button", 8000)
  const after = await resources(l)
  const pageAfter = after.some((u) => /\/library-page-/.test(u))
  const button = after.some((u) => /\/button-[\w-]+\.js$/.test(u))
  const others = after.filter((u) => /\/(icon-button|text-field)-[\w-]+\.js$/.test(u)).length
  errors.push(...l.errors)
  await l.closeAll()
  const goTo = headings.some((h) => /Library/.test(h))
  const ok = growth <= 3072 && !built.length && !requested.length && rail === 0 && !goTo && navEarly && !pageEarly && pageAfter && button && others === 0 && !errors.length
  return [ok ? "pass" : "fail", `initial Studio chunk ${gz} bytes gzipped, ${growth >= 0 ? "+" : ""}${growth} against the ${STUDIO_CHUNK_BASELINE} baseline of ${STUDIO_CHUNK_BASELINE_GZ} (budget 3,072); without a library the build has ${built.length} library chunks, ${requested.length} were requested across the views and Go to, the rail has ${rail} library items and Go to ${goTo ? "lists" : "has no"} library group; with one, the navigation chunk loaded at start ${navEarly}, the page chunk before opening ${pageEarly} and after ${pageAfter}, the opened component's documentation ${button} and others ${others}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// LB-02 The library follows the workspace modules after a second divider with the views' marker and focus; Tab and Enter, the grouped
// list and its search, Go to, links and Back reach components; a view key leaves; leaving unsaved module changes asks; unknown links are named
await check("LB-02", async () => {
  const p = await openLibrary("view=inspect&scenario=tasks.list")
  const rail = await p.evaluate(() => {
    const studio = document.querySelector('[aria-label="Studio"]')
    const lib = studio.querySelector('nav[aria-label="Library"]')
    return { navs: [...studio.querySelectorAll("nav")].map((n) => n.getAttribute("aria-label")), divider: lib?.previousElementSibling?.getAttribute("role") === "separator", dividers: studio.querySelectorAll('[role="separator"]').length }
  })
  const marker = (selector) =>
    p.locator(selector).first().evaluate((el) => {
      const b = getComputedStyle(el, "::before")
      return `${b.width} ${b.backgroundColor}`
    })
  const viewMarker = await marker('[aria-label="Studio"] nav[aria-label="Views"] button[aria-pressed="true"]')
  await railModule(p, "Audit").focus()
  await p.keyboard.press("Tab")
  const focused = await p.evaluate(() => {
    const s = getComputedStyle(document.activeElement)
    return { text: document.activeElement?.textContent?.trim(), ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2 && parseFloat(s.outlineOffset) < 0 ? `inset outline ${s.outlineWidth} ${s.outlineColor}` : s.boxShadow }
  })
  await p.keyboard.press("Enter")
  await poll(() => libTitle(p), (t) => t === "Button", 8000)
  const libMarker = await marker('[aria-label="Studio"] nav[aria-label="Library"] button[aria-pressed="true"]')
  const opened = await p.evaluate(() => ({ hash: location.hash, crumbs: document.querySelector("header")?.innerText.replace(/\s+/g, " ") ?? "", views: document.querySelectorAll('[aria-label="Studio"] nav[aria-label="Views"] button[aria-pressed="true"]').length }))
  const list = await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Components"] [data-library-group]')].map((g) => `${g.querySelector("h3")?.textContent.trim()}:${[...g.querySelectorAll("button")].map((b) => b.textContent.trim()).join("|")}`))
  await p.locator("#library-search").fill("textbox")
  await wait(250)
  const found = await p.locator('nav[aria-label="Components"] button').allTextContents()
  await p.locator("#library-search").fill("")
  await p.locator('nav[aria-label="Components"] button', { hasText: "Text field" }).click()
  await poll(() => libTitle(p), (t) => t === "Text field")
  const back = []
  for (let i = 0; i < 2; i++) {
    await p.evaluate(() => history.back())
    await wait(900)
    back.push(await p.evaluate(() => ({ hash: location.hash, title: document.querySelector("[data-library-page] h1")?.textContent ?? null })))
  }
  await p.keyboard.press("ControlOrMeta+k")
  await wait(400)
  await p.keyboard.type("library icon button")
  await wait(300)
  await p.keyboard.press("Enter")
  await poll(() => libTitle(p), (t) => t === "Icon button")
  const viaGoTo = await p.evaluate(() => location.hash)
  await p.evaluate(() => document.activeElement?.blur())
  await p.keyboard.press("2")
  await wait(700)
  const left = await p.evaluate(() => ({ hash: location.hash, page: !!document.querySelector("[data-library-page]") }))
  await railModule(p, "Site").click()
  await poll(() => siteName(p).isVisible().catch(() => false), Boolean)
  await siteName(p).fill("Unsaved")
  await railLibrary(p).click()
  const asked = await poll(() => p.getByRole("dialog", { name: "Leave without saving?" }).isVisible().catch(() => false), Boolean, 3000)
  await p.keyboard.press("Escape")
  await wait(400)
  const stayed = await p.evaluate(() => ({ hash: location.hash, page: !!document.querySelector("[data-library-page]") }))
  const errors = [...p.errors]
  await p.closeAll()
  const l = await openLibrary("library=text-field&section=api")
  await wait(900)
  const linked = await l.evaluate(() => ({ title: document.querySelector("[data-library-page] h1")?.textContent, top: Math.round(document.querySelector("#lib-api").getBoundingClientRect().top - document.querySelector("[data-library-page]").getBoundingClientRect().top), pressed: !!document.querySelector('[aria-label="Studio"] nav[aria-label="Library"] button[aria-pressed="true"]') }))
  errors.push(...l.errors)
  await l.closeAll()
  const u = await openLibrary("library=nope")
  const named = await poll(() => u.getByText("That link names a component this Studio's library does not have").isVisible().catch(() => false), Boolean)
  await u.closeAll()
  const ok =
    rail.navs.join() === "Views,Workspace,Library" && rail.divider && rail.dividers === 2 && /^2px /.test(viewMarker) && libMarker === viewMarker && focused.text === "Library" && /inset/.test(focused.ring) &&
    /library=button/.test(opened.hash) && /Library/.test(opened.crumbs) && /Actions/.test(opened.crumbs) && /Button/.test(opened.crumbs) && opened.views === 0 &&
    list.join(";") === "Actions:Button|Icon button;Inputs:Text field|Switch" && found.join() === "Text field" &&
    back[0].title === "Button" && /view=inspect/.test(back[1].hash) && back[1].title === null && /library=icon-button/.test(viaGoTo) && /view=compare/.test(left.hash) && !left.page &&
    asked && /module=site/.test(stayed.hash) && !stayed.page && linked.title === "Text field" && linked.top >= -2 && linked.top < 80 && linked.pressed && named && !errors.length
  return [ok ? "pass" : "fail", `rail ${rail.navs.join(", ")} with ${rail.dividers} dividers${rail.divider ? ", one before the library" : ""}; marker ${viewMarker} on a view and ${libMarker} on the library; Tab from the last module reached "${focused.text}" with ${/inset/.test(focused.ring) ? "the inset ring" : "no ring"}; Enter opened ${opened.hash} (views pressed ${opened.views}; breadcrumb "${opened.crumbs.slice(0, 70)}"); the list read ${list.join("; ")}; "textbox" found ${found.join(", ")}; Back went to ${back.map((b) => b.title ?? b.hash).join(", then ")}; Go to opened ${viaGoTo}; the 2 key left to ${left.hash}; leaving unsaved Site changes for the library ${asked ? "asked" : "did not ask"} and Esc stayed on ${stayed.hash}; a link to API opened "${linked.title}" with the heading ${linked.top} px from the top; an unknown component link ${named ? "was named in a toast" : "was not named"}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// LB-03 Twelve sections in order with a matching outline of buttons; choosing an entry scrolls there and writes section= without a
// history entry; scrolling marks the section on screen; rich text renders; a missing section and missing documentation say so
await check("LB-03", async () => {
  const p = await openLibrary("library=button")
  await wait(600)
  const headings = await p.evaluate(() => [...document.querySelectorAll("[data-library-page] section[data-section] > h2")].map((h) => h.textContent.trim()))
  const outline = await p.locator('nav[aria-label="On this page"] button').allTextContents()
  const anchors = await p.evaluate(() => document.querySelectorAll('[data-library-page] a, nav[aria-label="On this page"] a').length)
  const before = await p.evaluate(() => history.length)
  await p.locator('nav[aria-label="On this page"] button', { hasText: "Accessibility" }).click()
  await wait(1200)
  const jumped = await p.evaluate(() => ({ top: Math.round(document.querySelector("#lib-accessibility").getBoundingClientRect().top - document.querySelector("[data-library-page]").getBoundingClientRect().top), hash: location.hash, length: history.length, current: document.querySelector('nav[aria-label="On this page"] [aria-current="location"]')?.textContent?.trim() }))
  await toSection(p, "motion")
  await wait(500)
  const spy = await p.evaluate(() => document.querySelector('nav[aria-label="On this page"] [aria-current="location"]')?.textContent?.trim())
  const rich = await p.evaluate(() => {
    const page = document.querySelector("[data-library-page]")
    return { lists: page.querySelectorAll("section[data-section] ul, section[data-section] ol").length, tables: page.querySelectorAll("section[data-section] table").length, inline: page.querySelectorAll("section[data-section] p code").length, code: page.querySelectorAll("section[data-section] .library-code pre").length, callouts: page.querySelectorAll('section[data-section] [role="note"]').length, refs: page.querySelectorAll("section[data-section] button[data-inline]").length }
  })
  await p.locator("[data-library-page] button[data-inline]", { hasText: "Icon button" }).first().click()
  const followed = await poll(() => libTitle(p), (t) => t === "Icon button")
  const errors = [...p.errors]
  await p.closeAll()
  const t = await openLibrary("library=text-field")
  const gaps = await t.evaluate(() => [...document.querySelectorAll("[data-library-page] section[data-section]")].filter((s) => s.textContent.includes("Not documented yet.")).map((s) => s.dataset.section))
  errors.push(...t.errors)
  await t.closeAll()
  const w = await openLibrary("library=switch")
  const none = await w.getByText("Switch has no documentation yet").isVisible().catch(() => false)
  errors.push(...w.errors)
  await w.closeAll()
  const ok = headings.join("|") === LIBRARY_SECTIONS.join("|") && outline.join("|") === LIBRARY_SECTIONS.join("|") && anchors === 0 && jumped.top >= -2 && jumped.top <= 40 && /section=accessibility/.test(jumped.hash) && jumped.length === before && jumped.current === "Accessibility" && spy === "Motion" && rich.lists >= 2 && rich.tables >= 2 && rich.inline >= 1 && rich.code >= 1 && rich.callouts >= 1 && rich.refs >= 1 && followed === "Icon button" && gaps.join() === "performance" && none && !errors.length
  return [ok ? "pass" : "fail", `headings ${headings.length} (${headings.join(", ")}); outline ${outline.length} buttons, ${anchors} anchors; Accessibility scrolled to ${jumped.top} px with ${jumped.hash} and history ${before} then ${jumped.length}, marked ${jumped.current}; scrolling to Motion marked ${spy}; rich text ${JSON.stringify(rich)}; the inline reference opened ${followed}; Text field gaps ${gaps.join(", ") || "none"}; Switch ${none ? "says it has no documentation yet" : "gave no reason"}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// LB-04 Each preview group is one labelled frame with all its variants; Phone width resizes the same runtime; Code shows highlighted code
// and Copy copies it exactly; focus enters the frame from the tabs and leaves it; Expand shows one frame in a dialog and none on the page
await check("LB-04", async () => {
  const p = await openLibrary("library=button")
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"])
  for (const id of ["playground", "styles", "sizes", "states"]) await frameReady(p, id)
  const groups = await p.evaluate(() => [...document.querySelectorAll("#lib-preview [data-preview-block]")].map((b) => `${b.dataset.previewBlock}:${b.querySelector("h3")?.textContent.trim()}:${b.querySelectorAll("iframe").length}`))
  const styles = await blockFrame(p, "styles")
  const variants = await styles.evaluate(() => document.querySelectorAll("[data-sample]").length)
  const mounts = await styles.evaluate(() => window.__libMounts)
  const block = p.locator('[data-library-page] [data-preview-block="styles"]')
  await block.getByRole("button", { name: "Phone width" }).click()
  await wait(900)
  const phone = await p.evaluate(() => ({ width: document.querySelector('[data-library-page] [data-preview-block="styles"] iframe.opacity-100')?.style.width, frames: document.querySelectorAll('[data-library-page] [data-preview-block="styles"] iframe').length }))
  const inside = await (await blockFrame(p, "styles")).evaluate(() => ({ mounts: window.__libMounts, width: innerWidth }))
  await block.getByRole("tab", { name: "Code" }).click()
  await wait(300)
  const code = await block.evaluate((b) => {
    const pre = b.querySelector(".library-code pre")
    return { spans: pre?.querySelectorAll("span[class^='tok-']").length ?? 0, text: pre?.textContent ?? "" }
  })
  await block.locator("button", { hasText: "Copy" }).click()
  await wait(300)
  const copied = await p.evaluate(() => navigator.clipboard.readText())
  await block.getByRole("tab", { name: "Preview" }).click()
  await wait(300)
  await block.getByRole("tab", { name: "Preview" }).focus()
  let entered = false
  let left = false
  for (let i = 0; i < 4 && !entered; i++) {
    await p.keyboard.press("Tab")
    entered = await p.evaluate(() => document.activeElement?.tagName === "IFRAME")
  }
  for (let i = 0; i < 12 && entered && !left; i++) {
    await p.keyboard.press("Tab")
    left = await p.evaluate(() => document.activeElement?.tagName !== "IFRAME" && document.activeElement !== document.body)
  }
  const expand = block.getByRole("button", { name: "Expand Styles" })
  await expand.focus()
  await p.keyboard.press("Enter")
  await poll(() => p.locator('[role="dialog"] iframe.opacity-100').count(), (n) => n === 1, 15000)
  const expanded = await p.evaluate(() => ({ dialog: document.querySelectorAll('[role="dialog"] iframe').length, page: document.querySelectorAll("[data-library-page] iframe").length }))
  await p.keyboard.press("Escape")
  await wait(700)
  const returned = await p.evaluate(() => document.activeElement?.getAttribute("aria-label"))
  const errors = [...p.errors]
  await p.closeAll()
  const ok = groups.join() === "playground:Playground:1,styles:Styles:1,sizes:Sizes:1,states:States:1" && variants === 3 && phone.width === "390px" && phone.frames === 1 && inside.mounts === mounts && inside.width === 390 && code.spans > 0 && copied === code.text && copied.includes('variant="danger"') && entered && left && expanded.dialog === 1 && expanded.page === 0 && returned === "Expand Styles" && !errors.length
  return [ok ? "pass" : "fail", `groups ${groups.join(", ")}; the Styles frame shows ${variants} variants; Phone width set the frame to ${phone.width} with ${phone.frames} frame, mounts ${mounts} then ${inside.mounts}, inner width ${inside.width}; Code drew ${code.spans} token spans and Copy ${copied === code.text ? "copied it exactly" : `copied "${copied.slice(0, 30)}"`}; focus ${entered ? "entered the frame" : "never entered the frame"} and ${left ? "left it" : "stayed"}; Expand showed ${expanded.dialog} frame in the dialog and ${expanded.page} on the page; Esc returned focus to ${returned}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// LB-05 Frames mount only near the viewport, never more than LIVE_FRAMES at rest, nearest first; frames far above unmount when
// scrolling down; every preview keeps its height whether live or not
await check("LB-05", async () => {
  const p = await openLibrary("library=button")
  await frameReady(p, "playground")
  await wait(2500)
  const sample = () =>
    p.evaluate(() => {
      const blocks = [...document.querySelectorAll("[data-library-page] [data-preview-block]")]
      return { frames: document.querySelectorAll("[data-library-page] iframe").length, live: blocks.filter((b) => b.dataset.live === "true").map((b) => b.dataset.previewBlock), blocks: blocks.map((b) => b.dataset.previewBlock), heights: Object.fromEntries(blocks.map((b) => [b.dataset.previewBlock, Math.round(b.querySelector(".stage-surface").getBoundingClientRect().height)])) }
    })
  const top = await sample()
  const target = await p.evaluate(() => {
    const page = document.querySelector("[data-library-page]")
    return page.scrollTop + document.querySelector("#lib-examples").getBoundingClientRect().top - page.getBoundingClientRect().top
  })
  const counts = []
  for (let i = 1; i <= 6; i++) {
    await p.evaluate(([y, k]) => {
      document.querySelector("[data-library-page]").scrollTop = (y * k) / 6
    }, [target, i])
    await wait(450)
    counts.push((await sample()).frames)
  }
  await wait(2500)
  const end = await sample()
  const errors = [...p.errors]
  await p.closeAll()
  const kept = Object.keys(top.heights).every((id) => Math.abs(top.heights[id] - end.heights[id]) <= 1)
  const ok = top.blocks.join() === "playground,styles,sizes,states,with-icon,in-a-row" && top.live.length === 4 && top.frames === 4 && !top.live.includes("in-a-row") && Math.max(...counts) <= 5 && end.live.includes("with-icon") && end.live.includes("in-a-row") && !end.live.includes("playground") && end.frames <= 4 && kept && !errors.length
  return [ok ? "pass" : "fail", `${top.blocks.length} previews; at the top ${top.frames} frames live (${top.live.join(", ")}); while scrolling to Examples ${counts.join(", ")} frames; at Examples ${end.frames} live (${end.live.join(", ")}); every preview kept its height ${kept}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// LB-06 The playground changes the frame in place (one mount), sends only declared properties, refuses an over-long label with a
// reason, resets, and the theme and Contrast controls reach every frame
await check("LB-06", async () => {
  const p = await openLibrary("library=button")
  await frameReady(p, "playground")
  await frameReady(p, "styles")
  const state = async () =>
    (await blockFrame(p, "playground"))?.evaluate(() => {
      const b = document.querySelector("[data-sample]")
      return { mounts: window.__libMounts, values: window.__libValues, text: b?.textContent.trim(), variant: b?.dataset.variant, disabled: b?.disabled, theme: document.documentElement.dataset.theme }
    })
  const before = await state()
  const details = p.locator('aside[aria-label="Details"]')
  await details.getByLabel("Label", { exact: true }).fill("Publish")
  await details.getByRole("combobox", { name: "Variant" }).click()
  await p.getByRole("option", { name: "Danger" }).click()
  await details.getByRole("switch", { name: "Disabled" }).click()
  const after = await poll(state, (s) => s?.text === "Publish" && s?.variant === "danger" && s?.disabled === true)
  await details.getByLabel("Label", { exact: true }).fill("x".repeat(81))
  await wait(600)
  const refused = await state()
  const reason = await details.getByText("At most 80 characters on one line").isVisible().catch(() => false)
  await details.getByRole("button", { name: "Reset" }).click()
  const reset = await poll(state, (s) => s?.text === "Save changes" && s?.variant === "primary" && s?.disabled === false)
  await details.getByRole("combobox", { name: "Theme" }).click()
  await p.getByRole("option", { name: "Dark", exact: true }).click()
  const dark = await poll(state, (s) => s?.theme === "dark", 15000)
  await details.getByRole("switch", { name: "Contrast" }).click()
  const contrast = await poll(state, (s) => s?.theme === "dark-contrast", 15000)
  const styles = await poll(async () => (await blockFrame(p, "styles"))?.evaluate(() => document.documentElement.dataset.theme), (t) => t === "dark-contrast", 15000)
  const errors = [...p.errors]
  await p.closeAll()
  const keys = Object.keys(after?.values ?? {}).sort().join()
  const ok = before?.mounts === 1 && after?.mounts === 1 && keys === "disabled,label,size,variant" && refused?.mounts === 1 && refused?.text === "Save changes" && reason && reset?.mounts === 1 && dark?.theme === "dark" && contrast?.theme === "dark-contrast" && styles === "dark-contrast" && !errors.length
  return [ok ? "pass" : "fail", `before ${JSON.stringify(before)}; after editing ${JSON.stringify(after)} (sent ${keys}); an 81-character label left the frame on "${refused?.text}" with ${reason ? "the reason shown" : "no reason"} after ${refused?.mounts} mount; Reset showed "${reset?.text}" after ${reset?.mounts} mount; theme ${dark?.theme}, then Contrast ${contrast?.theme}, Styles ${styles}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// LB-07 An adapted page states its source, version and notice; every adjusted section, item, row and example says so in visible text;
// a hand-written page shows no source
await check("LB-07", async () => {
  const p = await openLibrary("library=button")
  const source = await p.locator("[data-provenance]").innerText().catch(() => "")
  const notice = await p.getByText("Adapted from the Example UI 2.4.0 documentation.").count()
  const marks = await p.evaluate(() => [...document.querySelectorAll("[data-library-page] [data-adjusted]")].map((e) => ({ text: e.textContent.replace(/\s+/g, " ").trim(), shown: e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== "hidden" })))
  const errors = [...p.errors]
  await p.closeAll()
  const h = await openLibrary("library=icon-button")
  const hand = await h.evaluate(() => ({ source: document.querySelectorAll("[data-provenance]").length, marks: document.querySelectorAll("[data-library-page] [data-adjusted]").length }))
  errors.push(...h.errors)
  await h.closeAll()
  const expected = ["Busy shows a spinner and keeps its label", "Points to this product's Icon button", "Actions sit at the end of the row in this product", "Defaults to button, so it never submits a form by accident", "Touch targets are at least 44 px in this product"]
  const reasons = marks.map((m) => m.text.replace(/^Adjusted for Example Tasks: /, ""))
  const ok = /^Documentation from Example UI 2\.4\.0, adjusted for Example Tasks where marked\.$/.test(source.trim()) && notice === 1 && marks.length === 5 && marks.every((m) => m.shown && /^Adjusted for Example Tasks: \S/.test(m.text)) && expected.every((r) => reasons.includes(r)) && hand.source === 0 && hand.marks === 0 && !errors.length
  return [ok ? "pass" : "fail", `source "${source.trim()}", notice shown ${notice}; ${marks.length} adjusted marks: ${marks.map((m) => m.text).join(" | ")}; the hand-written page shows ${hand.source} source lines and ${hand.marks} marks; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

// LB-08 Library pages, the component list and the sidebar meet the AA text, visible focus, 44 px and 16 px touch, reduced-motion and
// forced-color floors in both appearances
await check("LB-08", async () => {
  const notes = []
  const errors = []
  let ok = true
  for (const appearance of ["light", "dark"]) {
    const p = await openLibrary("library=button", { appearance })
    await frameReady(p, "playground")
    await wait(600)
    const low = await contrast(p)
    await unfocused(p)
    const focus = await tabWalk(p, false)
    await p.emulateMedia({ reducedMotion: "reduce" })
    const moving = await p.evaluate(() => [...document.querySelectorAll("[data-kit], [data-kit] *")].filter((e) => {
      const s = getComputedStyle(e)
      return (s.animationName !== "none" && parseFloat(s.animationDuration) > 0) || s.transitionDuration.split(",").some((d) => parseFloat(d) > 0)
    }).length)
    await p.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" })
    await unfocused(p)
    const forced = await tabWalk(p, true)
    const borderless = await boundaryless(p)
    errors.push(...p.errors)
    await p.closeAll()
    const touch = {}
    for (const width of [390, 768]) {
      const t = await openLibrary("library=button", { appearance, width, height: 844, touch: true })
      await wait(800)
      if (width < 768) {
        await t.locator('header button[aria-label="Details"]').click()
        await wait(700)
      }
      touch[width] = await kitTargets(t)
      errors.push(...t.errors)
      await t.closeAll()
    }
    const small = Object.entries(touch).flatMap(([w, m]) => [...m.small.map((x) => `${w}: ${x.n} ${x.w}x${x.h}`), ...m.smallText.map((x) => `${w}: ${x.n} text ${x.text}px`), ...(m.count ? [] : [`${w}: no controls`])])
    const fine = !low.length && focus.reached >= 6 && !focus.lost.length && !focus.faint.length && moving === 0 && forced.reached >= 6 && !forced.lost.length && !borderless.length && !small.length
    ok &&= fine
    notes.push(`${appearance}: text below AA ${low.length ? low.slice(0, 4).join(", ") : "none"}; focus visible on ${focus.reached - focus.lost.length} of ${focus.reached} stops${focus.lost.length ? ` (none on ${focus.lost.join(", ")})` : ""}, lowest ${focus.min.toFixed(2)}:1${focus.faint.length ? ` (under 3:1 on ${focus.faint.join(", ")})` : ""}; ${moving} elements moving under reduced motion; in forced colors focus outlined on ${forced.reached - forced.lost.length} of ${forced.reached}${borderless.length ? `, without a drawn boundary ${borderless.slice(0, 4).join(", ")}` : ", every control keeps a boundary"}; touch ${small.length ? `misses ${small.slice(0, 6).join(", ")}` : "every target at least 44 px with 16 px input text at 390 px (Details open) and 768 px"}`)
  }
  if (errors.length) {
    ok = false
    notes.push(`page errors ${errors.slice(0, 2).join(" | ")}`)
  }
  return [ok ? "pass" : "fail", `${notes.join("; ")}. Forced colors is Chromium's emulation; assistive technologies are not covered.`]
})

// LB-09 At 360 to 430 px the library opens from the bottom bar, its list from the Panel drawer and its outline from the top bar's
// Details, with 44 px targets and no sideways scroll
await check("LB-09", async () => {
  const bad = []
  const errors = []
  for (const width of [360, 390, 430]) {
    const p = await openLibrary("view=inspect&scenario=tasks.list", { width, height: 844, touch: true })
    const bar = await p.evaluate(() => ({ entries: [...document.querySelectorAll('nav[aria-label="Views"] button')].map((b) => b.textContent.trim()), doc: document.documentElement.scrollWidth, iw: innerWidth }))
    await p.locator('nav[aria-label="Views"] button', { hasText: "Workspace" }).click()
    await wait(700)
    await p.getByRole("dialog").getByRole("button", { name: "Library", exact: true }).click()
    await wait(900)
    const listed = await p.getByRole("dialog").locator('nav[aria-label="Components"] button').allTextContents()
    const small = await p.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] button:not([data-inline]), nav[aria-label="Views"] button, header button')]
        .filter((e) => e.offsetParent)
        .map((e) => {
          const r = e.getBoundingClientRect()
          return { n: e.getAttribute("aria-label") || e.textContent.trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height) }
        })
        .filter((r) => r.w < 44 || r.h < 44)
    )
    await p.getByRole("dialog").locator('nav[aria-label="Components"] button', { hasText: "Text field" }).click()
    await poll(() => libTitle(p), (t) => t === "Text field")
    await wait(700)
    const page = await p.evaluate(() => {
      const wide = [...document.querySelectorAll("body *")].filter((e) => e.scrollWidth > innerWidth + 1 && !["auto", "scroll"].includes(getComputedStyle(e).overflowX) && !e.closest(".preview-frame, pre, [role='region']"))
      return { doc: document.documentElement.scrollWidth, iw: innerWidth, wide: wide.map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 24)}`).slice(0, 4), dialogs: document.querySelectorAll('[role="dialog"]').length }
    })
    await p.locator('header button[aria-label="Details"]').click()
    await wait(700)
    const outline = await p.getByRole("dialog").locator('nav[aria-label="On this page"] button').count()
    const sidebar = await kitTargets(p)
    errors.push(...p.errors)
    await p.closeAll()
    const fine = bar.doc <= bar.iw && bar.entries.includes("Workspace") && !bar.entries.includes("Library") && listed.join() === "Button,Icon button,Text field,Switch" && !small.length && page.doc <= page.iw && !page.wide.length && page.dialogs === 0 && outline === 12 && !sidebar.small.length && !sidebar.smallText.length
    if (!fine) bad.push(`${width}: ${JSON.stringify({ bar, listed, small, page, outline, small2: sidebar.small, text: sidebar.smallText })}`)
  }
  if (errors.length) bad.push(`page errors ${errors.slice(0, 2).join(" | ")}`)
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : "at 360, 390 and 430 px the bottom bar's Workspace drawer listed Library, which opened its component list (Button, Icon button, Text field, Switch) in the Panel drawer; choosing Text field closed it; the top bar's Details opened On this page with 12 entries and the playground; every bar, header, drawer and sidebar target is at least 44 px with 16 px input text; nothing scrolls sideways (code and tables scroll inside themselves). Real devices and swipe are not covered."]
})

// LB-10 The built Studio, served as static files, renders documentation and live previews; every frame loads the declared entry on the
// frame origin; a capture shows its image labelled Static capture with no frame; no request leaves the Studio's origin
await check("LB-10", async () => {
  const p = await openLibrary("library=button")
  await frameReady(p, "playground")
  await toSection(p, "examples")
  await wait(2500)
  const entry = `${servers.library.url}example/library/frame.html`
  const srcs = await p.evaluate(() => [...document.querySelectorAll("iframe")].map((f) => f.src))
  const urls = []
  for (const f of p.frames()) urls.push(f.url(), ...(await f.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name)).catch(() => [])))
  const foreign = [...new Set(urls.filter((u) => u && !u.startsWith(servers.library.url) && !u.startsWith("data:") && u !== "about:blank"))]
  const docs = await p.evaluate(() => ({ sections: document.querySelectorAll("[data-library-page] section[data-section]").length, code: document.querySelectorAll("[data-library-page] .library-code").length }))
  const errors = [...p.errors]
  await p.closeAll()
  const c = await openLibrary("library=icon-button")
  await wait(1500)
  const capture = await c.evaluate(() => {
    const b = document.querySelector('[data-library-page] [data-preview-block="pressed"]')
    const img = b?.querySelector("img")
    return { frames: b?.querySelectorAll("iframe").length ?? -1, loaded: !!img && img.complete && img.naturalWidth > 0, alt: img?.alt ?? "", label: !!b?.textContent.includes("Static capture") }
  })
  errors.push(...c.errors)
  await c.closeAll()
  const ok = srcs.length >= 1 && srcs.every((s) => s === entry) && !foreign.length && docs.sections === 12 && docs.code >= 1 && capture.frames === 0 && capture.loaded && !!capture.alt && capture.label && !errors.length
  return [ok ? "pass" : "fail", `served from the built files: ${docs.sections} sections and ${docs.code} code samples; ${srcs.length} frames, ${srcs.every((s) => s === entry) ? "every one" : "not every one"} at ${entry.replace(servers.library.url, "./")}; requests off the Studio's origin ${foreign.length ? foreign.slice(0, 3).join(", ") : "none"}; the Pressed capture loaded ${capture.loaded} with alt "${capture.alt}", ${capture.frames} frames and ${capture.label ? "the Static capture label" : "no label"}; page errors ${errors.length ? errors.slice(0, 2).join(" | ") : "none"}`]
})

await browser.close()
for (const s of Object.values(servers)) s.server.close()
writeFileSync(join(root, "acceptance-report.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + "\n")
const failed = results.filter((r) => r.status === "fail")
console.log(`\n${results.length - failed.length} of ${results.length} criteria not failing; report written to acceptance-report.json`)
process.exit(failed.length ? 1 : 0)

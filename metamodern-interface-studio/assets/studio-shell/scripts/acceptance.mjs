#!/usr/bin/env node
/*
 * Measures the shell against the acceptance criteria in the skill's shell.md.
 * It builds the Studio three ways (the example product, a 1,000-scenario stress
 * adapter, and a capture-only adapter), serves them locally, and drives them
 * in headless Chromium. It needs Playwright: `npm i -D playwright` and
 * `npx playwright install chromium`, or set PLAYWRIGHT_MODULE to an existing
 * install. Results print as a table and are written to acceptance-report.json.
 * A result is pass, fail, or not-measured; nothing is inferred. Set ONLY=AC-03,AC-10 to run a subset.
 */
import { execFileSync, spawn } from "node:child_process"
import { copyFileSync, createReadStream, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"
import { gzipSync } from "node:zlib"

const root = new URL("..", import.meta.url).pathname
let chromium
try {
  ;({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright"))
} catch {
  console.error("Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`, or set PLAYWRIGHT_MODULE.")
  process.exit(2)
}

const builds = { normal: "example", stress: "synthetic", captures: "captures" }
const servers = {}
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".jpg": "image/jpeg" }
for (const [name, variant] of Object.entries(builds)) {
  const out = join(root, ".acceptance", name)
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { cwd: root, env: { ...process.env, ...(variant ? { VITE_STUDIO_ADAPTER: variant } : {}) }, stdio: "inherit" })
  const server = createServer((req, res) => {
    const path = normalize(join(out, decodeURIComponent(new URL(req.url, "http://x").pathname)))
    const file = path.startsWith(out) && existsSync(path) && statSync(path).isFile() ? path : join(out, "index.html")
    res.setHeader("content-type", mime[extname(file)] ?? "application/octet-stream")
    createReadStream(file).pipe(res)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  servers[name] = { server, url: `http://127.0.0.1:${server.address().port}/` }
}

const browser = await chromium.launch()
const results = []
const record = (id, status, detail) => {
  results.push({ id, status, detail })
  console.log(`${status.toUpperCase().padEnd(12)} ${id}  ${detail}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(name, { width = 1440, height = 900, touch = false, hash = "", appearance } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, colorScheme: appearance ?? "light" })
  if (appearance) await context.addInitScript((a) => localStorage.setItem("studio.appearance", a), appearance)
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
    const ok = presetSave === 0 && written.schema === "studio-layouts/1" && written.layouts[0]?.name === "Checkout sizes" && written.layouts[0].frames.length === 2 && restored.join() === "390 × 844,430 × 932" && two.join("|") === "Checkout sizes, renamed|Checkout sizes, renamed copy" && one.join("|") === "Checkout sizes, renamed" && cross === 403 && invalid === 422 && huge === 413 && builtSave && reason > 0 && kept === 2 && unsaved > 0 && shared === 2 && /frames=/.test(link)
    return [ok ? "pass" : "fail", `a preset offers no Save (${presetSave}); Save as wrote ${written.layouts.length} layout "${written.layouts[0]?.name}" with ${written.layouts[0]?.frames.length} frames, restored after a reload as ${restored.join(", ")}; rename and duplicate gave ${two.join(" and ")} (the copy opens), and deleting the copy left ${one.join(", ")}; the endpoint answered ${cross} to another origin, ${invalid} to an invalid file, ${huge} to an oversized one; a built Studio disables Save as (${builtSave}) and says why, kept ${kept} unsaved frames across a reload marked Unsaved, and its link opened ${shared} frames in a fresh browser`]
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
  const retried = /Showing previous/.test(bad.status) && /Draft the quarterly plan/.test(bad.text) && /Ready/.test(goodStatus) && good.mounted.values.title === "A title it can show" && /A title it can show/.test(good.text)
  return [live && fallback && recovered && retried ? "pass" : "fail", `one document mounted ${after.mounts} time(s) across four edits, ${iframes} frame; the frame received done ${JSON.stringify(u.done)} (${typeof u.done}), title "${u.title}", assignee ${JSON.stringify(u.assignee)}, estimate ${JSON.stringify(u.estimate)}; it shows "${after.text}"; without live-values the change remounted with done ${legacy.mounted.values.done} ("${legacyStatus}"); when update threw, a new document (${replaced}) mounted with done ${thrown.mounted.values.done} ("${thrownStatus}"); a title the product rejects gave "${bad.status}" over "${bad.text}", then a good one mounted "${good.mounted.values.title}" ("${goodStatus}")`]
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
    const ok = written.schema === "studio-scenarios/1" && s0.id === "saved.finished-card" && s0.base === CARD && s0.label === "Finished card" && s0.values?.done === true && selected === s0.id && /Finished card/.test(row) && /Saved/.test(row) && /Finished card/.test(title) && mounted.scenario === CARD && mounted.values.done === true && two.join("|") === "Finished card, renamed|Finished card, renamed copy" && one.join("|") === "Finished card, renamed" && cross === 403 && invalid === 422 && generated === 422 && huge === 413 && builtSave && reason > 0 && copy === 1 && marker === "kept" && copyRow === 1 && deletedRow === 0 && /cannot be overwritten/.test(clientRefuses) && copied.base === CARD && copied.values?.done === true && /^saved\./.test(copied.id ?? "") && shownJson.base === CARD && shownJson.values?.done === true
    return [ok ? "pass" : "fail", `Save as wrote ${written.scenarios.length} state ${s0.id} from ${s0.base} with ${JSON.stringify(s0.values)} and selected it (${selected}); after a reload the catalog row reads "${row.replace(/\s+/g, " ")}", Details "${title}", the frame mounted ${mounted.scenario} with done ${mounted.values.done}; rename and duplicate gave ${two.join(" and ")}, delete left ${one.join(", ")}; the endpoint answered ${cross} to another origin, ${invalid} to an invalid file, ${generated} to a generated ID, ${huge} to an oversized one; a built Studio disables Save as scenario (${builtSave}), says why (${reason}) and offers Copy as JSON (${copy}); in the page that created the file the marker was ${marker}, the duplicate's row showed (${copyRow}) and was gone after Delete (${deletedRow}); the client refuses a generated ID (${clientRefuses ? "yes" : "no"}); Copy as JSON gave ${copied.id} from ${copied.base} with ${JSON.stringify(copied.values)}, and without a clipboard showed ${shownJson.base} with ${JSON.stringify(shownJson.values)} to select`]
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
  await p.closeAll()
  const ok = axes.includes("Done") && axes.includes("Assignee") && axes.includes("Estimate (hours)") && !axes.includes("Title") && !axes.includes("Note") && !axes.includes("On open") && done.join() === "false,true" && new Set(who).size === 2
  return [ok ? "pass" : "fail", `axes offered ${axes.join(", ")}; Done sides ${sides.map((x) => x.replace(/\s+/g, " ").trim()).join(" | ")} rendered done ${done.join(" and ")}; Assignee sides showed ${who.join(" and ")}`]
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
  const ok = /<TaskCard/.test(shown) && /title="Ship it"/.test(shown) && /\bdone\b/.test(shown) && !/assignee/.test(shown) && copied === shown && !without.includes("Code")
  return [ok ? "pass" : "fail", `with the capability the Code tab showed ${JSON.stringify(shown)} (only changed props) and Copy put the same text on the clipboard (${copied === shown}); a frame without it shows tabs ${without.join(", ")}`]
})

await browser.close()
for (const s of Object.values(servers)) s.server.close()
writeFileSync(join(root, "acceptance-report.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + "\n")
const failed = results.filter((r) => r.status === "fail")
console.log(`\n${results.length - failed.length} of ${results.length} criteria not failing; report written to acceptance-report.json`)
process.exit(failed.length ? 1 : 0)

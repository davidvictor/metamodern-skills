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
import { copyFileSync, createReadStream, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize } from "node:path"

const root = new URL("..", import.meta.url).pathname
let chromium
try {
  ;({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright"))
} catch {
  console.error("Playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`, or set PLAYWRIGHT_MODULE.")
  process.exit(2)
}

const builds = { normal: undefined, stress: "synthetic", captures: "captures" }
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
    for (const view of ["inspect", "compare", "gallery", "present", "design"]) {
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
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : "5 views at 360, 390 and 430 px: document and every wide region fit"]
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
// Light appearance: the edge reaches 3:1 against a keyline. Dark appearance: the inner keyline is a deliberate faint
// hairline, so the edge only has to stay distinguishable (1.3:1) while the four corner ticks carry the 3:1 boundary.
await check("AC-10", async () => {
  const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  const rows = []
  const worst = { light: 99, dark: 99 }
  const need = { light: 3, dark: 1.3 }
  let ticksWorst = 99
  let structure = true
  for (const appearance of ["light", "dark"]) {
    const p = await open("normal", { appearance, hash: "view=inspect" })
    await p.keyboard.press("Shift+Digit0")
    await wait(600)
    const shell = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const stage = await p.evaluate(() => getComputedStyle(document.querySelector(".stage-surface")).backgroundColor)
    const frame = p.frames().find((f) => f !== p.mainFrame())
    const ticks = await p.locator(".preview-ticks i").count()
    const fidelityShown = await p.getByText("Illustrative example").first().isVisible().catch(() => false)
    // Tick colour composited over the stage, as pixels.
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
  return [ok ? "pass" : "fail", `worst edge contrast ${worst.light.toFixed(1)}:1 in light (needs 3) and ${worst.dark.toFixed(1)}:1 in dark (needs 1.3, a hairline by design) across ${rows.length} fixtures (${rows.join(", ")}); corner ticks ${ticksWorst.toFixed(1)}:1 against the stage (needs 3); four ticks and the fidelity statement in Details ${structure ? "present" : "missing"}`]
})

// AC-11 Scale is always disclosed, with 100% one action away
await check("AC-11", async () => {
  const bad = []
  for (const width of [1440, 1024, 390]) {
    for (const view of ["inspect", "compare", "present", "design", "gallery"]) {
      const p = await open("normal", { width, height: 900, touch: width < 768, hash: `view=${view}` })
      const text = await p.locator("body").innerText()
      // Inspect states size in the Size control and scale in the Zoom control; the other views carry a chip under the frame.
      const said = view === "gallery" ? /thumbnails at about \d+%/.test(text) : view === "inspect" ? /\d+ × \d+/.test(text) && /Fit · \d+%|\b\d+%/.test(text) : /\d+ × \d+ · (\d+%|actual size)/.test(text)
      const action = view === "gallery" ? true : (await p.getByRole("button", { name: /Show at actual size|Fit to the stage/ }).count()) > 0 || (await p.getByRole("button", { name: /^Zoom/ }).count()) > 0
      if (!said || !action) bad.push(`${view}@${width}${said ? "" : " no scale"}${action ? "" : " no action"}`)
      await p.closeAll()
    }
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : "5 views at 1440, 1024 and 390 px state size and percentage; a 100% or Fit action is present (Gallery states its thumbnail scale and a card opens Inspect)"]
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
  const names = ["Inspect", "Compare", "Gallery", "Present", "Design"]
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
  const btn = () => p.getByRole("button", { name: /^Density,/ })
  const designed = await btn().getAttribute("aria-label")
  await btn().click()
  await p.getByRole("menuitemradio").first().waitFor()
  const offered = await p.getByRole("menuitemradio").allInnerTexts()
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
  const hidden = await q.getByRole("button", { name: /^Density,/ }).count()
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
const chip = (p) => p.locator('[aria-label="Scale"]').innerText()
async function allReady(p, n, timeout = 30000) {
  await p.waitForFunction((count) => new RegExp(`^${count} frames · ${count} ready`).test(document.querySelector('[aria-label="Scale"]')?.textContent?.trim() ?? ""), n, { timeout })
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

// AC-19 One shared scale, stated once; widths proportional within 1 px; no page scroll from 360 to 1600 px; below the floor only the stage scrolls
await check("AC-19", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phone-tablet-laptop" })
  await allReady(p, 3)
  const rects = await p.locator("[data-frame] .preview-frame").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))
  // The chip rounds the percentage; the frames share the exact scale, read from the first frame.
  const k = rects[0] / 390
  const stated = await scaleOf(p)
  const drift = Math.max(...[390, 834, 1280].map((w, i) => Math.abs(rects[i] - w * k))) + (Math.abs(stated - k) > 0.006 ? 100 : 0)
  const hundred = await p.getByRole("button", { name: "Show at actual size" }).count()
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

// AC-20 Frames differ only in size and profile; a change restages all with the previous shown until ready; interaction modifies one frame; an error stays in its frame
await check("AC-20", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phone-tablet-laptop" })
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

// AC-22 Reorder by pointer on the label, and by Alt plus an arrow key on a label or list row; focus stays and the move is announced
await check("AC-22", async () => {
  const p = await open("normal", { hash: "view=responsive&scenario=tasks.list&layout=phones" })
  await allReady(p, 3)
  const order = () => p.locator("[data-frame] figcaption").evaluateAll((els) => els.map((e) => e.textContent.match(/\d+ × \d+/)[0]))
  const start = await order()
  const a = await p.locator("[data-frame-label]").nth(0).boundingBox()
  const c3 = await p.locator("[data-frame]").nth(2).boundingBox()
  await p.mouse.move(a.x + 20, a.y + a.height / 2)
  await p.mouse.down()
  await p.mouse.move(a.x + 60, a.y + a.height / 2, { steps: 4 })
  await p.mouse.move(c3.x + c3.width / 2, a.y + a.height / 2, { steps: 10 })
  await p.mouse.up()
  await wait(400)
  const dragged = await order()
  await p.locator("[data-frame-label]").nth(0).focus()
  await p.keyboard.press("Alt+ArrowRight")
  await wait(300)
  const keyed = await order()
  const focus = await p.evaluate(() => document.activeElement?.closest("[data-frame]")?.querySelector("figcaption")?.textContent?.match(/\d+ × \d+/)?.[0])
  const said = await p.locator("p[aria-live=polite]").allInnerTexts()
  await p.locator('ul[aria-label="Frames"] li').nth(2).focus()
  await p.keyboard.press("Alt+ArrowUp")
  await wait(300)
  const listed = await order()
  await p.closeAll()
  const ok = start.join() === "360 × 780,390 × 844,430 × 932" && dragged[2] === "360 × 780" && keyed[1] === dragged[0] && focus === dragged[0] && said.some((t) => /Moved \d+ by \d+ to position 2 of 3/.test(t)) && listed[1] === keyed[2]
  return [ok ? "pass" : "fail", `start ${start.join(", ")}; dragging the first label past the third gave ${dragged.join(", ")}; Alt+Right gave ${keyed.join(", ")} with focus on ${focus}; announced "${said.filter(Boolean).join(" ")}"; Alt+Up in the frame list gave ${listed.join(", ")}`]
})

// AC-23 Saving: the dev server writes a valid layouts.json that restores exactly; rename, duplicate, delete; presets stay read only; a built Studio loads but cannot save; unsaved edits persist and travel in the link; the endpoint refuses what it should
await check("AC-23", async () => {
  const file = join(root, "layouts.json")
  const backup = existsSync(file) ? `${file}.acceptance-backup` : null
  if (backup) copyFileSync(file, backup)
  const port = 5391
  const dev = spawn("npx", ["vite", "--port", String(port), "--strictPort", "--logLevel", "error"], { cwd: root, stdio: "ignore" })
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

await browser.close()
for (const s of Object.values(servers)) s.server.close()
writeFileSync(join(root, "acceptance-report.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + "\n")
const failed = results.filter((r) => r.status === "fail")
console.log(`\n${results.length - failed.length} of ${results.length} criteria not failing; report written to acceptance-report.json`)
process.exit(failed.length ? 1 : 0)

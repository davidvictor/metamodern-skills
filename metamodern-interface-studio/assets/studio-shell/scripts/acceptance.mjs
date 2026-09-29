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
import { execFileSync } from "node:child_process"
import { createReadStream, existsSync, statSync, writeFileSync } from "node:fs"
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
    for (const view of ["inspect", "compare", "gallery", "present", "tokens"]) {
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
    for (const view of ["inspect", "compare", "present", "tokens", "gallery"]) {
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
  const names = ["Inspect", "Compare", "Gallery", "Present", "Tokens"]
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

await browser.close()
for (const s of Object.values(servers)) s.server.close()
writeFileSync(join(root, "acceptance-report.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + "\n")
const failed = results.filter((r) => r.status === "fail")
console.log(`\n${results.length - failed.length} of ${results.length} criteria not failing; report written to acceptance-report.json`)
process.exit(failed.length ? 1 : 0)

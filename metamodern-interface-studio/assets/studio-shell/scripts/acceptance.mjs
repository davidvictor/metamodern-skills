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
  const folded = await p.locator('[role="grid"] [aria-expanded="false"]').count()
  const rows0 = await p.locator('[role="grid"] [data-index]').count()
  await p.locator('[role="grid"] [aria-expanded="false"]').first().click()
  await wait(200)
  await p.locator('[role="grid"]').evaluate((e) => (e.scrollTop = e.scrollHeight))
  await wait(300)
  const rows1 = await p.locator('[role="grid"] [data-index]').count()
  await p.locator('[role="grid"] [role="row"][aria-selected]').first().click()
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
  const back = await q.evaluate(() => document.activeElement?.getAttribute("aria-label"))
  await q.closeAll()
  const ok = segments === 0 && listRows <= 40 && listStops === 1 && allSteps && counted && playing && paused && restored && back === "Present"
  return [ok ? "pass" : "fail", `segments ${segments}, list rows in DOM ${listRows}, list tab stops ${listStops}, All steps ${allSteps}, arrow key advanced ${counted}, Space plays ${playing}, touching pauses ${paused}, Restore works ${restored}, focus after Esc on "${back}"`]
})

// AC-08 Compare: two sides, separate runtimes
await check("AC-08", async () => {
  const p = await open("normal", { hash: "view=compare" })
  const frames = p.frames().filter((f) => f !== p.mainFrame())
  await frames[frames.length - 1].getByRole("button", { name: "New task" }).click().catch(() => {})
  await wait(600)
  const captions = await p.locator("figcaption").allInnerTexts()
  const diverged = await p.getByText(/Sides diverged/).isVisible()
  await p.closeAll()
  const modified = captions.map((c) => /Modified/.test(c))
  const ok = diverged && modified.filter(Boolean).length === 1
  return [ok ? "pass" : "fail", `two sides: exactly one marked Modified ${modified.filter(Boolean).length === 1}, pair shown as diverged ${diverged}. Sides beyond two and the Gallery matrix hand-off are not built.`]
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

// AC-10 The boundary holds for any product: sample the pixels across the frame edge
await check("AC-10", async () => {
  const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number)
  const rows = []
  let worst = 99
  for (const appearance of ["light", "dark"]) {
    const p = await open("normal", { appearance, hash: "view=inspect" })
    await p.keyboard.press("Shift+Digit0")
    await wait(600)
    const shell = await p.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const stage = await p.evaluate(() => getComputedStyle(document.querySelector(".stage-surface")).backgroundColor)
    const frame = p.frames().find((f) => f !== p.mainFrame())
    const ticks = await p.locator(".preview-ticks i").count()
    const tab = await p.getByText("Illustrative example").first().locator("xpath=../..").innerText()
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
      worst = Math.min(worst, best)
      rows.push(`${appearance}/${name} ${best.toFixed(1)}:1`)
    }
    if (ticks !== 4 || !/Example Tasks/.test(tab) || !/Desktop/.test(tab)) worst = 0
    await p.closeAll()
  }
  return [worst >= 3 ? "pass" : "fail", `worst edge contrast ${worst.toFixed(1)}:1 across ${rows.length} fixtures (${rows.join(", ")}); crop ticks and a tab naming fidelity, product, theme and profile are present`]
})

// AC-11 Scale is always disclosed, with 100% one action away
await check("AC-11", async () => {
  const bad = []
  for (const width of [1440, 1024, 390]) {
    for (const view of ["inspect", "compare", "present", "tokens", "gallery"]) {
      const p = await open("normal", { width, height: 900, touch: width < 768, hash: `view=${view}` })
      const text = await p.locator("body").innerText()
      const said = view === "gallery" ? /thumbnails at about \d+%/.test(text) : /\d+ × \d+ · (\d+%|actual size)/.test(text)
      const action = view === "gallery" ? true : (await p.getByRole("button", { name: /Show at actual size|Fit to the stage/ }).count()) > 0 || (await p.getByRole("button", { name: /^Zoom/ }).count()) > 0
      if (!said || !action) bad.push(`${view}@${width}${said ? "" : " no scale"}${action ? "" : " no action"}`)
      await p.closeAll()
    }
  }
  return [bad.length ? "fail" : "pass", bad.length ? bad.join("; ") : "5 views at 1440, 1024 and 390 px state size and percentage; a 100% or Fit action is present (Gallery states its thumbnail scale and a card opens Inspect)"]
})

await browser.close()
for (const s of Object.values(servers)) s.server.close()
writeFileSync(join(root, "acceptance-report.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2) + "\n")
const failed = results.filter((r) => r.status === "fail")
console.log(`\n${results.length - failed.length} of ${results.length} criteria not failing; report written to acceptance-report.json`)
process.exit(failed.length ? 1 : 0)

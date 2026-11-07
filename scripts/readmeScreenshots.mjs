// Captures the README screenshots from a running Octetlab (default: the live site) into docs/images.
// Usage: node scripts/readmeScreenshots.mjs [baseUrl]   (needs `npx playwright install chromium` once)
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'https://octetlab.slovveis.workers.dev'
const OUT = new URL('../docs/images/', import.meta.url)
const VIEWPORT = { width: 1600, height: 960 }
const PREFERENCES_KEY = 'agArizaLab.preferences'
mkdirSync(OUT, { recursive: true })

const file = (name) => new URL(name, OUT).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const browser = await chromium.launch()

/** A fresh page; `theme` is stored as a preference before the app starts. */
async function newPage(theme = 'light') {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: theme })
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PREFERENCES_KEY, JSON.stringify({ version: 1, appearance: { theme }, map: { minimap: false } })],
  )
  return context.newPage()
}

async function openWorkspace(page, path) {
  await page.goto(`${BASE}${path}`)
  await page.getByRole('group', { name: 'Lab canvas' }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1200)
}

const device = (page, name) => page.getByRole('group', { name: 'Lab canvas' }).getByRole('group', { name, exact: true })
const properties = (page) => page.getByRole('region', { name: 'Properties' })

/** Closes the toasts that would cover the map in a screenshot. */
async function dismissToasts(page) {
  for (const button of await page.getByRole('button', { name: 'Dismiss message' }).all()) {
    if (await button.isVisible()) await button.click().catch(() => {})
  }
}

async function typeInConsole(page, commands) {
  const input = properties(page).getByRole('textbox', { name: /Console command/ })
  for (const command of commands) {
    await input.fill(command)
    await input.press('Enter')
    await page.waitForTimeout(150)
  }
}

// 1. A sample lab with its lesson panel.
{
  const page = await newPage()
  await openWorkspace(page, '/samples/routingStaticDefault?lang=en')
  await page.screenshot({ path: file('sampleLesson.png') })
  await page.context().close()
}

// 2. Device CLI on a router.
{
  const page = await newPage()
  await openWorkspace(page, '/samples/switchingRouterOnAStick?lang=en')
  await page.getByRole('button', { name: /^Lesson/ }).click()
  await device(page, 'R1').click()
  await properties(page).getByRole('tab', { name: 'CLI', exact: true }).click()
  await typeInConsole(page, ['enable', 'conf t', 'hostname R1', 'int gi0/0.20', 'encapsulation dot1Q 20', 'ip address 192.168.20.1 255.255.255.0', 'end', 'show running-config'])
  await page.screenshot({ path: file('deviceCli.png') })
  await page.context().close()
}

// 3. Simulation mode: a ping stepped through ARP and ICMP, event list and PDU inspector.
{
  const page = await newPage()
  await openWorkspace(page, '/samples/routingStaticDefault?lang=en')
  await page.getByRole('button', { name: /^Lesson/ }).click()
  await page.getByRole('button', { name: 'Simulation', exact: true }).click()
  await page.getByRole('button', { name: 'Simple PDU (one ping)' }).click()
  await device(page, 'PC1').click()
  await device(page, 'R1').click()
  const stepForward = page.getByRole('button', { name: 'Step forward' })
  for (let step = 0; step < 8; step += 1) {
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Step forward' || b.textContent?.trim() === 'Step forward')
      return button !== undefined && !button.disabled
    }, undefined, { timeout: 30_000 })
    await stepForward.click()
    await page.waitForTimeout(600)
  }
  await dismissToasts(page)
  await page.getByRole('button', { name: 'Fit to screen' }).click()
  await page.waitForTimeout(600)
  await page.getByText(/^Ping request/).first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: file('simulation.png') })
  await page.context().close()
}

// 3b. Video of a ping played in simulation mode (converted to docs/images/simulation.gif with ffmpeg).
{
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: file('video/'), size: VIEWPORT } })
  await context.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [PREFERENCES_KEY, JSON.stringify({ version: 1, appearance: { theme: 'light' }, map: { minimap: false } })])
  const page = await context.newPage()
  await openWorkspace(page, '/samples/switchingRouterOnAStick?lang=en')
  await page.getByRole('button', { name: /^Lesson/ }).click()
  await page.getByRole('button', { name: 'Simulation', exact: true }).click()
  await page.getByRole('button', { name: 'Simple PDU (one ping)' }).click()
  await device(page, 'PC1').click()
  await device(page, 'R1').click()
  await page.waitForTimeout(500)
  await dismissToasts(page)
  await page.getByRole('button', { name: 'Fit to screen' }).click()
  await page.waitForTimeout(500)
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === 'Play' && !b.disabled), undefined, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForTimeout(9000)
  await context.close()
}

// 4. Dark mode.
{
  const page = await newPage('dark')
  await openWorkspace(page, '/samples/switchingRouterOnAStick?lang=en')
  await page.getByRole('button', { name: /^Lesson/ }).click()
  await device(page, 'SW1').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: file('darkMode.png') })
  await page.context().close()
}

// 5. Sample library, design tasks, landing (English and Turkish).
for (const [name, path] of [
  ['samples.png', '/samples?lang=en'],
  ['designTasks.png', '/design?lang=en'],
  ['landing.png', '/?lang=en'],
  ['landingTr.png', '/?lang=tr'],
]) {
  const page = await newPage()
  await page.goto(`${BASE}${path}`)
  await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: file(name) })
  await page.context().close()
}

await browser.close()
console.log('screenshots written to docs/images')

import { expect, test } from './support/fixtures'
import { LabWorkspace } from './support/LabWorkspace'

const DEVICES = ['PC 1', 'PC 2', 'Switch 1'] as const

test.describe('lab file and share link', () => {
  test('export the lab and import it again', async ({ page }, testInfo) => {
    const lab = new LabWorkspace(page)
    await lab.open()
    await lab.addTwoPcsAndSwitch()
    await lab.connect('PC 1', 'Switch 1')

    const downloadPromise = page.waitForEvent('download')
    await lab.fileMenu('Export lab')
    const download = await downloadPromise
    // Toasts disappear after a few seconds: check it before the (slower) file save.
    await expect(lab.toast(/^Lab exported as /)).toBeVisible()
    expect(download.suggestedFilename()).toMatch(/\.agl\.json$/)
    const file = testInfo.outputPath(download.suggestedFilename())
    await download.saveAs(file)

    await lab.fileMenu('New lab')
    await expect(lab.toast('New lab started.')).toBeVisible()
    for (const name of DEVICES) await expect(lab.device(name)).toHaveCount(0)

    const chooserPromise = page.waitForEvent('filechooser')
    await lab.fileMenu('Import lab')
    const chooser = await chooserPromise
    await chooser.setFiles(file)
    await expect(lab.toast(/^Lab imported: /)).toBeVisible()
    for (const name of DEVICES) await expect(lab.device(name)).toBeVisible()
    await expect(lab.canvas.getByRole('group', { name: /between PC 1 and Switch 1/ })).toHaveCount(1)
  })

  test('a copied share link opens the same lab in a new browser', async ({ page, browser, consoleErrors }) => {
    const lab = new LabWorkspace(page)
    await lab.open()
    await lab.addTwoPcsAndSwitch()
    await lab.connect('PC 2', 'Switch 1')

    await lab.fileMenu('Copy share link')
    await expect(lab.toast('Share link copied.')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    expect(link).toContain('#lab=')

    // A fresh context: nothing in storage, everything comes from the link.
    const context = await browser.newContext({ locale: 'en-US' })
    try {
      const sharedPage = await context.newPage()
      consoleErrors.watch(sharedPage)
      const shared = new LabWorkspace(sharedPage)
      await sharedPage.goto(link)
      await expect(shared.toast(/^Shared lab opened/)).toBeVisible()
      for (const name of DEVICES) await expect(shared.device(name)).toBeVisible()
      await expect(shared.canvas.getByRole('group', { name: /between PC 2 and Switch 1/ })).toHaveCount(1)
      await expect(sharedPage).not.toHaveURL(/#lab=/)
    } finally {
      await context.close()
    }
  })
})

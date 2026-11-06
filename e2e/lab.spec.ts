import { expect, test } from './support/fixtures'
import { LabWorkspace } from './support/LabWorkspace'

const MASK = '255.255.255.0'

test.describe('lab workspace', () => {
  test('build, cable, address and ping between two PCs', async ({ page }) => {
    const lab = new LabWorkspace(page)
    await lab.open()
    await lab.addTwoPcsAndSwitch()
    await lab.connect('PC 1', 'Switch 1')
    await lab.connect('PC 2', 'Switch 1')
    await expect(lab.canvas.getByRole('group', { name: /between PC \d and Switch 1/ })).toHaveCount(2)

    await lab.setStaticAddress({ device: 'PC 1', ip: '192.168.1.1', mask: MASK })
    await lab.setStaticAddress({ device: 'PC 2', ip: '192.168.1.2', mask: MASK })

    const output = await lab.runCommand('PC 1', 'ping 192.168.1.2')
    await expect(output).toContainText(/Reply from 192\.168\.1\.2: bytes=32/, { timeout: 15_000 })
    await expect(output).not.toContainText('Destination host unreachable')
  })

  test('undo and redo', async ({ page }) => {
    const lab = new LabWorkspace(page)
    const undo = page.getByRole('button', { name: 'Undo (Ctrl+Z)' })
    const redo = page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)' })
    await lab.open()
    await expect(undo).toBeDisabled()

    await lab.addModel('PC')
    await expect(lab.device('PC 1')).toBeVisible()
    await undo.click()
    await expect(lab.device('PC 1')).toHaveCount(0)
    await expect(redo).toBeEnabled()

    await redo.click()
    await expect(lab.device('PC 1')).toBeVisible()
    await expect(redo).toBeDisabled()

    // Keyboard shortcuts do the same.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(lab.device('PC 1')).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect(lab.device('PC 1')).toBeVisible()
  })

  test('adds a device from the palette (drawer on phones)', { tag: '@mobile' }, async ({ page }) => {
    const lab = new LabWorkspace(page)
    await lab.open()
    await lab.addModel('PC')
    await expect(lab.device('PC 1')).toBeVisible()
  })
})

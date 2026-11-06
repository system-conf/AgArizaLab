import { expect, test } from './support/fixtures'
import { LabWorkspace } from './support/LabWorkspace'

const POS = 'POS terminal'

test.describe('exercise posGateway', { tag: '@mobile' }, () => {
  test('verify fails, fix the gateway, verify succeeds, report, open in lab', async ({ page }) => {
    const lab = new LabWorkspace(page)
    await page.goto('/exercises?lang=en')
    await page.getByRole('button', { name: 'Start exercise: The POS terminal cannot reach the internet' }).click()
    await expect(page).toHaveURL(/\/exercises\/posGateway(\?|$)/)
    await expect(page.getByRole('heading', { level: 1, name: 'The POS terminal cannot reach the internet' })).toBeVisible({ timeout: 15_000 })

    // Select the device first: on a phone the failure list makes the canvas smaller afterwards.
    await lab.showTab(POS, 'Settings')
    const gateway = lab.properties.getByRole('textbox', { name: 'Default gateway' })
    await expect(gateway).toHaveValue('192.168.1.1')

    const verify = page.getByRole('button', { name: 'Verify', exact: true })
    await verify.click()
    await expect(page.getByRole('alert').filter({ hasText: 'Not solved yet:' })).toBeVisible()

    await gateway.fill('192.168.10.1')
    await gateway.press('Enter')
    await expect(gateway).toHaveValue('192.168.10.1')

    await verify.click()
    await expect(page).toHaveURL(/\/exercises\/posGateway\/report(\?|$)/)
    await expect(page.getByText('Verified: the fault is fixed')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What happened?' })).toBeVisible()

    await page.getByRole('button', { name: 'Open in the lab' }).click()
    await expect(page).toHaveURL(/\/lab(\?|$)/)
    await expect(lab.device(POS)).toBeVisible()
    await lab.showTab(POS, 'Info')
    await expect(lab.properties.getByText('192.168.10.1').first()).toBeVisible()
  })
})

import { expect, test } from './support/fixtures'
import { LabWorkspace } from './support/LabWorkspace'

test.describe('device CLI', () => {
  test('a VLAN and an access port typed in the switch CLI show in show vlan brief and in Settings', async ({ page }) => {
    const lab = new LabWorkspace(page)
    await lab.open()
    await lab.addModel('Switch (8 ports)')
    await lab.device('Switch 1').click()
    await lab.properties.getByRole('tab', { name: 'CLI', exact: true }).click()

    const input = lab.properties.getByRole('textbox', { name: /Console command/ })
    const output = lab.properties.getByRole('log', { name: 'Console output' })
    for (const command of ['enable', 'configure terminal', 'vlan 10', 'name SALES', 'interface fa0/1', 'switchport mode access', 'switchport access vlan 10', 'end']) {
      await input.fill(command)
      await input.press('Enter')
    }
    // The prompt is the input's label.
    await expect(input).toHaveAccessibleName(/^Switch# /)
    await input.fill('show vlan brief')
    await input.press('Enter')
    await expect(output).toContainText(/10\s+SALES\s+active\s+Fa0\/1/)

    // The same device in the Settings tab and in the Config tab.
    await lab.properties.getByRole('tab', { name: 'Settings', exact: true }).click()
    await expect(lab.properties.getByRole('heading', { name: 'VLAN 10', exact: true })).toBeVisible()
    await expect(lab.properties.getByRole('button', { name: /^Fa0\/1: VLAN 10,/ })).toBeVisible()
    await lab.properties.getByRole('tab', { name: 'Config', exact: true }).click()
    await expect(lab.properties.getByText(/switchport access vlan 10/)).toBeVisible()
  })
})

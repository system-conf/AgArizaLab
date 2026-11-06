import { expect, type Locator, type Page } from '@playwright/test'

/** Static address of one end device in the test labs. */
export interface HostAddress {
  device: string
  ip: string
  mask: string
}

/**
 * The workspace (/lab and exercise mode) through its accessible names in the English locale.
 * Device names are the app's defaults ("PC 1", "Switch 1") or the exercise's device names.
 */
export class LabWorkspace {
  readonly page: Page
  readonly canvas: Locator
  readonly properties: Locator

  constructor(page: Page) {
    this.page = page
    this.canvas = page.getByRole('group', { name: 'Lab canvas' })
    this.properties = page.getByRole('region', { name: 'Properties' })
  }

  async open(): Promise<void> {
    await this.page.goto('/lab?lang=en')
    // The workspace is a lazy chunk; the first load can take a moment on a cold server.
    await expect(this.canvas).toBeVisible({ timeout: 15_000 })
  }

  /** Device node on the canvas (React Flow node, role group, named after the device). */
  device(name: string): Locator {
    return this.canvas.getByRole('group', { name, exact: true })
  }

  /**
   * Adds a catalog model by its palette name, e.g. "PC" or "Switch (8 ports)". The palette is a
   * side bar on wide screens and a drawer behind the "Devices" button on phones; its search box
   * finds a model in any category. Palette selectors live only here.
   */
  async addModel(modelName: string): Promise<void> {
    const drawerButton = this.page.getByRole('button', { name: 'Devices', exact: true })
    if (await drawerButton.isVisible()) await drawerButton.click()
    const search = this.page.getByRole('searchbox', { name: 'Search devices' })
    if (await search.isVisible()) await search.fill(modelName)
    await this.page.getByRole('button', { name: `Add ${modelName}`, exact: true }).click()
  }

  /** Two PCs and an 8-port switch: "PC 1", "PC 2", "Switch 1". */
  async addTwoPcsAndSwitch(): Promise<void> {
    await this.addModel('PC')
    await this.addModel('PC')
    await this.addModel('Switch (8 ports)')
    for (const name of ['PC 1', 'PC 2', 'Switch 1']) await expect(this.device(name)).toBeVisible()
  }

  /**
   * Cable with the Automatic tool: click each device, take its first free port. The port list
   * focuses that port when it opens; Enter picks it. (A mouse click could miss: the list is a
   * React Flow node toolbar that is positioned after it is measured, near the canvas edge.)
   */
  async connect(first: string, second: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Automatic', exact: true }).click()
    await this.pickFirstFreePort(first)
    await expect(this.page.getByRole('status').filter({ hasText: `from ${first} ` })).toBeVisible()
    await this.pickFirstFreePort(second)
    await expect(this.toast(`Connected ${first} `)).toBeVisible()
    await this.page.getByRole('button', { name: 'Select (Esc)' }).click()
  }

  private async pickFirstFreePort(device: string): Promise<void> {
    await this.device(device).click()
    const firstFree = this.page.getByRole('dialog', { name: `Ports of ${device}` }).getByRole('button', { name: /Free$/ }).first()
    await expect(firstFree).toBeFocused()
    await firstFree.press('Enter')
  }

  /** Selects a device and shows one of its tabs in the properties panel. */
  async showTab(device: string, tab: 'Info' | 'Settings' | 'Terminal'): Promise<void> {
    await this.device(device).click()
    await expect(this.properties.getByRole('heading', { name: device, exact: true, level: 3 }).first()).toBeVisible()
    await this.properties.getByRole('tab', { name: tab }).click()
  }

  /** Static IP on the end device's eth0 (Settings → Ports → eth0). */
  async setStaticAddress({ device, ip, mask }: HostAddress): Promise<void> {
    await this.showTab(device, 'Settings')
    await this.properties.getByRole('button', { name: /^eth0:/ }).click()
    const editor = this.properties.getByRole('region', { name: 'Port eth0' })
    await editor.getByRole('combobox', { name: 'Addressing' }).selectOption({ label: 'Static' })
    await editor.getByRole('textbox', { name: 'IP address' }).fill(ip)
    await editor.getByRole('textbox', { name: 'Subnet mask' }).fill(mask)
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(this.properties.getByRole('button', { name: /^eth0:/ })).toBeVisible()
  }

  /** Runs one command in the device's Terminal tab. */
  async runCommand(device: string, command: string): Promise<Locator> {
    await this.showTab(device, 'Terminal')
    const input = this.properties.getByRole('textbox', { name: /Command/ })
    await input.fill(command)
    await input.press('Enter')
    return this.properties.getByRole('log', { name: 'Command output' })
  }

  /** Runs a File menu item ("Export lab", "Copy share link", …). */
  async fileMenu(item: string): Promise<void> {
    await this.page.getByRole('button', { name: 'File', exact: true }).click()
    await this.page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: item }).click()
  }

  /** The toast text (role status) with the given start. */
  toast(text: string | RegExp): Locator {
    return this.page.getByRole('status').filter({ hasText: text })
  }
}

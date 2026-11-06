import { test as base, expect, type Page } from '@playwright/test'

/** Collects console errors and uncaught exceptions of the pages it watches. */
export class ConsoleErrorLog {
  private readonly errors: string[] = []

  watch(page: Page): void {
    page.on('console', (message) => {
      if (message.type() === 'error') this.errors.push(`console.error on ${page.url()}: ${message.text()}`)
    })
    page.on('pageerror', (error) => {
      this.errors.push(`uncaught ${error.name} on ${page.url()}: ${error.message}`)
    })
  }

  all(): readonly string[] {
    return this.errors
  }
}

interface Fixtures {
  /** Every test fails if a watched page logs an error; `page` is watched automatically. */
  consoleErrors: ConsoleErrorLog
}

// Fixture callbacks are named `provide` (not `use`): eslint-plugin-react-hooks treats `use(…)` as React's hook.
export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, provide) => {
      const log = new ConsoleErrorLog()
      log.watch(page)
      await provide(log)
      expect(log.all(), 'no console errors or uncaught exceptions').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

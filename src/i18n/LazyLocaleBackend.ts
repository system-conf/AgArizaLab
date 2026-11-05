import type { BackendModule, ReadCallback } from 'i18next'
import { lazyLocaleLoader } from './localeFiles'

/**
 * i18next backend for languages that are not bundled: loads src/locales/<lng>/<ns>.json as a
 * lazy Vite chunk. Bundled languages come from `resources` (partialBundledLanguages), so i18next
 * only asks this backend for the others.
 */
export class LazyLocaleBackend implements BackendModule {
  readonly type = 'backend'

  init(): void {
    // Nothing to configure: the file list is fixed at build time by import.meta.glob.
  }

  read(language: string, namespace: string, callback: ReadCallback): void {
    const loader = lazyLocaleLoader(language, namespace)
    if (loader === undefined) {
      callback(new Error(`No locale file for ${language}/${namespace}`), false)
      return
    }
    loader().then(
      (data) => callback(null, data),
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), false),
    )
  }
}

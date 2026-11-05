// Locale JSON files found by Vite. tr and en are bundled (eager); every other language folder is
// split into lazy chunks and loaded on demand by LazyLocaleBackend.
import type { Resource, ResourceKey } from 'i18next'

type LocaleLoader = () => Promise<ResourceKey>

const bundledFiles = import.meta.glob<ResourceKey>(['../locales/en/*.json', '../locales/tr/*.json'], {
  eager: true,
  import: 'default',
})

const lazyFiles = import.meta.glob<ResourceKey>(
  ['../locales/*/*.json', '!../locales/en/*.json', '!../locales/tr/*.json'],
  { import: 'default' },
)

const filePattern = /\/locales\/([^/]+)\/([^/]+)\.json$/

function localePath(language: string, namespace: string): string {
  return `../locales/${language}/${namespace}.json`
}

/** Resources of the bundled languages, in the i18next `resources` shape: { [lng]: { [ns]: json } }. */
export function bundledResources(): Resource {
  const resources: Resource = {}
  for (const [path, data] of Object.entries(bundledFiles)) {
    const match = filePattern.exec(path)
    const language = match?.[1]
    const namespace = match?.[2]
    if (language === undefined || namespace === undefined) {
      throw new Error(`Unexpected locale file path: ${path}`)
    }
    resources[language] = { ...resources[language], [namespace]: data }
  }
  return resources
}

/** Loader for a non-bundled language file, or undefined when the file does not exist. */
export function lazyLocaleLoader(language: string, namespace: string): LocaleLoader | undefined {
  return lazyFiles[localePath(language, namespace)]
}

// Every translation namespace (= one JSON file per language in src/locales/<code>/).
// Adding a namespace: add the JSON files for every language, add the name here and its type
// in typedResources.d.ts. The parity test checks this list against the en folder.

export const namespaces = [
  'common',
  'landing',
  'exercise',
  'results',
  'device',
  'map',
  'terminal',
  'session',
  'engine',
  'exercises',
] as const

export type Namespace = (typeof namespaces)[number]

export const defaultNamespace = 'common' satisfies Namespace

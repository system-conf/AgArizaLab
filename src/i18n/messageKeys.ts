// Compile-checked message keys for producers of LocalizedMessage (engine, session, scenarios).
// Type-only dependency on the locale files, so pure layers stay free of i18next at runtime.
import type { LocalizedMessage } from '../domain/Messages'
import type { AppResources } from './typedResources'

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

/** 'items_one' / 'items_other' are both addressed as 'items' (with a `count` param). */
type WithoutPlural<Key extends string> = Key extends `${infer Base}_${PluralSuffix}` ? Base : Key

type Join<Head extends string, Tail extends string> = Tail extends '' ? Head : `${Head}.${Tail}`

/** Dotted paths to every string leaf of a JSON object; array items are addressed by index. */
type LeafPaths<Node> = Node extends string
  ? ''
  : Node extends readonly (infer Item)[]
    ? Join<`${number}`, LeafPaths<Item>>
    : Node extends object
      ? { [Key in keyof Node & string]: Join<WithoutPlural<Key>, LeafPaths<Node[Key]>> }[keyof Node & string]
      : never

/** Every translatable key as 'namespace:path.to.key', e.g. 'engine:devicePoweredOff'. */
export type AppMessageKey = {
  [Ns in keyof AppResources & string]: `${Ns}:${LeafPaths<AppResources[Ns]>}`
}[keyof AppResources & string]

/** Builds a LocalizedMessage whose key is checked against the en locale files at compile time. */
export function localizedMessage(key: AppMessageKey, params?: Record<string, string | number>): LocalizedMessage {
  return params === undefined ? { key } : { key, params }
}

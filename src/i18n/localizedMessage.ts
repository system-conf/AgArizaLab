// Renders LocalizedMessage values (and runtime-built keys) with t(). This is the ONE place where
// a runtime key string meets the typed t(), so the only key-typing cast of the app lives here.
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalizedMessage } from '../domain/Messages'

/** Any i18next t function (typed TFunction of any namespace). */
export type AnyTFunction = (...args: never[]) => unknown

type UntypedTranslate = (key: string, options?: Record<string, unknown>) => unknown

/**
 * Why the cast is safe enough: LocalizedMessage.key is a plain string because domain types must
 * not depend on locale files, so the compiler cannot check it here. Producers build keys with
 * `localizedMessage()` (typed AppMessageKey) and the parity test guarantees every language has
 * them; an unknown key renders as the key itself (i18next default), never as a crash.
 */
function untyped(t: AnyTFunction): UntypedTranslate {
  return t as unknown as UntypedTranslate
}

/** Translates one message with the given t (from useTranslation or i18n.t). */
export function translateMessage(t: AnyTFunction, message: LocalizedMessage): string {
  const result = untyped(t)(message.key, message.params)
  if (typeof result === 'string') return result
  console.warn(`Translation of '${message.key}' is not a string`)
  return message.key
}

/**
 * Translates a key that holds a JSON array of strings (e.g. 'exercises:posGateway.topics').
 * Returns [] and warns when the key is missing or not a string array.
 */
export function translateList(t: AnyTFunction, key: string): string[] {
  const result = untyped(t)(key, { returnObjects: true })
  if (Array.isArray(result) && result.every((item): item is string => typeof item === 'string')) {
    return result
  }
  console.warn(`Translation of '${key}' is not a string list`)
  return []
}

/** Hook: a function that renders a LocalizedMessage in the current language (re-renders on change). */
export function useMessageTranslator(): (message: LocalizedMessage) => string {
  const { t } = useTranslation()
  return useCallback((message: LocalizedMessage) => translateMessage(t, message), [t])
}

import { useCallback, useState } from 'react'
import type { LocalizedMessage } from '../../../domain/Messages'
import { useMessageTranslator } from '../../../i18n'

/**
 * Validation messages appear after the first save attempt and then follow the draft live, so an
 * empty new row does not shout before the learner has typed anything.
 */
export function useShownErrors() {
  const translate = useMessageTranslator()
  const [submitted, setSubmitted] = useState(false)
  const show = useCallback(
    (message: LocalizedMessage | undefined): string | undefined => (submitted && message ? translate(message) : undefined),
    [submitted, translate],
  )
  return { show, markSubmitted: () => setSubmitted(true), reset: () => setSubmitted(false) }
}

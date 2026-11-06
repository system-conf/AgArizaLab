import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMessageTranslator } from '../../../i18n'
import { isLabStorageAvailable, loadAutosave, SharedLabInbox, type LabDocumentState } from '../labServices'
import type { ToastTone } from '../useToasts'

export interface LabOpeningInput {
  lab: LabDocumentState
  notify: (text: string, tone: ToastTone) => void
  /** `#lab=…` the page was opened with or that was pasted into the open tab later, or null. */
  shareHash: string | null
  /** The shared lab was handled (opened or reported); the app forgets the hash. */
  onShareHashUsed: () => void
}

/**
 * What the workspace shows: on entry the shared lab of a `#lab=…` link, otherwise the last
 * autosaved lab — unless the user already started editing the empty lab meanwhile (their work
 * wins). A share link pasted into the open tab later is opened the same way. The hash is then
 * removed from the address bar.
 */
export function useLabOpening(input: LabOpeningInput): void {
  const { t } = useTranslation('lab')
  const translate = useMessageTranslator()
  const latest = useRef({ ...input, t, translate })
  useEffect(() => {
    latest.current = { ...input, t, translate }
  })
  // Decodes each arriving hash once (StrictMode runs effects twice) and remembers an opened lab.
  const [inbox] = useState(() => new SharedLabInbox())
  const { shareHash } = input

  // Declared before the autosave effect so that, on entry, a shared lab is opened first.
  useEffect(() => {
    const { lab, notify, onShareHashUsed, t: labText, translate: translateMessage } = latest.current
    const outcome = inbox.receive(shareHash)
    if (outcome.kind === 'none') return
    onShareHashUsed()
    if (outcome.kind === 'opened') {
      lab.replace(outcome.doc)
      notify(labText('toast.sharedOpened'), 'info')
    } else {
      notify([labText('toast.sharedFailed'), ...outcome.errors.slice(0, 2).map(translateMessage)].join(' '), 'error')
    }
  }, [inbox, shareHash])

  useEffect(() => {
    if (inbox.hasOpened) return undefined
    let active = true
    loadAutosave().then(
      (stored) => {
        const current = latest.current
        if (!active) return
        if (stored !== null && !current.lab.canUndo && !inbox.hasOpened) current.lab.replace(stored.doc, { labId: stored.labId })
        if (!isLabStorageAvailable()) current.notify(current.t('storage.unavailable'), 'info')
      },
      (error: unknown) => console.warn('The autosaved lab could not be read.', error),
    )
    return () => {
      active = false
    }
  }, [inbox])
}

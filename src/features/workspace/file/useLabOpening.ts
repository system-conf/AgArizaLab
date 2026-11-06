import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMessageTranslator } from '../../../i18n'
import { clearShareHash, isLabStorageAvailable, labShareLink, loadAutosave, type LabDocumentState } from '../labServices'
import type { ToastTone } from '../useToasts'

export interface LabOpeningInput {
  lab: LabDocumentState
  notify: (text: string, tone: ToastTone) => void
  /** `#lab=…` the page was opened with (read once by the app), or null. */
  shareHash: string | null
  /** The shared lab was handled (opened or reported); the app forgets the hash. */
  onShareHashUsed: () => void
}

/**
 * What the workspace shows on entry (once per mount): the shared lab of a `#lab=…` link (the hash
 * is then removed from the address bar), otherwise the last autosaved lab — unless the user
 * already started editing the empty lab meanwhile (their work wins).
 */
export function useLabOpening(input: LabOpeningInput): void {
  const { t } = useTranslation('lab')
  const translate = useMessageTranslator()
  const latest = useRef({ ...input, t, translate })
  useEffect(() => {
    latest.current = { ...input, t, translate }
  })
  // StrictMode runs the effect twice: the share hash is handled (and announced) only once.
  const shared = useRef<'none' | 'opened' | 'failed'>('none')

  useEffect(() => {
    const { lab, notify, shareHash, onShareHashUsed, t: labText, translate: translateMessage } = latest.current
    if (shared.current === 'none' && shareHash !== null) {
      const result = labShareLink.decode(shareHash)
      clearShareHash()
      onShareHashUsed()
      if (result?.ok === true) {
        lab.replace(result.doc)
        notify(labText('toast.sharedOpened'), 'info')
        shared.current = 'opened'
      } else {
        const details = result?.ok === false ? result.errors.slice(0, 2).map(translateMessage) : []
        notify([labText('toast.sharedFailed'), ...details].join(' '), 'error')
        shared.current = 'failed'
      }
    }
    if (shared.current === 'opened') return undefined
    let active = true
    loadAutosave().then(
      (stored) => {
        const current = latest.current
        if (!active) return
        if (stored !== null && !current.lab.canUndo) current.lab.replace(stored.doc, { labId: stored.labId })
        if (!isLabStorageAvailable()) current.notify(current.t('storage.unavailable'), 'info')
      },
      (error: unknown) => console.warn('The autosaved lab could not be read.', error),
    )
    return () => {
      active = false
    }
  }, [])
}

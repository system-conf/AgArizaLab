import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalizedMessage } from '../../../domain/Messages'
import { useMessageTranslator } from '../../../i18n'
import {
  createEmptyLab,
  exportLabFile,
  importLabFile,
  labFileName,
  labShareLink,
  markLabOpened,
  openRecentLab,
  saveLabAsNew,
  type LabDocumentState,
} from '../labServices'
import type { ToastTone } from '../useToasts'

export interface LabFileActions {
  newLab: () => void
  openRecent: (labId: string) => void
  importFile: (file: File) => void
  exportLab: () => void
  copyShareLink: () => void
}

/** Errors shown in one toast after the headline (more would not fit). */
const MAX_TOAST_ERRORS = 3

/** File menu actions of the free lab, each with a translated success or error toast. */
export function useLabFileActions(lab: LabDocumentState, notify: (text: string, tone: ToastTone) => void): LabFileActions {
  const { t } = useTranslation('lab')
  const translate = useMessageTranslator()
  const { doc, replace } = lab

  const fail = useCallback(
    (headline: string, errors: readonly LocalizedMessage[]) =>
      notify([headline, ...errors.slice(0, MAX_TOAST_ERRORS).map(translate)].join(' '), 'error'),
    [notify, translate],
  )
  const titleOf = useCallback((title: string) => (title === '' ? t('untitled') : title), [t])
  const reportCrash = useCallback(
    (headline: string) => (error: unknown) => {
      console.error(headline, error)
      notify(headline, 'error')
    },
    [notify],
  )

  const newLab = useCallback(() => {
    replace(createEmptyLab())
    notify(t('toast.newLab'), 'success')
  }, [notify, replace, t])

  const openRecent = useCallback(
    (labId: string) => {
      openRecentLab(labId)
        .then(async (result) => {
          if (!result.ok) return fail(t('toast.openFailed'), result.errors)
          replace(result.doc, { labId })
          await markLabOpened(labId)
          notify(t('toast.opened', { title: titleOf(result.doc.meta.title) }), 'success')
        })
        .catch(reportCrash(t('toast.openFailed')))
    },
    [fail, notify, replace, reportCrash, t, titleOf],
  )

  const importFile = useCallback(
    (file: File) => {
      importLabFile(file)
        .then(async (result) => {
          if (!result.ok) return fail(t('toast.importFailed'), result.errors)
          const stored = await saveLabAsNew(result.doc)
          replace(stored.doc, { labId: stored.labId })
          notify(t('toast.imported', { title: titleOf(stored.doc.meta.title) }), 'success')
        })
        .catch(reportCrash(t('toast.importFailed')))
    },
    [fail, notify, replace, reportCrash, t, titleOf],
  )

  const exportLab = useCallback(() => {
    exportLabFile(doc)
    notify(t('toast.exported', { file: labFileName(doc) }), 'success')
  }, [doc, notify, t])

  const copyShareLink = useCallback(() => {
    const link = labShareLink.url(doc, window.location.href)
    if (!link.ok) return fail(t('share.copyFailed'), link.errors)
    // Through a promise so a missing clipboard API (insecure origin) also ends as a toast.
    Promise.resolve(link.url)
      .then((url) => navigator.clipboard.writeText(url))
      .then(
      () => notify(t('share.copied'), 'success'),
      reportCrash(t('share.copyFailed')),
    )
  }, [doc, fail, notify, reportCrash, t])

  return { newLab, openRecent, importFile, exportLab, copyShareLink }
}

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { LabDocument } from '../../domain'
import { downloadText } from './configDownload'

type Notify = (text: string, tone: 'info' | 'success' | 'error' | 'warning') => void

/**
 * File menu "Export configs": one text file with every device's running-config (CLI devices) or
 * settings summary (the others), in lab order (BACKLOG 8). The file is device text (English).
 */
export function useLabConfigExport(doc: LabDocument, notify: Notify): () => void {
  const { t } = useTranslation(['cli', 'lab'])
  return useCallback(() => {
    const title = doc.meta.title === '' ? t('lab:untitled') : doc.meta.title
    import('./labConfigFile')
      .then(({ labConfigFile }) => {
        const { file, text } = labConfigFile(doc.state, title, new Date().toISOString())
        downloadText(text, file)
        notify(t('cli:ui.export.done', { file }), 'success')
      })
      .catch((error: unknown) => {
        console.error('Config export failed.', error)
        notify(t('cli:ui.export.failed'), 'error')
      })
  }, [doc, notify, t])
}

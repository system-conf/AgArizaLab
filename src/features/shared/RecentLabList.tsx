import { FolderOpen, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../i18n'
import type { RecentLabEntry } from '../../lab/storage/LabLibrary'
import { focusRing } from './focusRing'

interface RecentLabListProps {
  /** null while loading. */
  entries: readonly RecentLabEntry[] | null
  onOpen: (labId: string) => void
  onDelete: (labId: string) => void
  /** Text while loading. */
  loadingText: string
}

/** Saved labs, newest first, with "Open" and "Delete" per lab (landing page and File menu). */
function RecentLabList({ entries, onOpen, onDelete, loadingText }: RecentLabListProps) {
  const { t } = useTranslation('lab')
  const { language } = useLanguage()
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }), [language])

  if (entries === null) return <p className="text-sm text-fg-subtle">{loadingText}</p>
  if (entries.length === 0) return <p className="text-sm text-fg-subtle">{t('recent.empty')}</p>

  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border bg-surface">
      {entries.map((entry) => {
        const title = entry.title === '' ? t('untitled') : entry.title
        const date = new Date(entry.updatedAt)
        return (
          <li key={entry.id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg-strong">{title}</p>
              {!Number.isNaN(date.getTime()) && (
                <p className="text-xs text-fg-subtle">{t('recent.updatedAt', { date: dateFormat.format(date) })}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpen(entry.id)}
              aria-label={t('recent.openAria', { title })}
              className={`flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover ${focusRing}`}
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('recent.open')}</span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(entry.id)}
              aria-label={t('recent.deleteAria', { title })}
              title={t('recent.delete')}
              className={`rounded-md p-1.5 text-fg-subtle hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 ${focusRing}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default RecentLabList

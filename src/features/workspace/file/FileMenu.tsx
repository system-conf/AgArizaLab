import { ChevronDown, Download, FilePlus2, FolderOpen, Link2, Upload, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { focusRing } from '../../shared/focusRing'
import { LAB_FILE_ACCEPT } from '../labServices'
import type { LabFileActions } from './useLabFileActions'

interface FileMenuProps {
  actions: LabFileActions
  onOpenRecent: () => void
}

type ItemKey = 'newLab' | 'openRecent' | 'import' | 'export' | 'share'

const ITEMS: readonly { key: ItemKey; icon: LucideIcon }[] = [
  { key: 'newLab', icon: FilePlus2 },
  { key: 'openRecent', icon: FolderOpen },
  { key: 'import', icon: Upload },
  { key: 'export', icon: Download },
  { key: 'share', icon: Link2 },
]

/** "File" menu button of the free lab (menu button pattern: arrows, Home / End, Esc, Tab closes). */
function FileMenu({ actions, onOpenRecent }: FileMenuProps) {
  const { t } = useTranslation(['workspace', 'lab'])
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<HTMLButtonElement[]>([])

  useEffect(() => {
    if (!open) return undefined
    itemRefs.current[0]?.focus()
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  function run(key: ItemKey) {
    setOpen(false)
    buttonRef.current?.focus()
    switch (key) {
      case 'newLab':
        return actions.newLab()
      case 'openRecent':
        return onOpenRecent()
      case 'import':
        return fileRef.current?.click()
      case 'export':
        return actions.exportLab()
      case 'share':
        return actions.copyShareLink()
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current
    const index = items.findIndex((item) => item === document.activeElement)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = (index + 1) % items.length
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
      return
    } else if (event.key === 'Tab') setOpen(false)
    if (next === null) return
    event.preventDefault()
    items[next]?.focus()
  }

  const label = (key: ItemKey): string => {
    switch (key) {
      case 'newLab':
        return t('lab:actions.newLab')
      case 'openRecent':
        return t('lab:actions.openRecent')
      case 'import':
        return t('lab:actions.import')
      case 'export':
        return t('lab:actions.export')
      case 'share':
        return t('lab:actions.share')
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return
          event.preventDefault()
          setOpen(true)
        }}
        className={`flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 ${focusRing}`}
      >
        <FolderOpen className="h-5 w-5 sm:hidden" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{t('workspace:header.file')}</span>
        <ChevronDown className="hidden h-4 w-4 sm:block" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('workspace:header.file')}
          onKeyDown={handleMenuKeyDown}
          className="absolute start-0 z-50 mt-1 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {ITEMS.map(({ key, icon: Icon }, index) => (
            <button
              key={key}
              ref={(element) => {
                if (element) itemRefs.current[index] = element
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => run(key)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm text-slate-800 hover:bg-slate-100 focus:bg-slate-100 ${focusRing}`}
            >
              <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {label(key)}
            </button>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={LAB_FILE_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) actions.importFile(file)
        }}
      />
    </div>
  )
}

export default FileMenu

import { X } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { CableRefusal, Device, LinkEnd } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import NodePopover from './NodePopover'
import type { PortOption } from './PortAvailability'
import { useCableRefusalText } from './useCableRefusalText'

interface PortPickerProps {
  device: Device
  end: 'first' | 'second'
  options: readonly PortOption[]
  /** Name of a device (for "in use → device port"). */
  nameOf: (deviceId: string) => string
  onPick: (portId: string) => void
  onClose: () => void
}

const STATUS_DOT: Readonly<Record<PortOption['status'], string>> = {
  free: 'bg-emerald-500',
  inUse: 'bg-amber-500',
  incompatible: 'bg-slate-300 dark:bg-slate-600',
}

/** Port list of a device for the cable tool: free ports are buttons, the others say why not. */
function PortPicker({ device, end, options, nameOf, onPick, onClose }: PortPickerProps) {
  const { t } = useTranslation('workspace')
  const refusalText = useCableRefusalText()
  const firstFree = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstFree.current?.focus()
  }, [device.id, end])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  function statusText(option: PortOption, reason: CableRefusal | undefined, linkedTo: LinkEnd | undefined): string {
    if (option.status === 'free') return t('portPicker.free')
    if (option.status === 'inUse') {
      return linkedTo ? t('portPicker.inUseTo', { device: nameOf(linkedTo.deviceId), port: linkedTo.portId }) : t('portPicker.inUse')
    }
    return reason ? refusalText(reason) : ''
  }

  const firstFreeIndex = options.findIndex((option) => option.status === 'free')
  const title = t('portPicker.title', { device: device.name })

  return (
    <NodePopover nodeId={device.id} label={title}>
      <div onKeyDown={handleKeyDown}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
              {end === 'first' ? t('portPicker.firstEnd') : t('portPicker.secondEnd')}
            </p>
            <h2 className="font-semibold text-fg-strong">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('portPicker.close')}
            className={`rounded p-1 text-fg-subtle hover:bg-surface-muted ${focusRing}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {options.length === 0 && <p className="text-fg-subtle">{t('portPicker.noPorts')}</p>}
        <ul className="space-y-1">
          {options.map((option, index) => {
            const usable = option.status === 'free'
            return (
              <li key={option.port.id}>
                <button
                  ref={index === firstFreeIndex ? firstFree : undefined}
                  type="button"
                  disabled={!usable}
                  onClick={() => onPick(option.port.id)}
                  className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start ${
                    usable ? 'hover:bg-accent-muted' : 'cursor-not-allowed text-fg-subtle'
                  } ${focusRing}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[option.status]}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`font-mono text-sm ${usable ? 'text-fg-strong' : ''}`}>{option.port.id}</span>
                      <span className="text-xs text-fg-subtle">{t(`media.${option.port.medium}`)}</span>
                    </span>
                    <span className="block text-xs">{statusText(option, option.reason, option.linkedTo)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </NodePopover>
  )
}

export default PortPicker

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NetworkState } from '../../domain'
import { PDU_TOOL_OFF, SimplePduTool, type PduToolState } from './model/SimplePduTool'
import { addressesOf, type SimPingRequest } from './simulationServices'

export interface SimplePduControls {
  readonly state: PduToolState
  readonly active: boolean
  start(): void
  cancel(): void
  /** Escape: one step back (destination → source → off). */
  back(): void
  /** A device was clicked on the canvas while the tool is active. */
  click(deviceId: string): void
}

interface SimplePduOptions {
  network: NetworkState
  nameOf: (deviceId: string) => string
  notify: (text: string, tone: 'info' | 'success' | 'error') => void
  inject: (request: SimPingRequest) => void
}

/** The "Simple PDU" tool: click the source, click the destination, one ping is queued. */
export function useSimplePdu({ network, nameOf, notify, inject }: SimplePduOptions): SimplePduControls {
  const { t } = useTranslation('simulation')
  const [state, setState] = useState<PduToolState>(PDU_TOOL_OFF)

  const click = useCallback(
    (deviceId: string) => {
      const device = network.devices.find((candidate) => candidate.id === deviceId)
      if (!device) return
      const outcome = SimplePduTool.click(state, device, addressesOf)
      setState(outcome.state)
      if (outcome.kind === 'refused') {
        notify(outcome.reason === 'sameDevice' ? t('ui.pduTool.sameDevice') : t('ui.pduTool.noAddress', { device: device.name }), 'error')
      } else if (outcome.kind === 'inject') {
        inject(outcome.request)
        notify(t('ui.pduTool.queued', { source: nameOf(outcome.request.deviceId), target: `${device.name} (${outcome.targetIp})` }), 'info')
      }
    },
    [inject, nameOf, network, notify, state, t],
  )

  return {
    state,
    active: SimplePduTool.isActive(state),
    start: useCallback(() => setState(SimplePduTool.start()), []),
    cancel: useCallback(() => setState(PDU_TOOL_OFF), []),
    back: useCallback(() => setState((current) => SimplePduTool.back(current)), []),
    click,
  }
}

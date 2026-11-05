import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CableRequest, CableTool, LabDocument } from '../../../domain/v2'
import type { CableHighlight } from '../canvas/canvasTypes'
import type { LabDocumentState, LabEditor } from '../labServices'
import type { ToastTone } from '../useToasts'
import { CableLinkBuilder } from './CableLinkBuilder'
import { CableToolState, type CableToolOutcome } from './CableToolState'
import { PortAvailability, type PortOption } from './PortAvailability'
import { useCableRefusalText } from './useCableRefusalText'

export interface CableToolControls {
  state: CableToolState
  choose: (tool: CableTool) => void
  clickDevice: (deviceId: string) => void
  pickPort: (portId: string) => void
  submitSsid: (ssid: string) => void
  /** Esc: one step back. */
  back: () => void
  stop: () => void
  /** Ports listed in the open port picker (empty when none is open). */
  portOptions: readonly PortOption[]
  highlightOf: (deviceId: string) => CableHighlight
}

const builder = new CableLinkBuilder()
const availability = new PortAvailability()

interface CableToolInput {
  lab: LabDocumentState
  editor: LabEditor
  notify: (text: string, tone: ToastTone) => void
}

/** The cable tool: state machine + port availability + connecting through LabEditor. */
export function useCableTool({ lab, editor, notify }: CableToolInput): CableToolControls {
  const { t } = useTranslation('workspace')
  const refusalText = useCableRefusalText()
  const [state, setState] = useState(() => CableToolState.off(builder))
  const { doc, apply } = lab
  const network = doc.state

  const connect = useCallback(
    (current: LabDocument, request: CableRequest) => {
      const link = builder.link(request, editor.nextLinkId(current))
      const result = editor.connect(current, link)
      if (!result.ok) {
        notify(refusalText(result.refusal), 'error')
        return
      }
      apply(() => result.doc)
      const name = (deviceId: string) => current.state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
      notify(
        t('toast.connected', {
          a: `${name(request.a.deviceId)} ${request.a.portId}`,
          b: `${name(request.b.deviceId)} ${request.b.portId}`,
        }),
        'success',
      )
    },
    [apply, editor, notify, refusalText, t],
  )

  const handleOutcome = useCallback(
    (outcome: CableToolOutcome) => {
      setState(outcome.state)
      if (outcome.kind === 'ready') connect(doc, outcome.request)
      else if (outcome.kind === 'refused') notify(refusalText(outcome.reason), 'error')
    },
    [connect, doc, notify, refusalText],
  )

  const menu = state.portMenu
  const first = state.firstEnd
  const tool = state.tool
  const portOptions = useMemo(() => {
    if (menu === null || tool === null) return []
    if (menu.end === 'first' || first === null) return availability.forFirstEnd(network, menu.deviceId, tool)
    return availability.forSecondEnd(network, first, menu.deviceId, tool)
  }, [first, menu, network, tool])

  // Which devices could take the cable right now (green ring) and which not (dimmed).
  const usableDevices = useMemo(() => {
    const usable = new Set<string>()
    if (tool === null) return usable
    for (const device of network.devices) {
      const options =
        first === null
          ? availability.forFirstEnd(network, device.id, tool)
          : availability.forSecondEnd(network, first, device.id, tool)
      if (availability.hasUsablePort(options)) usable.add(device.id)
    }
    return usable
  }, [first, network, tool])

  const highlightOf = useCallback(
    (deviceId: string): CableHighlight => {
      if (tool === null) return 'none'
      if (first?.deviceId === deviceId) return 'firstEnd'
      return usableDevices.has(deviceId) ? 'usable' : 'unusable'
    },
    [first, tool, usableDevices],
  )

  return {
    state,
    choose: useCallback((next: CableTool) => setState((current) => current.choose(next)), []),
    clickDevice: useCallback((deviceId: string) => setState((current) => current.clickDevice(deviceId)), []),
    pickPort: useCallback((portId: string) => handleOutcome(state.pickPort(network, portId)), [handleOutcome, network, state]),
    submitSsid: useCallback((ssid: string) => handleOutcome(state.submitSsid(ssid)), [handleOutcome, state]),
    back: useCallback(() => setState((current) => current.back()), []),
    stop: useCallback(() => setState((current) => current.stop()), []),
    portOptions,
    highlightOf,
  }
}

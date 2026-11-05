import type { NetworkEngine } from '../../domain/EngineContract'
import type { Device, Link, MapPosition, NetworkState } from '../../domain/NetworkTypes'
import type { DeviceFlowNode, LinkFlowEdge, SwitchEnd } from './mapTypes'

/** Size measured by React Flow for each node; kept so controlled nodes stay initialised. */
export type MeasuredSizes = Readonly<Record<string, { width: number; height: number }>>

function ipLabelOf(device: Device): string {
  const hostIp = device.host?.ip
  if (hostIp) return hostIp
  const routerIp = device.routerInterfaces?.[0]?.ip
  return routerIp ? routerIp : '—'
}

/** Translated accessible names of map elements; NetworkMap builds them from t(). */
export interface FlowLabels {
  /** Name of a device node, e.g. 'Printer' or 'Printer (off)'. */
  device: (device: Device) => string
  /** Name of the link between two devices. */
  link: (a: Device, b: Device) => string
}

/** Map nodes, one per device. Selection and positions come from the session, never from React Flow. */
export function buildNodes(
  state: NetworkState,
  positionOf: (deviceId: string) => MapPosition,
  selectedDeviceId: string | null,
  measured: MeasuredSizes,
  labels: FlowLabels,
): DeviceFlowNode[] {
  return state.devices.map((device) => ({
    id: device.id,
    type: 'device',
    position: positionOf(device.id),
    data: { device, ipLabel: ipLabelOf(device) },
    selected: device.id === selectedDeviceId,
    measured: measured[device.id],
    ariaLabel: labels.device(device),
    className: 'group',
  }))
}

function isWireless(link: Link): boolean {
  return link.ssid !== undefined || link.a.portId === 'radio' || link.b.portId === 'radio'
}

function switchEndsOf(link: Link, devicesById: ReadonlyMap<string, Device>): SwitchEnd[] {
  const ends: SwitchEnd[] = []
  if (devicesById.get(link.a.deviceId)?.kind === 'switch') ends.push({ side: 'source', portId: link.a.portId })
  if (devicesById.get(link.b.deviceId)?.kind === 'switch') ends.push({ side: 'target', portId: link.b.portId })
  return ends
}

/** Map edges, one per link. Lights come from the engine's physical link light only. */
export function buildEdges(state: NetworkState, engine: NetworkEngine, labels: FlowLabels): LinkFlowEdge[] {
  const devicesById = new Map(state.devices.map((device) => [device.id, device]))
  const edges: LinkFlowEdge[] = []
  for (const link of state.links) {
    const deviceA = devicesById.get(link.a.deviceId)
    const deviceB = devicesById.get(link.b.deviceId)
    if (!deviceA || !deviceB) {
      console.warn(`Link ${link.id} points to a missing device; it is not drawn.`)
      continue
    }
    edges.push({
      id: link.id,
      type: 'link',
      source: deviceA.id,
      target: deviceB.id,
      selectable: false,
      focusable: false,
      ariaLabel: labels.link(deviceA, deviceB),
      data: {
        link,
        light: engine.linkLight(state, link.id),
        wireless: isWireless(link),
        switchEnds: switchEndsOf(link, devicesById),
      },
    })
  }
  return edges
}

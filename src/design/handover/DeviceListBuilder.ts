import type { Device, DeviceModel } from '../../domain'
import { Ipv4, L3Interfaces, type L3Interface } from '../../engine'
import { DesignLabels } from '../DesignLabels'
import type { DeviceRow } from './HandoverTypes'
import type { LabIndex } from './LabIndex'
import type { ZoneLocator } from './ZoneLocator'

/** Rank of an interface as management address (lower first): SVI, static router port, NIC, the rest. */
function managementRank(iface: L3Interface): number {
  if (iface.kind === 'svi') return 0
  if (iface.kind === 'nic') return 2
  return iface.addressing === 'static' ? 1 : 3
}

/** Address with prefix length, e.g. '192.168.10.1/24'. */
export function withPrefix(address: string, mask: string): string {
  const prefix = Ipv4.prefixLength(mask)
  return prefix === null ? address : `${address}/${prefix}`
}

/** The device list: model, management address, zone, power and ports in use, in lab order. */
export class DeviceListBuilder {
  private readonly findModel: (modelId: string) => DeviceModel | undefined

  constructor(findModel: (modelId: string) => DeviceModel | undefined) {
    this.findModel = findModel
  }

  build(index: LabIndex, zones: ZoneLocator, isProvided?: (deviceId: string) => boolean): DeviceRow[] {
    return index.state.devices.map((device) => {
      const managementIp = this.managementIp(device)
      const zone = zones.zoneOf(device.id)
      return {
        ...index.ref(device.id),
        kind: device.kind,
        kindLabel: DesignLabels.kind(device.kind),
        modelId: device.modelId,
        model: DesignLabels.model(device.modelId, this.findModel),
        ...(managementIp === undefined ? {} : { managementIp }),
        powered: device.powered,
        ...(zone ? { zone: zone.label } : {}),
        ...(isProvided ? { provided: isProvided(device.id) } : {}),
        ports: { used: index.cabledPorts(device).length, total: device.ports.length },
      }
    })
  }

  /** The address an administrator reaches the device on: SVI, else a static router port, else a NIC. */
  managementIp(device: Device): string | undefined {
    const addressed = L3Interfaces.of(device).filter((iface) => L3Interfaces.isAddressed(iface))
    const [best] = [...addressed].sort((a, b) => managementRank(a) - managementRank(b))
    return best ? withPrefix(best.address, best.mask) : undefined
  }
}

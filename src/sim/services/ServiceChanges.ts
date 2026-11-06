import { L3Interfaces } from '../../net/L3Interfaces'
import type { DeviceChange, DeviceContext } from '../contract'
import { ServiceRuntimes } from './ServiceRuntimes'

/**
 * What survives a configuration change in the services slice (docs/SIMULATION.md §5.3): a NIC switched to
 * static (or removed) drops its client lease; removed pools drop their bindings; changed host DNS
 * servers flush the resolver cache. Sessions survive (their timers end them).
 */
export class ServiceChanges {
  static apply(ctx: DeviceContext, change: DeviceChange): void {
    if (!change.configChanged) return
    const device = ctx.device
    const dhcpNics = new Set(L3Interfaces.nics(device).filter((nic) => nic.addressing === 'dhcp').map((nic) => nic.id))
    const poolIds = new Set((device.services?.dhcp?.pools ?? []).map((pool) => pool.id))
    const before = change.previous.host?.dnsServers ?? []
    const after = device.host?.dnsServers ?? []
    const dnsChanged = before.length !== after.length || before.some((server, index) => server !== after[index])
    ServiceRuntimes.update(ctx, (services) => ({
      ...services,
      dhcpClients: services.dhcpClients.filter((lease) => dhcpNics.has(lease.portId)),
      dhcpBindings: services.dhcpBindings.filter((binding) => poolIds.has(binding.poolId)),
      dnsCache: dnsChanged ? [] : services.dnsCache,
    }))
  }
}

// Config text of one device for the export (BACKLOG 8, docs/CLI.md §5.3 / §6, C4). A device with a CLI
// exports its running-config, built by the shell's generator from every registered command set, preceded
// by its VLAN database: IOS keeps VLANs in vlan.dat, not in running-config, but a config that is replayed
// on a factory device needs them, and `vlan 10` / ` name SALES` replay in global config. Devices without a
// CLI (end devices, access points, home routers, hubs) get a summary as '!' comment lines.
import { findDeviceModel } from '../../catalog/DeviceCatalog'
import type { Device, VlanEntry } from '../../domain'
import type { CliShell } from '../core/CliShell'
import { DeviceSummaryText } from './DeviceSummaryText'

/** VLAN 1 and 1002–1005 exist on every switch and cannot be configured. */
const FIXED_VLANS: ReadonlySet<number> = new Set([1, 1002, 1003, 1004, 1005])

/** First line of the VLAN block; LabConfigExport and readers recognise it. */
export const VLAN_DATABASE_COMMENT = '! VLAN database (vlan.dat, not part of running-config)'

export class DeviceConfigText {
  private readonly shell: CliShell

  constructor(shell: CliShell) {
    this.shell = shell
  }

  /** Whether the device's model has an IOS command line (`deviceCli` capability). */
  static hasCli(device: Device): boolean {
    return findDeviceModel(device.modelId)?.capabilities.includes('deviceCli') === true
  }

  /** IOS default VLAN name: 'VLAN0010' for VLAN 10. */
  static defaultVlanName(id: number): string {
    return `VLAN${String(id).padStart(4, '0')}`
  }

  /**
   * `vlan <id>` blocks for the configurable VLANs, `name` only when it is not the default; [] when none.
   * The '!' after the last block is the running-config's own first line.
   */
  static vlanDatabase(device: Device): string[] {
    const vlans: readonly VlanEntry[] = (device.switching?.vlans ?? []).filter((vlan) => !FIXED_VLANS.has(vlan.id))
    if (vlans.length === 0) return []
    const lines = [VLAN_DATABASE_COMMENT]
    for (const vlan of [...vlans].sort((a, b) => a.id - b.id)) {
      lines.push('!', `vlan ${vlan.id}`)
      if (vlan.name !== DeviceConfigText.defaultVlanName(vlan.id)) lines.push(` name ${vlan.name}`)
    }
    return lines
  }

  /**
   * The device's config text: VLAN database + running-config ('!' … 'end') for a CLI device, the summary
   * comments otherwise. Replaying the CLI form with `shell.replay` rebuilds the device (ConfigRoundTrip).
   */
  lines(device: Device): string[] {
    if (!DeviceConfigText.hasCli(device)) return DeviceSummaryText.lines(device)
    return [...DeviceConfigText.vlanDatabase(device), ...this.shell.runningConfig(device)]
  }
}

// v1 NetworkState / ScenarioDefinition → v2 (docs/MODEL_V2.md §11). Pure and deterministic:
// the same input always gives the same output, device and link ids are kept unchanged.
import type { Device, Link, NetworkState } from '../../domain/NetworkTypes'
import type { ScenarioDefinition } from '../../domain/ScenarioTypes'
import {
  CableRules,
  type CableType,
  type DeviceV2,
  type ExerciseDefinition,
  type LabLayout,
  type LinkCable,
  type LinkEndV2,
  type LinkV2,
  type NetworkStateV2,
  type PlainCableType,
} from '../../domain/v2'
import { V1_DEVICE_MAP, V1_POE_SWITCH_MODEL_ID, V1_SETTING_MAP } from './v1DeviceMap'
import { V1MigrationError } from './V1MigrationError'
import { V1PortMigrator, type PortPlan } from './V1PortMigrator'
import { V1SettingsMigrator, type CloudConnection } from './V1SettingsMigrator'

function isPlainCable(cable: CableType | null): cable is PlainCableType {
  return cable !== null && cable !== 'serial' && cable !== 'wireless'
}

function linksOf(state: NetworkState, deviceId: string): Link[] {
  return state.links.filter((link) => link.a.deviceId === deviceId || link.b.deviceId === deviceId)
}

export class V1ToV2Migration {
  private readonly portMigrator = new V1PortMigrator()
  private readonly settingsMigrator = new V1SettingsMigrator()
  private readonly cableRules = new CableRules()

  state(state: NetworkState): NetworkStateV2 {
    this.checkLinkDevices(state)
    const vlans = V1SettingsMigrator.vlansOf(state)
    const plans = new Map<string, PortPlan>(
      state.devices.map((device) => [device.id, this.portMigrator.migrate(device, linksOf(state, device.id))]),
    )
    const devices = state.devices.map((device) => this.device(state, device, this.planOf(plans, device.id), vlans))
    const links = state.links.map((link) => this.link(link, plans, devices))
    this.checkSharedPorts(devices, links)
    return { devices, links }
  }

  /** Device positions of the v1 map become the lab layout (same coordinates). */
  layout(state: NetworkState): LabLayout {
    return {
      devices: Object.fromEntries(state.devices.map((device) => [device.id, { x: device.position.x, y: device.position.y }])),
    }
  }

  exercise(definition: ScenarioDefinition): ExerciseDefinition {
    return {
      id: definition.id,
      order: definition.order,
      setting: V1_SETTING_MAP[definition.setting],
      lab: { state: this.state(definition.initialState), layout: this.layout(definition.initialState) },
      solvedWhen: definition.solvedWhen.map((condition) => ({ ...condition })),
      locks: [],
    }
  }

  private device(state: NetworkState, device: Device, plan: PortPlan, vlans: readonly number[]): DeviceV2 {
    this.settingsMigrator.checkBags(device)
    const mapping = V1_DEVICE_MAP[device.kind]
    const poeSwitch = device.kind === 'switch' && (device.switchPorts ?? []).some((port) => port.poe)
    const migrated: DeviceV2 = {
      id: device.id,
      kind: mapping.kind,
      modelId: poeSwitch ? V1_POE_SWITCH_MODEL_ID : mapping.modelId,
      name: device.name,
      powered: device.powered,
      baseMac: device.mac,
      ports: plan.ports,
    }
    const host = this.settingsMigrator.host(device)
    if (host) migrated.host = host
    const switching = this.settingsMigrator.switching(device, vlans)
    if (switching) migrated.switching = switching
    const routing = this.settingsMigrator.routing(device)
    if (routing) migrated.routing = routing
    const wireless = this.settingsMigrator.wireless(device)
    if (wireless) migrated.wireless = wireless
    const services = this.settingsMigrator.services(device)
    if (services) migrated.services = services
    const internet = this.settingsMigrator.internet(device, this.cloudConnections(state, device, plan))
    if (internet) migrated.internet = internet
    return migrated
  }

  private cloudConnections(state: NetworkState, device: Device, plan: PortPlan): CloudConnection[] {
    if (device.kind !== 'internet') return []
    return linksOf(state, device.id).map((link) => {
      const own = link.a.deviceId === device.id ? link.a : link.b
      const other = link.a.deviceId === device.id ? link.b : link.a
      return {
        portId: plan.portIdFor(link.id, own.portId),
        neighbour: state.devices.find((candidate) => candidate.id === other.deviceId),
      }
    })
  }

  private link(link: Link, plans: Map<string, PortPlan>, devices: DeviceV2[]): LinkV2 {
    const a: LinkEndV2 = { deviceId: link.a.deviceId, portId: this.planOf(plans, link.a.deviceId).portIdFor(link.id, link.a.portId) }
    const b: LinkEndV2 = { deviceId: link.b.deviceId, portId: this.planOf(plans, link.b.deviceId).portIdFor(link.id, link.b.portId) }
    return { id: link.id, a, b, connected: link.connected, ...this.cableFor(link, a, b, devices) }
  }

  /** Wireless when the v1 link had an SSID or joins a Wi-Fi port; otherwise the textbook copper cable. */
  private cableFor(link: Link, a: LinkEndV2, b: LinkEndV2, devices: DeviceV2[]): LinkCable {
    const wirelessEnd = [a, b].some(
      (end) =>
        devices.find((device) => device.id === end.deviceId)?.ports.find((port) => port.id === end.portId)?.medium ===
        'wireless',
    )
    if (link.ssid !== undefined || wirelessEnd) return { cable: 'wireless', ssid: link.ssid ?? '' }
    const auto = this.cableRules.autoCable({ devices, links: [] }, a, b)
    return { cable: isPlainCable(auto) ? auto : 'copperStraight' }
  }

  private planOf(plans: Map<string, PortPlan>, deviceId: string): PortPlan {
    const plan = plans.get(deviceId)
    if (!plan) throw new V1MigrationError('unknownDevice', deviceId)
    return plan
  }

  private checkLinkDevices(state: NetworkState): void {
    const ids = new Set(state.devices.map((device) => device.id))
    for (const link of state.links) {
      for (const end of [link.a, link.b]) {
        if (!ids.has(end.deviceId)) throw new V1MigrationError('unknownDevice', `${link.id} → ${end.deviceId}`)
      }
    }
  }

  /** A v2 port takes one cable (radio ports excepted); v1 let several links share e.g. router 'lan'. */
  private checkSharedPorts(devices: DeviceV2[], links: LinkV2[]): void {
    const seen = new Set<string>()
    for (const link of links) {
      for (const end of [link.a, link.b]) {
        const port = devices.find((device) => device.id === end.deviceId)?.ports.find((candidate) => candidate.id === end.portId)
        if (port?.role === 'radio') continue
        const key = `${end.deviceId}/${end.portId}`
        if (seen.has(key)) throw new V1MigrationError('portShared', key)
        seen.add(key)
      }
    }
  }
}

const migration = new V1ToV2Migration()

/** v1 network → v2 network (ports, cables, settings). Layout: migrateV1Layout. */
export function migrateV1ToV2(state: NetworkState): NetworkStateV2 {
  return migration.state(state)
}

export function migrateV1Layout(state: NetworkState): LabLayout {
  return migration.layout(state)
}

/** v1 exercise → v2 exercise (lab state + layout, English setting id, no locks). */
export function migrateV1Exercise(definition: ScenarioDefinition): ExerciseDefinition {
  return migration.exercise(definition)
}

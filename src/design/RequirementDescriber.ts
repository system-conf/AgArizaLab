import type { DesignCondition, DeviceCapability, DeviceKind, FailureTarget, NetworkCondition, NetworkState } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { localizedMessage, type AppMessageKey } from '../i18n/messageKeys'
import type { GroupMembers } from './GroupMembers'

/** Statement of a requirement; `qualifier` is the failure part of `survivesFailure` ("… even when X is down"). */
export interface RequirementText {
  description: LocalizedMessage
  qualifier?: LocalizedMessage
}

/** Per-kind keys; kinds added later fall back to `maxDevices.other`. */
const MAX_DEVICES_KEYS: Partial<Record<DeviceKind, AppMessageKey>> = {
  internet: 'design:requirements.maxDevices.internet',
  router: 'design:requirements.maxDevices.router',
  wirelessRouter: 'design:requirements.maxDevices.wirelessRouter',
  switch: 'design:requirements.maxDevices.switch',
  l3Switch: 'design:requirements.maxDevices.l3Switch',
  hub: 'design:requirements.maxDevices.hub',
  accessPoint: 'design:requirements.maxDevices.accessPoint',
  pc: 'design:requirements.maxDevices.pc',
  laptop: 'design:requirements.maxDevices.laptop',
  server: 'design:requirements.maxDevices.server',
  printer: 'design:requirements.maxDevices.printer',
  ipPhone: 'design:requirements.maxDevices.ipPhone',
  pos: 'design:requirements.maxDevices.pos',
  camera: 'design:requirements.maxDevices.camera',
  nvr: 'design:requirements.maxDevices.nvr',
  kitchenDisplay: 'design:requirements.maxDevices.kitchenDisplay',
  smartphone: 'design:requirements.maxDevices.smartphone',
  tablet: 'design:requirements.maxDevices.tablet',
}

/** Per-capability keys; capabilities added later fall back to `uses.other`. */
const USES_KEYS: Partial<Record<DeviceCapability, AppMessageKey>> = {
  routing: 'design:requirements.uses.routing',
  l2Switching: 'design:requirements.uses.l2Switching',
  l3Switching: 'design:requirements.uses.l3Switching',
  wireless: 'design:requirements.uses.wireless',
  wirelessClient: 'design:requirements.uses.wirelessClient',
  dhcpServer: 'design:requirements.uses.dhcpServer',
  dnsServer: 'design:requirements.uses.dnsServer',
  poe: 'design:requirements.uses.poe',
  hostTerminal: 'design:requirements.uses.hostTerminal',
  deviceCli: 'design:requirements.uses.deviceCli',
  appLinks: 'design:requirements.uses.appLinks',
  internetService: 'design:requirements.uses.internetService',
  repeater: 'design:requirements.uses.repeater',
}

/**
 * Turns requirements into `design:requirements.*` / `design:failures.*` messages. A message states
 * what the customer wants, never how to build it. Group names come from the (localized) brief,
 * device names from the lab.
 */
export class RequirementDescriber {
  private readonly groups: GroupMembers

  constructor(groups: GroupMembers) {
    this.groups = groups
  }

  describe(state: NetworkState, condition: DesignCondition): RequirementText {
    switch (condition.type) {
      case 'survivesFailure':
        return { description: this.network(condition.requirement), qualifier: this.failure(state, condition.failure) }
      case 'uses': {
        const key = USES_KEYS[condition.capability]
        return { description: key ? localizedMessage(key) : localizedMessage('design:requirements.uses.other', { capability: condition.capability }) }
      }
      case 'maxCost':
        return { description: localizedMessage('design:requirements.maxCost', { amount: condition.amount }) }
      case 'maxDevices':
        return { description: this.maxDevices(condition.kind, condition.count) }
      default:
        return { description: this.network(condition) }
    }
  }

  private network(condition: NetworkCondition): LocalizedMessage {
    switch (condition.type) {
      case 'reachable':
        return localizedMessage('design:requirements.reachable', { from: this.name(condition.fromGroup), to: this.name(condition.toGroup) })
      case 'notReachable':
        return localizedMessage('design:requirements.notReachable', { from: this.name(condition.fromGroup), to: this.name(condition.toGroup) })
      case 'internet':
        return localizedMessage('design:requirements.internet', { group: this.name(condition.group) })
      case 'resolves':
        return localizedMessage('design:requirements.resolves', { group: this.name(condition.group), name: condition.name })
      case 'dhcpServes':
        return localizedMessage('design:requirements.dhcpServes', { group: this.name(condition.group) })
      case 'separateSubnets':
        return localizedMessage('design:requirements.separateSubnets', { groupA: this.name(condition.groupA), groupB: this.name(condition.groupB) })
      case 'sameVlan':
        return localizedMessage('design:requirements.sameVlan', { group: this.name(condition.group) })
      case 'addressPlan':
        return localizedMessage('design:requirements.addressPlan', { group: this.name(condition.group), prefix: condition.prefix })
    }
  }

  private maxDevices(kind: DeviceKind | undefined, count: number): LocalizedMessage {
    if (kind === undefined) return localizedMessage('design:requirements.maxDevices.any', { count })
    const key = MAX_DEVICES_KEYS[kind]
    return key ? localizedMessage(key, { count }) : localizedMessage('design:requirements.maxDevices.other', { kind, count })
  }

  private failure(state: NetworkState, target: FailureTarget): LocalizedMessage {
    switch (target.scope) {
      case 'device':
        return localizedMessage('design:failures.device', { device: this.deviceName(state, target.deviceId) })
      case 'link': {
        const link = state.links.find((candidate) => candidate.id === target.linkId)
        const a = link ? this.deviceName(state, link.a.deviceId) : target.linkId
        const b = link ? this.deviceName(state, link.b.deviceId) : target.linkId
        return localizedMessage('design:failures.link', { a, b })
      }
      case 'anyDevice':
        return localizedMessage('design:failures.anyDevice')
      case 'anyLink':
        return localizedMessage('design:failures.anyLink')
    }
  }

  private name(groupId: string): string {
    return this.groups.group(groupId).name
  }

  /** Display name of a device; falls back to the id so a message is never empty. */
  private deviceName(state: NetworkState, deviceId: string): string {
    return state.devices.find((device) => device.id === deviceId)?.name ?? deviceId
  }
}

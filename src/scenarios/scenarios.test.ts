import { describe, expect, it } from 'vitest'
import type { Device, DeviceKind } from '../domain/NetworkTypes'
import type { Scenario, SolveCondition } from '../domain/ScenarioTypes'
import { scenarios } from './index'

const camelCase = /^[a-z][a-zA-Z0-9]*$/
const macFormat = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/
const hostKinds: DeviceKind[] = ['pc', 'pos', 'printer', 'camera', 'nvr', 'kitchenDisplay', 'phone']

/** Port ids a device may use, following the LinkEnd doc in NetworkTypes.ts. */
function validPortIds(device: Device): string[] {
  if (hostKinds.includes(device.kind)) return ['eth0', 'wlan0']
  switch (device.kind) {
    case 'switch':
      return (device.switchPorts ?? []).map((port) => port.id)
    case 'router':
      return ['lan', 'wan']
    case 'accessPoint':
      return ['uplink', 'radio']
    case 'internet':
      return ['wan']
    default:
      return []
  }
}

function deviceIdsOf(condition: SolveCondition): string[] {
  switch (condition.type) {
    case 'internet':
    case 'resolves':
      return [condition.fromDeviceId]
    case 'reachable':
      return [condition.fromDeviceId, condition.toDeviceId]
    case 'appLinksOk':
      return [condition.deviceId]
  }
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length
}

describe('scenarios list', () => {
  it('has five scenarios with unique camelCase ids, sorted by order', () => {
    expect(scenarios).toHaveLength(5)
    const ids = scenarios.map((scenario) => scenario.id)
    expect(hasDuplicates(ids)).toBe(false)
    ids.forEach((id) => expect(id).toMatch(camelCase))
    const orders = scenarios.map((scenario) => scenario.order)
    expect(orders).toEqual([...orders].sort((first, second) => first - second))
  })
})

describe.each(scenarios.map((scenario): [string, Scenario] => [scenario.id, scenario]))(
  'scenario %s',
  (_id, scenario) => {
    const { devices, links } = scenario.initialState
    const deviceById = new Map(devices.map((device) => [device.id, device]))

    it('has unique camelCase device ids, link ids and app link ids', () => {
      const deviceIds = devices.map((device) => device.id)
      const linkIds = links.map((link) => link.id)
      expect(hasDuplicates(deviceIds)).toBe(false)
      expect(hasDuplicates(linkIds)).toBe(false)
      deviceIds.forEach((id) => expect(id).toMatch(camelCase))
      linkIds.forEach((id) => expect(id).toMatch(camelCase))
      devices.forEach((device) => {
        const appLinkIds = (device.appLinks ?? []).map((appLink) => appLink.id)
        expect(hasDuplicates(appLinkIds)).toBe(false)
        appLinkIds.forEach((id) => expect(id).toMatch(camelCase))
      })
    })

    it('has unique, well-formed MAC addresses', () => {
      const macs = devices.map((device) => device.mac)
      expect(hasDuplicates(macs)).toBe(false)
      macs.forEach((mac) => expect(mac).toMatch(macFormat))
    })

    it('links reference existing devices and valid ports, each port used once', () => {
      const usedPorts: string[] = []
      for (const link of links) {
        for (const end of [link.a, link.b]) {
          const device = deviceById.get(end.deviceId)
          expect(device, `${link.id} -> ${end.deviceId}`).toBeDefined()
          if (device === undefined) continue
          expect(validPortIds(device), `${link.id} -> ${end.portId}`).toContain(end.portId)
          usedPorts.push(`${end.deviceId}:${end.portId}`)
        }
      }
      // An AP radio serves many wireless clients; every other port takes one cable.
      expect(hasDuplicates(usedPorts.filter((port) => !port.endsWith(':radio')))).toBe(false)
    })

    it('has unique switch port ids on every switch', () => {
      devices
        .filter((device) => device.kind === 'switch')
        .forEach((device) => {
          const portIds = (device.switchPorts ?? []).map((port) => port.id)
          expect(portIds.length).toBeGreaterThan(0)
          expect(hasDuplicates(portIds)).toBe(false)
        })
    })

    it('has an internet device linked to the router wan port', () => {
      const internetLink = links.find(
        (link) =>
          (link.a.portId === 'wan' && link.b.portId === 'wan') &&
          [link.a.deviceId, link.b.deviceId].some((id) => deviceById.get(id)?.kind === 'internet') &&
          [link.a.deviceId, link.b.deviceId].some((id) => deviceById.get(id)?.kind === 'router'),
      )
      expect(internetLink).toBeDefined()
    })

    it('references only existing devices in solvedWhen', () => {
      expect(scenario.solvedWhen.length).toBeGreaterThan(0)
      scenario.solvedWhen.flatMap(deviceIdsOf).forEach((id) => {
        expect(deviceById.has(id), id).toBe(true)
      })
    })

    it('has three non-empty hints and complete texts', () => {
      expect(scenario.hints).toHaveLength(3)
      scenario.hints.forEach((hint) => expect(hint.trim()).not.toBe(''))
      expect(scenario.title.trim()).not.toBe('')
      expect(scenario.complaint.from.trim()).not.toBe('')
      expect(scenario.complaint.message.trim()).not.toBe('')
      expect(scenario.explanation.whatHappened.trim()).not.toBe('')
      expect(scenario.explanation.realLife.trim()).not.toBe('')
      expect(scenario.explanation.interviewAnswer.trim()).not.toBe('')
      expect(scenario.topics.length).toBeGreaterThanOrEqual(2)
      expect(scenario.topics.length).toBeLessThanOrEqual(4)
    })

    it('places devices inside the map without overlapping', () => {
      devices.forEach((device) => {
        expect(device.position.x).toBeGreaterThanOrEqual(0)
        expect(device.position.x).toBeLessThanOrEqual(1000)
        expect(device.position.y).toBeGreaterThanOrEqual(0)
        expect(device.position.y).toBeLessThanOrEqual(600)
      })
      const positions = devices.map((device) => `${device.position.x},${device.position.y}`)
      expect(hasDuplicates(positions)).toBe(false)
    })
  },
)

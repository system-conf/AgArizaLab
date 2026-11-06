// The random-lab generator itself: every lab is valid (StateInvariants, zod schema), small, and the
// generator reaches the features the oracle is meant to cover.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { StateInvariants } from '../../domain'
import { deviceSchema } from '../../lab/schemas/deviceSchemas'
import { MAX_DEVICES } from './LabBuilder'
import { ORACLE_SETTINGS, randomLabArbitrary } from './randomLabs'

const invariants = new StateInvariants()

describe('random lab generator', () => {
  it('builds valid labs of at most 12 devices', () => {
    fc.assert(
      fc.property(randomLabArbitrary, ({ state }) => {
        expect(invariants.violations(state)).toEqual([])
        expect(state.devices.length).toBeLessThanOrEqual(MAX_DEVICES)
        for (const device of state.devices) expect(deviceSchema.safeParse(device).success, device.id).toBe(true)
      }),
      { seed: ORACLE_SETTINGS.seed, numRuns: ORACLE_SETTINGS.numRuns },
    )
  })

  it('covers VLANs, L3 switches, hubs, Wi-Fi, DHCP, DNS, routing loops and faults', () => {
    const labs = fc.sample(randomLabArbitrary, { seed: ORACLE_SETTINGS.seed, numRuns: ORACLE_SETTINGS.numRuns })
    const seen = new Set<string>()
    for (const { plan, state } of labs) {
      for (const device of state.devices) {
        seen.add(`kind:${device.kind}`)
        if (device.ports.some((port) => port.role === 'routed' && port.subInterfaces.length > 0)) seen.add('subInterfaces')
        if ((device.switching?.svis ?? []).some((svi) => svi.adminUp && svi.l3.ipv4.address !== '')) seen.add('svi')
        if (device.services?.dhcp?.excludedRanges.length) seen.add('dhcpExclusions')
        if (device.services?.dns?.forwarders.length) seen.add('dnsForwarders')
        if ((device.routing?.staticRoutes ?? []).some((route) => route.adminDistance > 1)) seen.add('floatingRoute')
      }
      for (const router of plan.routers) seen.add(`routes:${router.routes}`)
      for (const fault of plan.faults) seen.add(`fault:${fault.kind}`)
      if (state.links.some((link) => link.cable === 'wireless')) seen.add('wireless')
    }
    const wanted = ['kind:l3Switch', 'kind:hub', 'kind:accessPoint', 'subInterfaces', 'svi', 'dhcpExclusions', 'dnsForwarders', 'floatingRoute', 'routes:loop', 'wireless', 'fault:ipConflict', 'fault:unplug', 'fault:powerOff']
    for (const feature of wanted) expect(seen.has(feature), feature).toBe(true)
  })
})

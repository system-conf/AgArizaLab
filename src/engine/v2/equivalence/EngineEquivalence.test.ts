import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../../domain/NetworkTypes'
import { migrateV1ToV2 } from '../../../lab/migrations'
import { scenarioDefinitions } from '../../../scenarios/scenarioDefinitions'
import { DefaultNetworkEngine } from '../../DefaultNetworkEngine'
import { DefaultNetworkEngineV2 } from '../DefaultNetworkEngineV2'
import { EngineComparison } from './EngineComparison'
import { v1EngineVariants } from './v1Variants'

const engineV2 = new DefaultNetworkEngineV2()
const comparison = new EngineComparison(new DefaultNetworkEngine(), engineV2)

const cases: ReadonlyArray<readonly [string, NetworkState]> = [
  ...v1EngineVariants().map((variant) => [variant.name, variant.state] as const),
  ...scenarioDefinitions.map((scenario) => [`exercise ${scenario.id}`, scenario.initialState] as const),
]

describe('v2 engine on migrated v1 states (engine fixtures, their test edits and the exercises)', () => {
  it.each(cases)('answers every engine question like v1 on %s', (_name, state) => {
    expect(comparison.compare(state).mismatches).toEqual([])
  })

  it.each(cases)('answers ARP per interface on %s (v1 let a router answer for another VLAN)', (_name, state) => {
    const migrated = migrateV1ToV2(state)
    for (const { hostId, ip } of comparison.compare(state).crossVlanCases) {
      expect(engineV2.reach(migrated, hostId, ip), `${hostId} → ${ip}`).toEqual({
        ok: false,
        reason: 'destinationNotInSegment',
        atDeviceId: hostId,
      })
    }
  })

  it('finds the cross-VLAN cases where they exist', () => {
    const kitchenVlan = scenarioDefinitions.find((scenario) => scenario.id === 'kitchenVlan')
    expect(kitchenVlan && comparison.compare(kitchenVlan.initialState).crossVlanCases).toEqual([
      { hostId: 'mutfakEkrani', ip: '192.168.10.1' },
    ])
  })
})

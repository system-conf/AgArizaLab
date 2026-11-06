import { describe, expect, it } from 'vitest'
import { CliShell } from '../core/CliShell'
import { ConfigRoundTrip } from './ConfigRoundTrip'
import {
  rebuildThroughLabExport,
  sampleAccessSwitch,
  sampleL3Switch,
  samplePc,
  sampleRouter,
  sampleSerialRouter,
  sampleSwitch,
} from './configFixtures'
import { DeviceConfigText } from './DeviceConfigText'

describe('config round trip: core command set', () => {
  const shell = new CliShell([])
  const samples = [sampleRouter(), sampleSwitch(), sampleL3Switch(), sampleSerialRouter(), sampleAccessSwitch()]

  it.each(samples.map((device) => [device.id, device] as const))('rebuilds %s from its exported config', (_id, device) => {
    expect(ConfigRoundTrip.differences(ConfigRoundTrip.blank(device), device).length).toBeGreaterThan(0)
    expect(ConfigRoundTrip.differences(device, new ConfigRoundTrip(shell).rebuild(device))).toEqual([])
  })

  it('rebuilds every CLI device of a whole-lab export', () => {
    const rebuilt = rebuildThroughLabExport(shell, samples)
    samples.forEach((device, index) => {
      const copy = rebuilt[index]
      if (copy === undefined) throw new Error('missing device')
      expect(ConfigRoundTrip.differences(device, copy)).toEqual([])
    })
  })

  it('reports what the config does not carry', () => {
    const device = sampleRouter()
    const renamed = { ...device, name: 'Edge' }
    expect(ConfigRoundTrip.differences(device, renamed)).toEqual(['name'])
    expect(DeviceConfigText.hasCli(samplePc())).toBe(false)
  })
})

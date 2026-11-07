import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../domain'
import { CliShell } from '../core/CliShell'
import { catalogDevice } from '../core/testCli'
import { samplePc, sampleRouter, sampleSwitch, withVlans } from './configFixtures'
import { DeviceConfigText } from './DeviceConfigText'
import { LabConfigExport } from './LabConfigExport'

const shell = new CliShell([])
const exporter = new LabConfigExport(shell)

function lab(): NetworkState {
  return {
    devices: [sampleRouter(), withVlans(sampleSwitch(), [{ id: 10, name: 'SALES' }]), samplePc(), catalogDevice('hub8', 'hub1', '00:D0:BA:00:00:32')],
    links: [],
  }
}

describe('lab config export', () => {
  it('writes a title block and one section per device, in lab order', () => {
    const network = lab()
    const lines = exporter.lines(network, { title: 'Ofis Ağı', exportedAt: '2026-11-06T20:00:00.000Z' })
    const rule = `!${'='.repeat(71)}`
    expect(lines.slice(0, 4)).toEqual(['! Octetlab configuration export', '! Lab: Ofis Ağı', '! Exported: 2026-11-06T20:00:00.000Z', '! Devices: 4'])
    const routerAt = lines.indexOf('! Device r1 (id: r1, kind: router, model: router2PortSerial)')
    expect(lines.slice(routerAt - 2, routerAt + 4)).toEqual(['', rule, '! Device r1 (id: r1, kind: router, model: router2PortSerial)', rule, '!', 'version 15.1'])
    const routerConfig = new DeviceConfigText(shell).lines(sampleRouter())
    expect(lines.slice(routerAt + 2, routerAt + 2 + routerConfig.length)).toEqual(routerConfig)
    expect(lines.slice(-14)).toEqual([
      'end',
      '',
      rule,
      '! Device Reception PC (id: pc1, kind: pc, model: pc)',
      rule,
      '! No command line: settings from the Config panel',
      '! eth0: 192.168.1.10 255.255.255.0',
      '! Default gateway: 192.168.1.1',
      '! DNS servers: 192.168.1.2, 8.8.8.8',
      '',
      rule,
      '! Device hub1 (id: hub1, kind: hub, model: hub8)',
      rule,
      '! No configuration',
    ])
  })

  it('leaves the export time out when none is given and ends the text with a line break', () => {
    const text = exporter.text(lab(), { title: 'Lab' })
    expect(text.startsWith('! Octetlab configuration export\n! Lab: Lab\n! Devices: 4\n\n')).toBe(true)
    expect(text.endsWith('! No configuration\n')).toBe(true)
  })

  it('splits an export back into the sections of its devices', () => {
    const network = lab()
    const text = exporter.text(network, { title: 'Lab' }).replace(/\n/g, '\r\n')
    const sections = LabConfigExport.split(text)
    expect(sections.map((section) => section.deviceId)).toEqual(['r1', 's1', 'pc1', 'hub1'])
    network.devices.forEach((device, index) => {
      expect(sections[index]?.lines).toEqual(new DeviceConfigText(shell).lines(device))
    })
  })

  it('names the download after the lab', () => {
    expect(LabConfigExport.fileName('Ofis Ağı — 2. Kat')).toBe('ofis-agi-2-kat-config.txt')
    expect(LabConfigExport.fileName('İŞLETME Lab')).toBe('isletme-lab-config.txt')
    expect(LabConfigExport.fileName('   ')).toBe('lab-config.txt')
  })
})

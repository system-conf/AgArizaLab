import { describe, expect, it } from 'vitest'
import type { Device, NetworkState, Svi } from '../domain'
import { DefaultNetworkEngine } from './DefaultNetworkEngine'
import {
  accessMode,
  editDevice,
  editPort,
  editSwitchport,
  labHost,
  labLink,
  labRouter,
  labSwitch,
  textOf,
  trunkMode,
} from './testLabs'

const engine = new DefaultNetworkEngine()

/** Router-on-a-stick: r Gi0/0.10 / .20 — sw Fa0/1 trunk; pc10 (Fa0/2, VLAN 10), pc20 (Fa0/3, VLAN 20), pc10b (Fa0/4, VLAN 10). */
function stick(): NetworkState {
  return {
    devices: [
      labRouter('r', [
        {
          id: 'Gi0/0',
          subInterfaces: [
            { vlan: 10, ip: '192.168.10.1' },
            { vlan: 20, ip: '192.168.20.1' },
          ],
        },
      ]),
      labSwitch('sw', [trunkMode(), accessMode(10), accessMode(20), accessMode(10)], [10, 20]),
      labHost('pc10', '192.168.10.5', { gateway: '192.168.10.1' }),
      labHost('pc20', '192.168.20.5', { gateway: '192.168.20.1' }),
      labHost('pc10b', '192.168.10.6', { gateway: '192.168.10.1' }),
    ],
    links: [
      labLink('uplink', ['r', 'Gi0/0'], ['sw', 'Fa0/1']),
      labLink('link10', ['pc10', 'eth0'], ['sw', 'Fa0/2']),
      labLink('link20', ['pc20', 'eth0'], ['sw', 'Fa0/3']),
      labLink('link10b', ['pc10b', 'eth0'], ['sw', 'Fa0/4']),
    ],
  }
}

function svi(vlan: number, address: string, adminUp = true): Svi {
  return { vlan, adminUp, l3: { ipv4: { addressing: 'static', address, mask: '255.255.255.0' } } }
}

/** L3 switch with SVIs Vlan10 / Vlan20 and ip routing; pcA on VLAN 10, pcB on VLAN 20. */
function sviLab(ipRouting = true): NetworkState {
  const base = labSwitch('core', [accessMode(10), accessMode(20)], [10, 20], 'l3Switch')
  const core: Device = {
    ...base,
    switching: { ...(base.switching ?? { vlans: [], defaultGateway: '' }), svis: [svi(10, '192.168.10.1'), svi(20, '192.168.20.1')] },
    routing: { ipRouting, staticRoutes: [] },
  }
  return {
    devices: [core, labHost('pcA', '192.168.10.5', { gateway: '192.168.10.1' }), labHost('pcB', '192.168.20.5', { gateway: '192.168.20.1' })],
    links: [labLink('a', ['pcA', 'eth0'], ['core', 'Fa0/1']), labLink('b', ['pcB', 'eth0'], ['core', 'Fa0/2'])],
  }
}

describe('inter-VLAN routing', () => {
  it('routes through dot1Q sub-interfaces (router-on-a-stick)', () => {
    expect(engine.reach(stick(), 'pc10', '192.168.20.5')).toEqual({ ok: true, path: ['pc10', 'sw', 'r', 'sw', 'pc20'] })
  })

  it('routes through SVIs of an L3 switch with ip routing', () => {
    expect(engine.reach(sviLab(), 'pcA', '192.168.20.5')).toEqual({ ok: true, path: ['pcA', 'core', 'pcB'] })
    expect(engine.reach(sviLab(), 'pcA', '192.168.10.1')).toEqual({ ok: true, path: ['pcA', 'core'] })
  })

  it('does not route on an L3 switch without ip routing', () => {
    expect(engine.reach(sviLab(false), 'pcA', '192.168.20.5')).toEqual({ ok: false, reason: 'gatewayUnreachable', atDeviceId: 'pcA' })
    expect(engine.reach(sviLab(false), 'pcA', '192.168.10.1')).toMatchObject({ ok: true })
  })

  it('loses a VLAN whose SVI is shut', () => {
    const state = editDevice(sviLab(), 'core', (device) => ({
      ...device,
      ...(device.switching ? { switching: { ...device.switching, svis: [svi(10, '192.168.10.1', false), svi(20, '192.168.20.1')] } } : {}),
    }))
    expect(engine.reach(state, 'pcA', '192.168.20.5')).toEqual({ ok: false, reason: 'gatewayUnreachable', atDeviceId: 'pcA' })
  })
})

describe('trunks', () => {
  it('prunes VLANs that are not in the allowed list', () => {
    const state = editSwitchport(stick(), 'sw', 'Fa0/1', { allowedVlans: [10] })
    expect(engine.reach(state, 'pc20', '192.168.20.1')).toEqual({ ok: false, reason: 'destinationNotInSegment', atDeviceId: 'pc20' })
    expect(engine.reach(state, 'pc10', '192.168.20.5')).toEqual({ ok: false, reason: 'destinationNotInSegment', atDeviceId: 'r' })
    expect(engine.reach(state, 'pc10', '192.168.10.1')).toMatchObject({ ok: true })
  })

  it('leaks untagged frames into the other side native VLAN on a native VLAN mismatch', () => {
    const lab = (farNative: number): NetworkState => ({
      devices: [
        labSwitch('swA', [accessMode(1), trunkMode(1)], [99]),
        labSwitch('swB', [trunkMode(farNative), accessMode(99)], [99]),
        labHost('hostA', '192.168.50.1'),
        labHost('hostB', '192.168.50.2'),
      ],
      links: [
        labLink('a', ['hostA', 'eth0'], ['swA', 'Fa0/1']),
        labLink('trunk', ['swA', 'Fa0/2'], ['swB', 'Fa0/1'], { cable: 'copperCross' }),
        labLink('b', ['hostB', 'eth0'], ['swB', 'Fa0/2']),
      ],
    })
    expect(engine.reach(lab(99), 'hostA', '192.168.50.2')).toEqual({ ok: true, path: ['hostA', 'swA', 'swB', 'hostB'] })
    expect(engine.reach(lab(1), 'hostA', '192.168.50.2')).toMatchObject({ ok: false, reason: 'destinationNotInSegment' })
  })
})

describe('VLAN database', () => {
  it('forwards nothing in a VLAN missing from the database, while the link light stays up', () => {
    const state = editDevice(stick(), 'sw', (device) => ({
      ...device,
      ...(device.switching ? { switching: { ...device.switching, vlans: device.switching.vlans.filter((vlan) => vlan.id !== 10) } } : {}),
    }))
    expect(engine.reach(state, 'pc10', '192.168.10.6')).toEqual({ ok: false, reason: 'destinationNotInSegment', atDeviceId: 'pc10' })
    expect(engine.reach(state, 'pc10', '8.8.8.8')).toEqual({ ok: false, reason: 'gatewayUnreachable', atDeviceId: 'pc10' })
    expect(engine.reach(state, 'pc20', '192.168.20.1')).toMatchObject({ ok: true })
    expect(engine.linkLight(state, 'link10')).toBe('up')
    expect(textOf(engine.runCommand(state, 'pc10', 'ipconfig').lines)).toContain('   IPv4 Address. . . . . . . . . . . : 192.168.10.5')
  })
})

describe('administrative shutdown', () => {
  it('reports a shut switch port as portDisabled', () => {
    const state = editPort(stick(), 'sw', 'Fa0/2', (port) => ({ ...port, adminUp: false }))
    expect(engine.reach(state, 'pc10', '192.168.10.1')).toEqual({ ok: false, reason: 'portDisabled', atDeviceId: 'sw' })
    expect(engine.linkLight(state, 'link10')).toBe('down')
  })

  it('reports a disabled host NIC as portDisabled', () => {
    const state = editPort(stick(), 'pc10', 'eth0', (port) => ({ ...port, adminUp: false }))
    expect(engine.reach(state, 'pc10', '192.168.10.1')).toEqual({ ok: false, reason: 'portDisabled', atDeviceId: 'pc10' })
  })

  it('loses the gateway behind a shut sub-interface or router port', () => {
    const subShut = editPort(stick(), 'r', 'Gi0/0', (port) =>
      port.role === 'routed' ? { ...port, subInterfaces: port.subInterfaces.map((sub) => (sub.vlan === 20 ? { ...sub, adminUp: false } : sub)) } : port,
    )
    expect(engine.reach(subShut, 'pc20', '8.8.8.8')).toEqual({ ok: false, reason: 'gatewayUnreachable', atDeviceId: 'pc20' })
    expect(engine.reach(subShut, 'pc10', '192.168.10.1')).toMatchObject({ ok: true })

    const portShut = editPort(stick(), 'r', 'Gi0/0', (port) => ({ ...port, adminUp: false }))
    expect(engine.reach(portShut, 'pc10', '8.8.8.8')).toEqual({ ok: false, reason: 'gatewayUnreachable', atDeviceId: 'pc10' })
    expect(engine.linkLight(portShut, 'uplink')).toBe('down')
  })
})

describe('other layer-2 devices', () => {
  it('repeats everything through a hub', () => {
    const hub: Device = {
      id: 'hub',
      kind: 'hub',
      modelId: 'hub',
      name: 'hub',
      powered: true,
      baseMac: '02:00:00:00:FF:01',
      ports: ['P1', 'P2'].map((id) => ({ id, medium: 'copper', role: 'passive', adminUp: true })),
    }
    const state: NetworkState = {
      devices: [hub, labHost('h1', '192.168.60.1'), labHost('h2', '192.168.60.2')],
      links: [labLink('one', ['h1', 'eth0'], ['hub', 'P1']), labLink('two', ['h2', 'eth0'], ['hub', 'P2'])],
    }
    expect(engine.reach(state, 'h1', '192.168.60.2')).toEqual({ ok: true, path: ['h1', 'hub', 'h2'] })
  })

  it('lets a layer-2 switch send from its management SVI through its default gateway', () => {
    const state = editDevice(stick(), 'sw', (device) => ({
      ...device,
      ...(device.switching ? { switching: { ...device.switching, svis: [svi(10, '192.168.10.2')], defaultGateway: '192.168.10.1' } } : {}),
    }))
    expect(engine.reach(state, 'sw', '192.168.20.5')).toEqual({ ok: true, path: ['sw', 'r', 'sw', 'pc20'] })
    expect(engine.reach(state, 'pc20', '192.168.10.2')).toMatchObject({ ok: true })
  })
})

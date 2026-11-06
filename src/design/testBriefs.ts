// Test-only: a small design brief (an office) built from catalog models, with its starting lab and
// a reference design that meets every requirement. Also the edit helpers the design tests use.
import type { DesignExerciseDefinition, DesignLab, Device, Link, NetworkState, Port } from '../domain'
import { findDeviceModel, PortFactory, SeededBaseMacSource } from '../catalog'

const MASK = '255.255.255.0'

function factory(): PortFactory {
  return new PortFactory(new SeededBaseMacSource(7))
}

function create(ports: PortFactory, modelId: string, id: string): Device {
  const model = findDeviceModel(modelId)
  if (!model) throw new Error(`Test brief uses unknown model ${modelId}`)
  return ports.createDevice(model, id, id)
}

function withPort(device: Device, portId: string, change: (port: Port) => Port): Device {
  if (!device.ports.some((port) => port.id === portId)) throw new Error(`${device.id} has no port ${portId}`)
  return { ...device, ports: device.ports.map((port) => (port.id === portId ? change(port) : port)) }
}

function addressed(port: Port, addressing: 'static' | 'dhcp', address: string): Port {
  if (port.role !== 'host' && port.role !== 'routed') throw new Error(`${port.id} has no l3`)
  return { ...port, adminUp: true, l3: { ...port.l3, ipv4: { addressing, address, mask: address === '' ? '' : MASK } } }
}

function link(id: string, a: [string, string], b: [string, string]): Link {
  return { id, a: { deviceId: a[0], portId: a[1] }, b: { deviceId: b[0], portId: b[1] }, connected: true, cable: 'copperStraight' }
}

function layoutOf(state: NetworkState): DesignLab['layout'] {
  return { devices: Object.fromEntries(state.devices.map((device, index) => [device.id, { x: 120 * index, y: 400 }])) }
}

/** The customer's devices: ISP cloud, three office PCs (DHCP, no address yet) and a printer. */
function customerDevices(ports: PortFactory): Device[] {
  return [create(ports, 'internetCloud', 'isp'), ...['pc1', 'pc2', 'pc3'].map((id) => create(ports, 'pc', id)), create(ports, 'printer', 'printer')]
}

/** The learner's infrastructure of the reference design: router (DHCP, DNS proxy, default route) and a switch. */
function referenceInfrastructure(ports: PortFactory): Device[] {
  let router = create(ports, 'router2Port', 'router')
  router = withPort(router, 'Gi0/0', (port) => addressed(port, 'static', '192.168.10.1'))
  router = withPort(router, 'Gi0/1', (port) => addressed(port, 'dhcp', ''))
  router = {
    ...router,
    routing: { ipRouting: true, staticRoutes: [{ prefix: '0.0.0.0', mask: '0.0.0.0', exitInterfaceId: 'Gi0/1', adminDistance: 1 }] },
    services: {
      dhcp: {
        enabled: true,
        pools: [
          {
            id: 'office',
            network: '192.168.10.0',
            mask: MASK,
            range: { start: '192.168.10.100', end: '192.168.10.200' },
            defaultRouter: '192.168.10.1',
            dnsServers: ['192.168.10.1'],
            leases: [],
          },
        ],
        excludedRanges: [],
      },
      dns: { enabled: true, forwarders: ['8.8.8.8'], records: [] },
    },
  }
  return [router, create(ports, 'switch8', 'switch')]
}

/** The reference printer: static 192.168.10.50 with gateway and DNS. */
function referencePrinter(printer: Device): Device {
  const configured = withPort(printer, 'eth0', (port) => addressed(port, 'static', '192.168.10.50'))
  return { ...configured, host: { defaultGateway: '192.168.10.1', dnsServers: ['192.168.10.1'], appLinks: [] } }
}

export function officeStartState(): NetworkState {
  return { devices: customerDevices(factory()), links: [] }
}

export function officeReferenceState(): NetworkState {
  const ports = factory()
  const customer = customerDevices(ports).map((device) => (device.id === 'printer' ? referencePrinter(device) : device))
  return {
    devices: [...customer, ...referenceInfrastructure(ports)],
    links: [
      link('wan', ['isp', 'eth0'], ['router', 'Gi0/1']),
      link('uplink', ['router', 'Gi0/0'], ['switch', 'Fa0/1']),
      link('pc1Link', ['pc1', 'eth0'], ['switch', 'Fa0/2']),
      link('pc2Link', ['pc2', 'eth0'], ['switch', 'Fa0/3']),
      link('pc3Link', ['pc3', 'eth0'], ['switch', 'Fa0/4']),
      link('printerLink', ['printer', 'eth0'], ['switch', 'Fa0/5']),
    ],
  }
}

/** Ids of the requirements that are limits (they hold for the empty start). */
export const OFFICE_LIMIT_IDS = ['budget', 'oneRouter']

/** Small office: 3 PCs + printer + ISP, locked in place; the learner adds router, switch and cabling. */
export function officeBrief(): DesignExerciseDefinition {
  const start = officeStartState()
  const reference = officeReferenceState()
  return {
    id: 'testOffice',
    order: 1,
    setting: 'office',
    lab: { state: start, layout: layoutOf(start), annotations: [] },
    locks: start.devices.flatMap((device) => [
      { scope: 'placement', deviceId: device.id },
      { scope: 'section', deviceId: device.id, section: 'power', access: 'readOnly' },
    ]),
    groups: [
      { id: 'office', name: 'Office PCs', deviceIds: ['pc1', 'pc2', 'pc3'] },
      { id: 'printer', name: 'Printer', deviceIds: ['printer'] },
      { id: 'staff', name: 'Staff devices', deviceIds: ['pc1', 'pc2', 'pc3', 'printer'] },
    ],
    requirements: [
      { id: 'officeOnline', condition: { type: 'internet', group: 'office' } },
      { id: 'officeDns', condition: { type: 'resolves', group: 'office', name: 'google.com' } },
      { id: 'printing', condition: { type: 'reachable', fromGroup: 'office', toGroup: 'printer' } },
      { id: 'officeDhcp', condition: { type: 'dhcpServes', group: 'office' } },
      { id: 'plan', condition: { type: 'addressPlan', group: 'staff', prefix: '192.168.10.0/24' } },
      { id: 'oneSegment', condition: { type: 'sameVlan', group: 'staff' } },
      { id: 'hasRouter', condition: { type: 'uses', capability: 'routing' } },
      {
        id: 'printingOffline',
        condition: { type: 'survivesFailure', failure: { scope: 'device', deviceId: 'isp' }, requirement: { type: 'reachable', fromGroup: 'office', toGroup: 'printer' } },
      },
      { id: 'budget', condition: { type: 'maxCost', amount: 1000 } },
      { id: 'oneRouter', condition: { type: 'maxDevices', kind: 'router', count: 1 } },
      { id: 'printerOnline', condition: { type: 'internet', group: 'printer' }, hidden: true, weight: 2 },
    ],
    budget: 1000,
    allowedModels: { categories: ['routers', 'switches'], modelIds: ['accessPoint'] },
    reference: { state: reference, layout: layoutOf(reference), annotations: [] },
    reviewHints: [{ id: 'presentation' }, { id: 'dhcpScope', requirementId: 'officeDhcp' }],
  }
}

/** Replaces one device of `state`. */
export function editDevice(state: NetworkState, deviceId: string, change: (device: Device) => Device): NetworkState {
  if (!state.devices.some((device) => device.id === deviceId)) throw new Error(`No device ${deviceId}`)
  return { ...state, devices: state.devices.map((device) => (device.id === deviceId ? change(device) : device)) }
}

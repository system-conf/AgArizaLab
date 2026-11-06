// Switch, L3 switch and hub models. switch8 / switch8Poe are what v1 switches migrate to
// (MODEL_V2 §11): exactly Fa0/1…Fa0/8 plus Console, so they carry no uplink ports.
// switch5 is a compact desktop switch: five Gigabit ports, no console (not managed from a CLI).
import type { DeviceCapability } from '../../domain'
import {
  consoleTemplate,
  numberedPorts,
  portTemplate,
  PORT_SPEEDS,
  type CatalogPortTemplate,
} from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

interface AccessSwitchSpec {
  id: string
  /** Port id prefix of the access ports, e.g. 'Fa0/' or 'Gi1/0/'. */
  prefix: string
  accessPorts: number
  /** Speeds of the access ports (Fast Ethernet or Gigabit copper). */
  speeds: readonly number[]
  poe: boolean
  uplinks: readonly CatalogPortTemplate[]
  /** false: no console port and no CLI (unmanaged desktop switch). Default true. */
  managed?: boolean
}

function copperAccess(speeds: readonly number[], poe: boolean) {
  return (id: string) => portTemplate(id, 'copper', 'switched', speeds, 'access', poe)
}

function copperUplink(id: string) {
  return portTemplate(id, 'copper', 'switched', PORT_SPEEDS.gigabit, 'uplink')
}

function fiberUplink(id: string) {
  return portTemplate(id, 'fiber', 'switched', PORT_SPEEDS.gigabitFiber, 'uplink')
}

const twoCopperUplinks = numberedPorts('Gi0/', 1, 2, copperUplink)
const fourFiberUplinks = numberedPorts('Gi0/', 1, 4, fiberUplink)
const gigabitFiberUplinks = numberedPorts('Gi1/1/', 1, 4, fiberUplink)

/** Fixed-configuration access switch: access ports, optional uplinks, Console when managed. */
function accessSwitch(spec: AccessSwitchSpec): CatalogDeviceModel {
  const managed = spec.managed ?? true
  const capabilities: DeviceCapability[] = [
    'l2Switching',
    ...(managed ? ['deviceCli' as const] : []),
    ...(spec.poe ? ['poe' as const] : []),
  ]
  return defineModel({
    id: spec.id,
    kind: 'switch',
    category: 'switches',
    subcategory: 'switch',
    ports: [
      ...numberedPorts(spec.prefix, 1, spec.accessPorts, copperAccess(spec.speeds, spec.poe)),
      ...spec.uplinks,
      ...(managed ? [consoleTemplate()] : []),
    ],
    capabilities,
  })
}

function fastEthernetSwitch(id: string, accessPorts: number, poe: boolean, uplinks: readonly CatalogPortTemplate[]) {
  return accessSwitch({ id, prefix: 'Fa0/', accessPorts, speeds: PORT_SPEEDS.fastEthernet, poe, uplinks })
}

function gigabitSwitch(id: string, poe: boolean) {
  return accessSwitch({ id, prefix: 'Gi1/0/', accessPorts: 24, speeds: PORT_SPEEDS.gigabit, poe, uplinks: gigabitFiberUplinks })
}

export const switchModels: readonly CatalogDeviceModel[] = [
  accessSwitch({ id: 'switch5', prefix: 'Gi0/', accessPorts: 5, speeds: PORT_SPEEDS.gigabit, poe: false, uplinks: [], managed: false }),
  fastEthernetSwitch('switch8', 8, false, []),
  fastEthernetSwitch('switch8Poe', 8, true, []),
  fastEthernetSwitch('switch16', 16, false, twoCopperUplinks),
  fastEthernetSwitch('switch16Poe', 16, true, twoCopperUplinks),
  fastEthernetSwitch('switch24', 24, false, twoCopperUplinks),
  fastEthernetSwitch('switch24Poe', 24, true, twoCopperUplinks),
  gigabitSwitch('switch24Gig', false),
  gigabitSwitch('switch24GigPoe', true),
  fastEthernetSwitch('switch48', 48, false, fourFiberUplinks),
  fastEthernetSwitch('switch48Poe', 48, true, fourFiberUplinks),
  defineModel({
    id: 'l3Switch24',
    kind: 'l3Switch',
    category: 'switches',
    subcategory: 'switch',
    ports: [
      ...numberedPorts('Gi1/0/', 1, 24, (id) => portTemplate(id, 'copper', 'switched', PORT_SPEEDS.gigabit, 'access')),
      ...gigabitFiberUplinks,
      consoleTemplate(),
    ],
    capabilities: ['l2Switching', 'l3Switching', 'routing', 'dhcpServer', 'deviceCli'],
  }),
  defineModel({
    id: 'hub8',
    kind: 'hub',
    category: 'switches',
    subcategory: 'hub',
    ports: numberedPorts('Port', 1, 8, (id) => portTemplate(id, 'copper', 'passive', PORT_SPEEDS.fastEthernet, 'shared')),
    capabilities: ['repeater'],
  }),
]

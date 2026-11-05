// Switch, L3 switch and hub models. switch8 / switch8Poe are what v1 switches migrate to
// (MODEL_V2 §11): exactly Fa0/1…Fa0/8 plus Console, so they carry no uplink ports.
import type { DeviceCapability } from '../../domain/v2'
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
  accessPorts: number
  poe: boolean
  uplinks: readonly CatalogPortTemplate[]
}

function fastEthernetAccess(poe: boolean) {
  return (id: string) => portTemplate(id, 'copper', 'switched', PORT_SPEEDS.fastEthernet, 'access', poe)
}

function copperUplink(id: string) {
  return portTemplate(id, 'copper', 'switched', PORT_SPEEDS.gigabit, 'uplink')
}

function fiberUplink(id: string) {
  return portTemplate(id, 'fiber', 'switched', PORT_SPEEDS.gigabitFiber, 'uplink')
}

/** Fixed-configuration access switch: Fa0/1…Fa0/n, optional Gi0/x uplinks, Console. */
function accessSwitch(spec: AccessSwitchSpec): CatalogDeviceModel {
  const capabilities: DeviceCapability[] = ['l2Switching', 'deviceCli', ...(spec.poe ? ['poe' as const] : [])]
  return defineModel({
    id: spec.id,
    kind: 'switch',
    category: 'switches',
    ports: [
      ...numberedPorts('Fa0/', 1, spec.accessPorts, fastEthernetAccess(spec.poe)),
      ...spec.uplinks,
      consoleTemplate(),
    ],
    capabilities,
  })
}

const twoCopperUplinks = numberedPorts('Gi0/', 1, 2, copperUplink)
const fourFiberUplinks = numberedPorts('Gi0/', 1, 4, fiberUplink)

export const switchModels: readonly CatalogDeviceModel[] = [
  accessSwitch({ id: 'switch8', accessPorts: 8, poe: false, uplinks: [] }),
  accessSwitch({ id: 'switch8Poe', accessPorts: 8, poe: true, uplinks: [] }),
  accessSwitch({ id: 'switch24', accessPorts: 24, poe: false, uplinks: twoCopperUplinks }),
  accessSwitch({ id: 'switch24Poe', accessPorts: 24, poe: true, uplinks: twoCopperUplinks }),
  accessSwitch({ id: 'switch48', accessPorts: 48, poe: false, uplinks: fourFiberUplinks }),
  accessSwitch({ id: 'switch48Poe', accessPorts: 48, poe: true, uplinks: fourFiberUplinks }),
  defineModel({
    id: 'l3Switch24',
    kind: 'l3Switch',
    category: 'switches',
    ports: [
      ...numberedPorts('Gi1/0/', 1, 24, (id) => portTemplate(id, 'copper', 'switched', PORT_SPEEDS.gigabit, 'access')),
      ...numberedPorts('Gi1/1/', 1, 4, fiberUplink),
      consoleTemplate(),
    ],
    capabilities: ['l2Switching', 'l3Switching', 'routing', 'dhcpServer', 'deviceCli'],
  }),
  defineModel({
    id: 'hub8',
    kind: 'hub',
    category: 'switches',
    ports: numberedPorts('Port', 1, 8, (id) => portTemplate(id, 'copper', 'passive', PORT_SPEEDS.fastEthernet, 'shared')),
    capabilities: ['repeater'],
  }),
]

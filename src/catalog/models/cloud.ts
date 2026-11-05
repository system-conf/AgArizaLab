// The internet / ISP cloud. A migrated cloud gets eth0…eth3 (more only when a v1 lab had more
// links to it, MODEL_V2 §11); each port is one service handoff (IspHandoff, MODEL_V2 §5).
import { numberedPorts, portTemplate, PORT_SPEEDS } from '../portTemplates'
import { defineModel, type CatalogDeviceModel } from './defineModel'

export const cloudModels: readonly CatalogDeviceModel[] = [
  defineModel({
    id: 'internetCloud',
    kind: 'internet',
    category: 'wan',
    ports: numberedPorts('eth', 0, 3, (id) => portTemplate(id, 'copper', 'passive', PORT_SPEEDS.gigabit, 'handoff')),
    capabilities: ['internetService'],
  }),
]

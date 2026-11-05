import type { Scenario } from '../domain/ScenarioTypes'
import { cameraSubnet } from './cameraSubnet'
import { kitchenVlan } from './kitchenVlan'
import { posGateway } from './posGateway'
import { printerDhcp } from './printerDhcp'
import { wrongDns } from './wrongDns'

export const scenarios: Scenario[] = [
  posGateway,
  printerDhcp,
  cameraSubnet,
  kitchenVlan,
  wrongDns,
].sort((first, second) => first.order - second.order)

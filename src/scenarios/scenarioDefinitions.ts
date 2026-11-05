import type { ScenarioDefinition } from '../domain/ScenarioTypes'
import { cameraSubnet } from './cameraSubnet'
import { kitchenVlan } from './kitchenVlan'
import { posGateway } from './posGateway'
import { printerDhcp } from './printerDhcp'
import { wrongDns } from './wrongDns'

/** Every exercise (text-free data), sorted by order. Texts: `exercises` namespace, see docs/I18N.md §5. */
export const scenarioDefinitions: readonly ScenarioDefinition[] = [
  posGateway,
  printerDhcp,
  cameraSubnet,
  kitchenVlan,
  wrongDns,
].sort((first, second) => first.order - second.order)

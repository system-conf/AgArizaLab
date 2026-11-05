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

/**
 * Scenarios in the current UI language. Stub for wave 1.0: returns the existing Turkish data.
 * Agent X1 replaces it with ScenarioDefinition data + texts from the `exercises` namespace.
 */
export function useLocalizedScenarios(): Scenario[] {
  return scenarios
}

// The catalog models the v1 migration refers to must describe exactly the ports it creates
// (MODEL_V2 §11, §14): every migrated device of every exercise is checked against its model.
import { describe, expect, it } from 'vitest'
import type { DeviceV2 } from '../domain/v2'
import { migrateV1ToV2 } from '../lab/migrations'
import { scenarioDefinitions } from '../scenarios/scenarioDefinitions'
import { findDeviceModel } from './DeviceCatalog'

function portShape(port: { id: string; medium: string; role: string; poe?: unknown }) {
  return { id: port.id, medium: port.medium, role: port.role, poe: port.poe !== undefined && port.poe !== false }
}

function modelShape(device: DeviceV2) {
  const model = findDeviceModel(device.modelId)
  if (model === undefined) throw new Error(`no catalog model ${device.modelId} for ${device.id}`)
  return { kind: model.kind, ports: model.ports.map(portShape) }
}

describe('catalog ↔ v1 migration', () => {
  describe.each(scenarioDefinitions.map((definition) => [definition.id, definition] as const))('%s', (_, definition) => {
    const state = migrateV1ToV2(definition.initialState)

    it.each(state.devices.map((device) => [device.id, device] as const))('%s matches its model', (_, device) => {
      expect({ kind: device.kind, ports: device.ports.map(portShape) }).toEqual(modelShape(device))
    })
  })
})

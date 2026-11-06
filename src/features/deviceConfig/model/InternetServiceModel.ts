// Service lines of the internet cloud (`IspHandoff.serviceUp`, MODEL_V2 §5).
import type { Device, InternetSettings } from '../../../domain'

export interface ServiceLineDraft {
  portId: string
  serviceUp: boolean
}

export class InternetServiceModel {
  /** One line per port of the cloud; a port without a handoff entry has service. */
  static serviceLines(device: Device): ServiceLineDraft[] {
    const handoffs = device.internet?.handoffs ?? []
    return device.ports.map((port) => ({
      portId: port.id,
      serviceUp: handoffs.find((handoff) => handoff.portId === port.id)?.serviceUp ?? true,
    }))
  }

  /** Keeps an entry for every port that had one or is now down; ports without entries stay up. */
  static apply(lines: readonly ServiceLineDraft[], device: Device): InternetSettings {
    const previous = device.internet?.handoffs ?? []
    const handoffs = lines
      .filter((line) => !line.serviceUp || previous.some((handoff) => handoff.portId === line.portId))
      .map((line) => {
        const old = previous.find((handoff) => handoff.portId === line.portId)
        return { ...old, portId: line.portId, serviceUp: line.serviceUp }
      })
    return { ...device.internet, handoffs }
  }
}

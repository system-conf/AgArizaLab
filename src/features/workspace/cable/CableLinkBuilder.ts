// Turns the cable tool's choices (tool + two ports + SSID) into a CableRequest / LinkV2.
import { CableRules } from '../../../domain/v2'
import type { CableRequest, CableTool, CableType, LinkEndV2, LinkV2, NetworkStateV2 } from '../../../domain/v2'

export class CableLinkBuilder {
  private readonly rules: CableRules

  constructor(rules: CableRules = new CableRules()) {
    this.rules = rules
  }

  /** The cable to lay: the tool itself, or the textbook cable for 'auto' (null = no cable fits). */
  resolveCable(network: NetworkStateV2, tool: CableTool, a: LinkEndV2, b: LinkEndV2): CableType | null {
    return tool === 'auto' ? this.rules.autoCable(network, a, b) : tool
  }

  /** Serial: the first end (`a`) is the DCE. Wireless: `ssid` names the joined network. */
  request(cable: CableType, a: LinkEndV2, b: LinkEndV2, ssid = ''): CableRequest {
    switch (cable) {
      case 'serial':
        return { a, b, cable, dceEnd: 'a' }
      case 'wireless':
        return { a, b, cable, ssid: ssid.trim() }
      default:
        return { a, b, cable }
    }
  }

  /** A new, plugged-in link from a checked request. */
  link(request: CableRequest, id: string): LinkV2 {
    return { ...request, id, connected: true }
  }

  /** SSIDs offered by the radio end(s) of a wireless association, for the SSID picker. */
  ssidOptions(network: NetworkStateV2, a: LinkEndV2, b: LinkEndV2): string[] {
    const options: string[] = []
    for (const end of [a, b]) {
      const device = network.devices.find((candidate) => candidate.id === end.deviceId)
      const port = device?.ports.find((candidate) => candidate.id === end.portId)
      if (!device || port?.role !== 'radio') continue
      for (const entry of device.wireless?.ssids ?? []) {
        if (!options.includes(entry.ssid)) options.push(entry.ssid)
      }
    }
    return options
  }
}

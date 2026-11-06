// State machine of the cable tool: pick a cable → device A → port → device B → port (→ SSID).
// Immutable: every transition returns a new CableToolState. The UI connects the finished request.
import type { CableRefusal, CableRequest, CableTool, LinkEnd, NetworkState } from '../../../domain'
import { CableLinkBuilder } from './CableLinkBuilder'

export type CableStep =
  | { kind: 'off' }
  /** Waiting for a click on the first device. */
  | { kind: 'firstDevice'; tool: CableTool }
  /** Port picker open on the first device. */
  | { kind: 'firstPort'; tool: CableTool; deviceId: string }
  /** First end chosen; waiting for a click on the second device. */
  | { kind: 'secondDevice'; tool: CableTool; first: LinkEnd }
  /** Port picker open on the second device. */
  | { kind: 'secondPort'; tool: CableTool; first: LinkEnd; deviceId: string }
  /** Wireless association: both ends chosen, waiting for the SSID. */
  | { kind: 'ssid'; tool: CableTool; first: LinkEnd; second: LinkEnd; options: string[] }

export type CableToolOutcome =
  /** Nothing to connect yet. */
  | { kind: 'continue'; state: CableToolState }
  /** Both ends (and SSID) known: check and connect `request`. The tool waits for the next cable. */
  | { kind: 'ready'; state: CableToolState; request: CableRequest }
  /** No cable can join the chosen ports ('auto' found none). */
  | { kind: 'refused'; state: CableToolState; reason: CableRefusal }

export class CableToolState {
  readonly step: CableStep
  private readonly builder: CableLinkBuilder

  private constructor(step: CableStep, builder: CableLinkBuilder) {
    this.step = step
    this.builder = builder
  }

  static off(builder: CableLinkBuilder = new CableLinkBuilder()): CableToolState {
    return new CableToolState({ kind: 'off' }, builder)
  }

  get active(): boolean {
    return this.step.kind !== 'off'
  }

  get tool(): CableTool | null {
    return this.step.kind === 'off' ? null : this.step.tool
  }

  /** The chosen first end, while the second one is being picked. */
  get firstEnd(): LinkEnd | null {
    switch (this.step.kind) {
      case 'secondDevice':
      case 'secondPort':
      case 'ssid':
        return this.step.first
      default:
        return null
    }
  }

  /** Device whose port picker is open, and which end it is for. */
  get portMenu(): { deviceId: string; end: 'first' | 'second' } | null {
    if (this.step.kind === 'firstPort') return { deviceId: this.step.deviceId, end: 'first' }
    if (this.step.kind === 'secondPort') return { deviceId: this.step.deviceId, end: 'second' }
    return null
  }

  /** Picks a cable (or 'auto') and starts over at the first device. */
  choose(tool: CableTool): CableToolState {
    return this.with({ kind: 'firstDevice', tool })
  }

  /** A device was clicked on the canvas: opens its port picker (or moves the open one there). */
  clickDevice(deviceId: string): CableToolState {
    const step = this.step
    switch (step.kind) {
      case 'firstDevice':
      case 'firstPort':
        return this.with({ kind: 'firstPort', tool: step.tool, deviceId })
      case 'secondDevice':
      case 'secondPort':
        return this.with({ kind: 'secondPort', tool: step.tool, first: step.first, deviceId })
      case 'off':
      case 'ssid':
        return this
    }
  }

  /** A port was picked in the open port picker. */
  pickPort(network: NetworkState, portId: string): CableToolOutcome {
    const step = this.step
    if (step.kind === 'firstPort') {
      const first = { deviceId: step.deviceId, portId }
      return { kind: 'continue', state: this.with({ kind: 'secondDevice', tool: step.tool, first }) }
    }
    if (step.kind !== 'secondPort') return { kind: 'continue', state: this }

    const second = { deviceId: step.deviceId, portId }
    const cable = this.builder.resolveCable(network, step.tool, step.first, second)
    if (cable === null) {
      const back = this.with({ kind: 'secondDevice', tool: step.tool, first: step.first })
      return { kind: 'refused', state: back, reason: 'cableDoesNotFitPort' }
    }
    if (cable === 'wireless') {
      const options = this.builder.ssidOptions(network, step.first, second)
      return { kind: 'continue', state: this.with({ kind: 'ssid', tool: step.tool, first: step.first, second, options }) }
    }
    const request = this.builder.request(cable, step.first, second)
    return { kind: 'ready', state: this.choose(step.tool), request }
  }

  /** The SSID for a wireless association was entered or picked. */
  submitSsid(ssid: string): CableToolOutcome {
    const step = this.step
    if (step.kind !== 'ssid') return { kind: 'continue', state: this }
    const request = this.builder.request('wireless', step.first, step.second, ssid)
    return { kind: 'ready', state: this.choose(step.tool), request }
  }

  /** Esc: one step back (closing a picker keeps the chosen end); from the first step, tool off. */
  back(): CableToolState {
    const step = this.step
    switch (step.kind) {
      case 'off':
        return this
      case 'firstDevice':
        return this.with({ kind: 'off' })
      case 'firstPort':
      case 'secondDevice':
        return this.with({ kind: 'firstDevice', tool: step.tool })
      case 'secondPort':
      case 'ssid':
        return this.with({ kind: 'secondDevice', tool: step.tool, first: step.first })
    }
  }

  stop(): CableToolState {
    return this.with({ kind: 'off' })
  }

  private with(step: CableStep): CableToolState {
    return new CableToolState(step, this.builder)
  }
}

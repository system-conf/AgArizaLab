// Test-only helpers: catalog devices and a driver that types lines into a CliShell like the UI would.
import { findDeviceModel } from '../../catalog/DeviceCatalog'
import { PortFactory } from '../../catalog/PortFactory'
import type { Device, TerminalLine } from '../../domain'
import type { CliCommandSet, CliEnvironment, CliSessionState, CliStep } from '../contract'
import { CliShell } from './CliShell'

export function catalogDevice(modelId: string, id: string, baseMac: string): Device {
  const model = findDeviceModel(modelId)
  if (model === undefined) throw new Error(`No catalog model ${modelId}`)
  return PortFactory.createDevice(model, id, id, { baseMac })
}

/** router2PortSerial: Gi0/0, Gi0/1, Se0/0/0, Se0/0/1, Console. */
export function testRouter(): Device {
  return catalogDevice('router2PortSerial', 'r1', '00:D0:BA:00:00:01')
}

/** switch24: Fa0/1 … Fa0/24, Gi0/1, Gi0/2, Console; VLAN 1 and a shut Vlan1 SVI. */
export function testSwitch(): Device {
  return catalogDevice('switch24', 's1', '00:D0:BA:00:00:02')
}

export function textOf(lines: readonly TerminalLine[]): string[] {
  return lines.map((line) => line.text ?? `{${line.message?.key ?? ''}}`)
}

/** Types into one session and keeps the device the way the lab would (applies step.device). */
export class CliDriver {
  readonly shell: CliShell
  device: Device
  state: CliSessionState
  last: CliStep

  constructor(device: Device, sets: readonly CliCommandSet[] = []) {
    this.shell = new CliShell(sets)
    this.device = device
    this.last = this.shell.open(device)
    this.state = this.last.state
  }

  get env(): CliEnvironment {
    return { network: { devices: [this.device], links: [] }, runtime: undefined, now: 0 }
  }

  get prompt(): string {
    return this.last.prompt
  }

  /** Enter after `input`; returns the output text. */
  type(input: string): string[] {
    return this.take(this.shell.submit(this.state, this.device, this.env, input))
  }

  /** Several lines; returns the output of the last one. */
  typeAll(...inputs: readonly string[]): string[] {
    let output: string[] = []
    for (const input of inputs) output = this.type(input)
    return output
  }

  help(input: string): string[] {
    return this.take(this.shell.help(this.state, this.device, input))
  }

  take(step: CliStep): string[] {
    this.last = step
    this.state = step.state
    if (step.device !== undefined) this.device = step.device
    return textOf(step.lines)
  }
}

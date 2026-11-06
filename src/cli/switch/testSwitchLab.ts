// Test-only: a small lab around a switch and a golden-transcript runner. A transcript is what the console
// shows: `prompt + input` lines followed by the output. `run` types every input it finds after the current
// prompt and returns the transcript the shell actually produced, so a test compares it with the golden one.
// Answers to secret prompts are written after the prompt like any other answer. Trailing spaces are ignored.
import type { Device, Link, NetworkState } from '../../domain'
import type { DeviceRuntime, MacTableEntry } from '../../sim/contract'
import { RuntimeTables } from '../../sim/core/RuntimeTables'
import type { CliCommandSet, CliEnvironment, CliSessionState, CliStep } from '../contract'
import { CliShell } from '../core/CliShell'
import { LinkStatus } from '../core/LinkStatus'
import { catalogDevice, testSwitch, textOf } from '../core/testCli'
import { standaloneSwitchCommandSet } from './switchCommandSet'

/** Removes the common indentation, the first and last empty line and trailing spaces. */
export function golden(text: string): string {
  const lines = text.replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '').split(/\r?\n/)
  const indents = lines.filter((line) => line.trim() !== '').map((line) => line.length - line.trimStart().length)
  const indent = Math.min(...indents)
  return lines.map((line) => line.slice(indent).trimEnd()).join('\n')
}

export function cable(id: string, a: [string, string], b: [string, string]): Link {
  return { id, a: { deviceId: a[0], portId: a[1] }, b: { deviceId: b[0], portId: b[1] }, connected: true, cable: 'copperStraight' }
}

/** switch24 's1' with PCs on Fa0/1 and Fa0/2 and a second switch 's2' on Gi0/1 (Gi0/1 there). */
export function cabledLab(): NetworkState {
  return {
    devices: [
      testSwitch(),
      catalogDevice('pc', 'pc1', '00:D0:BA:00:01:01'),
      catalogDevice('pc', 'pc2', '00:D0:BA:00:01:02'),
      catalogDevice('switch24', 's2', '00:D0:BA:00:01:03'),
    ],
    links: [
      cable('l1', ['s1', 'Fa0/1'], ['pc1', 'eth0']),
      cable('l2', ['s1', 'Fa0/2'], ['pc2', 'eth0']),
      { ...cable('l3', ['s1', 'Gi0/1'], ['s2', 'Gi0/1']), cable: 'copperCross' },
    ],
  }
}

export function macRuntime(deviceId: string, entries: readonly MacTableEntry[]): DeviceRuntime {
  const empty = RuntimeTables.empty(deviceId)
  return { ...empty, link: { ...empty.link, macTable: entries } }
}

export interface TranscriptOptions {
  readonly sets?: readonly CliCommandSet[]
  readonly network?: NetworkState
  readonly runtime?: DeviceRuntime
  readonly now?: number
}

/** One console session on `device` inside `network`; the device follows every step like the lab would. */
export class SwitchTranscript {
  readonly shell: CliShell
  device: Device
  state: CliSessionState
  last: CliStep
  runtime: DeviceRuntime | undefined
  now: number
  private readonly network: NetworkState

  constructor(device: Device, options: TranscriptOptions = {}) {
    this.shell = new CliShell(options.sets ?? [standaloneSwitchCommandSet])
    this.device = device
    this.network = options.network ?? { devices: [device], links: [] }
    this.runtime = options.runtime
    this.now = options.now ?? 0
    this.last = this.shell.open(device)
    this.state = this.last.state
  }

  get env(): CliEnvironment {
    return { network: LinkStatus.withDevice(this.network, this.device), runtime: this.runtime, now: this.now }
  }

  /** Types the inputs of `transcript`; returns what the console showed (compare with the golden text). */
  run(transcript: string): string {
    const expected = transcript.split('\n')
    const produced: string[] = []
    while (produced.length < expected.length) {
      const line = expected[produced.length] ?? ''
      const prompt = this.last.prompt
      if (!line.startsWith(prompt.trimEnd())) break
      const input = line.slice((line.startsWith(prompt) ? prompt : prompt.trimEnd()).length)
      produced.push(`${prompt}${input}`.trimEnd())
      const step = input.endsWith('?')
        ? this.shell.help(this.state, this.device, input.slice(0, -1))
        : this.shell.submit(this.state, this.device, this.env, input)
      produced.push(...this.take(step).map((text) => text.trimEnd()))
    }
    return produced.join('\n')
  }

  /** Several commands without checking their output. */
  typeAll(...inputs: readonly string[]): void {
    for (const input of inputs) this.take(this.shell.submit(this.state, this.device, this.env, input))
  }

  take(step: CliStep): string[] {
    this.last = step
    this.state = step.state
    if (step.device !== undefined) this.device = step.device
    return textOf(step.lines)
  }
}

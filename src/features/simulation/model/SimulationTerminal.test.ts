import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../../domain'
import { labHost, labLink, labSwitch, accessMode } from '../../../engine/testLabs'
import { dhcpLab } from '../../../sim/services/testServiceLabs'
import { SimJobs } from '../../../workers/simJobs'
import { applyEffects, createSimulationEngine, type WorkerJobs } from '../simulationServices'
import type { RealtimeReplay } from './RealtimeReplay'
import { SimulationPlayer } from './SimulationPlayer'
import { SimulationTerminal, type FinishedCommand } from './SimulationTerminal'

const MAIN_THREAD: WorkerJobs = { usesWorker: () => false, command: (job) => Promise.resolve(new SimJobs().command(job)) }

function twoPcs(): NetworkState {
  return {
    devices: [labHost('pc1', '192.168.1.1'), labHost('pc2', '192.168.1.2'), labSwitch('sw', [accessMode(1), accessMode(1)])],
    links: [labLink('l1', ['pc1', 'eth0'], ['sw', 'Fa0/1']), labLink('l2', ['pc2', 'eth0'], ['sw', 'Fa0/2'])],
  }
}

function setup(lab: NetworkState, worker: WorkerJobs = MAIN_THREAD) {
  const player = new SimulationPlayer(createSimulationEngine, lab)
  const replays: (RealtimeReplay | null)[] = []
  const terminal = new SimulationTerminal(player, worker, (replay) => replays.push(replay))
  const finished: FinishedCommand[] = []
  terminal.subscribe((command) => finished.push(command))
  return { player, terminal, replays, finished }
}

function text(lines: readonly { text?: string }[]): string {
  return lines.map((line) => line.text ?? '').join('\n')
}

describe('SimulationTerminal', () => {
  it('runs a realtime ping to its end on the player and replays its frames', () => {
    const { player, terminal, replays } = setup(twoPcs())
    const progress = terminal.start('pc1', 'ping 192.168.1.2', 'realtime')
    expect(progress.kind).toBe('done')
    if (progress.kind !== 'done') return
    expect(text(progress.outcome.lines)).toContain('Reply from 192.168.1.2: bytes=32')
    expect(replays[0]?.hops.length).toBeGreaterThan(0)
    expect(player.getView().transmissions.length).toBeGreaterThan(0)
  })

  it('renews DHCP in realtime; the document takes the engine state and the engine stays put', () => {
    const lab = dhcpLab()
    const { player, terminal } = setup(lab)
    const progress = terminal.start('pc', 'ipconfig /renew', 'realtime')
    if (progress.kind !== 'done') throw new Error('renew did not finish')
    const { nextState, effects } = progress.outcome
    expect(progress.labBefore).toBe(lab)
    expect(nextState).toBeDefined()
    expect(effects.length).toBeGreaterThan(0)
    expect(applyEffects(lab, effects)).toEqual(nextState)
    const serial = player.getView()
    if (nextState) player.reconfigure(nextState)
    expect(player.getView()).toBe(serial)
  })

  it('queues in simulation mode and announces the answer once the learner stepped to it', () => {
    const { player, terminal, finished } = setup(twoPcs())
    const progress = terminal.start('pc1', 'ping 192.168.1.2', 'simulation')
    expect(progress).toEqual({ kind: 'pending', waitsFor: 'steps' })
    player.stepForward()
    expect(finished).toEqual([])
    while (player.stepForward() !== null) {
      // step to the end
    }
    expect(finished).toHaveLength(1)
    const [command] = finished
    expect(command?.deviceId).toBe('pc1')
    expect(command?.result.kind === 'done' && text(command.result.outcome.lines)).toContain('Reply from 192.168.1.2')
  })

  it('finishes queued commands when the learner switches to realtime, cancels them on reset', () => {
    const { player, terminal, finished } = setup(twoPcs())
    terminal.start('pc1', 'ping 192.168.1.2', 'simulation')
    player.runToIdle()
    expect(finished.map((command) => command.result.kind)).toEqual(['done'])

    terminal.start('pc2', 'ping 192.168.1.1', 'simulation')
    player.reset()
    expect(finished.map((command) => command.result.kind)).toEqual(['done', 'cancelled'])
  })

  it('runs large-lab commands in the worker and takes over its state and frames', async () => {
    const jobs = new SimJobs()
    const calls: string[] = []
    const worker: WorkerJobs = {
      usesWorker: () => true,
      command: (job) => {
        calls.push(job.line)
        return Promise.resolve(jobs.command(job))
      },
    }
    const { player, terminal, finished, replays } = setup(twoPcs(), worker)
    expect(terminal.start('pc1', 'ping 192.168.1.2', 'realtime')).toEqual({ kind: 'pending', waitsFor: 'worker' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual(['ping 192.168.1.2'])
    expect(finished).toHaveLength(1)
    const [command] = finished
    expect(command?.result.kind === 'done' && text(command.result.outcome.lines)).toContain('Reply from 192.168.1.2')
    expect(player.getView().transmissions.length).toBeGreaterThan(0)
    expect(replays).toHaveLength(1)
  })
})

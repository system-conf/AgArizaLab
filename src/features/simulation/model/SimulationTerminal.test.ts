import { describe, expect, it } from 'vitest'
import type { NetworkState } from '../../../domain'
import { labHost, labLink, labSwitch, accessMode } from '../../../engine/testLabs'
import { dhcpLab } from '../../../sim/services/testServiceLabs'
import { SimJobs } from '../../../workers/simJobs'
import { simulationRuntime } from '../simulationRuntime'
import { addressesOf, type WorkerJobs } from '../simulationServices'
import type { RealtimeReplay } from './RealtimeReplay'
import { localBuild } from './simFixtures'
import { SimulationPlayer, type EngineBuild } from './SimulationPlayer'
import { SimulationTerminal, type FinishedCommand } from './SimulationTerminal'

const MAIN_THREAD: WorkerJobs = {
  usesWorker: () => false,
  command: (job) => Promise.resolve(new SimJobs().command(job)),
  prepare: (state) => Promise.resolve(new SimJobs().prepare(state)),
}

function twoPcs(): NetworkState {
  return {
    devices: [labHost('pc1', '192.168.1.1'), labHost('pc2', '192.168.1.2'), labSwitch('sw', [accessMode(1), accessMode(1)])],
    links: [labLink('l1', ['pc1', 'eth0'], ['sw', 'Fa0/1']), labLink('l2', ['pc2', 'eth0'], ['sw', 'Fa0/2'])],
  }
}

function setup(lab: NetworkState, worker: WorkerJobs = MAIN_THREAD, build: EngineBuild = localBuild()) {
  const player = new SimulationPlayer(build, lab)
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
    expect(simulationRuntime.applyEffects(lab, effects)).toEqual(nextState)
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
      prepare: (state) => Promise.resolve(jobs.prepare(state)),
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

  it('waits for the engine when a command is typed while it is prepared, then runs it', async () => {
    let finish: () => void = () => {}
    const local = localBuild()
    const build: EngineBuild = (network) => new Promise((resolve) => (finish = () => resolve(local(network))))
    const { player, terminal, finished } = setup(twoPcs(), MAIN_THREAD, build)
    expect(terminal.start('pc1', 'ping 192.168.1.2', 'realtime')).toEqual({ kind: 'pending', waitsFor: 'preparing' })
    expect(terminal.start('pc2', 'ping 192.168.1.1', 'simulation')).toEqual({ kind: 'pending', waitsFor: 'preparing' })
    finish()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(finished.map((command) => [command.deviceId, command.result.kind])).toEqual([['pc1', 'done']])
    // The simulation-mode command was queued once the engine ran; it answers when stepped to its end.
    while (player.stepForward() !== null) {
      // step to the end
    }
    expect(finished.map((command) => [command.deviceId, command.result.kind])).toEqual([
      ['pc1', 'done'],
      ['pc2', 'done'],
    ])
  })

  it('undoes a DHCP lease in the document on a step back past it and announces it again stepping forward', () => {
    let document = dhcpLab()
    const { player, terminal, finished } = setup(document)
    // The workspace: a finished command updates the document, a reverted one restores it; the engine follows.
    terminal.subscribe(({ result }) => {
      if (result.kind === 'done') document = result.stateAfter(document)
      else if (result.kind === 'reverted') document = result.restoredState
      player.reconfigure(document)
    })
    const addressOfPc = () => {
    const pc = document.devices.find((device) => device.id === 'pc')
    return pc ? (addressesOf(pc)[0] ?? '') : ''
  }

    expect(terminal.start('pc', 'ipconfig /renew', 'simulation')).toEqual({ kind: 'pending', waitsFor: 'steps' })
    let steps = 0
    while (player.stepForward() !== null) steps += 1
    expect(finished.map((command) => command.result.kind)).toEqual(['done'])
    const leased = addressOfPc()
    expect(leased).toMatch(/^192\.168\.1\./)
    expect(player.getView().canStepBack).toBe(true)

    while (player.stepBack()) {
      // back to the start
    }
    const reverted = finished[1]?.result
    expect(reverted).toMatchObject({ kind: 'reverted', waitsAgain: true })
    expect(addressOfPc()).toBe('')
    expect(player.engineNetwork).toBe(document)
    // Restoring the document is no edit for the engine: the step history survives.
    expect(player.getView().canStepForward).toBe(true)

    for (let step = 0; step < steps; step += 1) player.stepForward()
    expect(finished.map((command) => command.result.kind)).toEqual(['done', 'reverted', 'done'])
    expect(addressOfPc()).toBe(leased)
    expect(player.engineNetwork).toBe(document)
  })
})

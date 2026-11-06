import { describe, expect, it } from 'vitest'
import { createCliShell } from '../../../cli'
import { catalogDevice, testRouter, testSwitch, textOf } from '../../../cli/core/testCli'
import type { Device, ExerciseLock, NetworkState } from '../../../domain'
import { ExerciseLockPolicy } from '../../../session/ExerciseLockPolicy'
import { createSimulation } from '../../../sim/createSimulation'
import { twoRouterLab } from '../../../sim/l3/l3TestLabs'
import { CliAccess } from './CliAccess'
import { CliConsole } from './CliConsole'
import { CliSessionStore } from './CliSessionStore'
import { CliSimulation } from './CliSimulation'

const shell = createCliShell()
const NO_ENV = (device: Device) => ({ network: { devices: [device], links: [] }, runtime: undefined, now: 0 })

/** Types `inputs` into a console the way the CLI tab does (echo + output; the lab takes step.device). */
function typeAll(device: Device, ...inputs: string[]): { console: CliConsole; device: Device } {
  let console = CliConsole.open(shell, device)
  let current = device
  for (const input of inputs) {
    const step = shell.submit(console.session, current, NO_ENV(current), input)
    console = console.after(step, console.submitEcho(input))
    if (step.device) current = step.device
  }
  return { console, device: current }
}

function policyOf(...locks: ExerciseLock[]): ExerciseLockPolicy {
  return new ExerciseLockPolicy(locks, [])
}

describe('the app shell', () => {
  it('loads the switch and router command sets together', () => {
    const { console, device } = typeAll(testSwitch(), 'enable', 'configure terminal', 'vlan 10', 'name SALES', 'end', 'show vlan brief')
    expect(device.switching?.vlans.some((vlan) => vlan.id === 10 && vlan.name === 'SALES')).toBe(true)
    expect(textOf(console.lines).join('\n')).toMatch(/^10\s+SALES\s+active/m)
    const router = typeAll(testRouter(), 'enable', 'configure terminal', 'interface g0/0', 'ip address 10.0.0.1 255.255.255.0', 'end').device
    expect(shell.runningConfig(router)).toContain(' ip address 10.0.0.1 255.255.255.0')
  })
})

describe('CliConsole', () => {
  it('echoes the prompt and input before the output, as IOS shows it', () => {
    const { console } = typeAll(testSwitch(), 'enable', 'configure terminal')
    expect(textOf(console.lines).slice(-3)).toEqual(['Switch>enable', 'Switch#configure terminal', 'Enter configuration commands, one per line.  End with CNTL/Z.'])
    expect(console.prompt).toBe('Switch(config)#')
    expect(console.input).toBe('command')
  })

  it('echoes help with the question mark and control keys with ^Z / ^C', () => {
    const { console } = typeAll(testSwitch(), 'enable')
    expect(textOf(console.helpEcho('sh'))).toEqual(['Switch#sh?'])
    expect(textOf(console.controlEcho('conf', 'ctrlC'))).toEqual(['Switch#conf^C'])
  })

  it('does not echo a password', () => {
    const { console } = typeAll(testSwitch(), 'enable', 'configure terminal', 'enable secret class', 'end', 'disable', 'enable')
    expect(console.input).toBe('secret')
    expect(textOf(console.submitEcho('class'))).toEqual(['Password: '])
  })

  it('opens again after the device is powered off, keeping the transcript', () => {
    const { console } = typeAll(testSwitch(), 'enable')
    const off = CliConsole.open(shell, { ...testSwitch(), powered: false }, console)
    expect(off.powered).toBe(false)
    expect(off.lines.length).toBeGreaterThan(console.lines.length)
    expect(off.lines.at(-1)?.message?.key).toBe('cli:poweredOff')
    expect(off.cleared().lines).toEqual([])
  })
})

describe('CliSessionStore', () => {
  it('keeps one console per device and forgets them when another lab opens', () => {
    const store = new CliSessionStore(shell)
    let notified = 0
    store.subscribe(() => (notified += 1))
    const opened = store.consoleOf('lab1', testSwitch())
    expect(store.consoleOf('lab1', testSwitch())).toBe(opened)
    const next = typeAll(testSwitch(), 'enable').console
    store.set('lab1', 's1', next)
    expect(notified).toBe(1)
    expect(store.find('lab1', 's1')).toBe(next)
    expect(store.find('lab2', 's1')).toBeUndefined()
    expect(store.consoleOf('lab2', testSwitch())).not.toBe(next)
    expect(store.find('lab1', 's1')).toBeUndefined()
  })
})

describe('CliAccess', () => {
  const pc = catalogDevice('pc', 'pc1', '00:D0:BA:00:01:01')

  it('offers CLI and Config on IOS devices only', () => {
    expect(CliAccess.tabs(testRouter(), ExerciseLockPolicy.none)).toEqual(['cli', 'config'])
    expect(CliAccess.tabs(testSwitch(), ExerciseLockPolicy.none)).toEqual(['cli', 'config'])
    expect(CliAccess.tabs(pc, ExerciseLockPolicy.none)).toEqual([])
  })

  it('follows the exercise locks', () => {
    const hiddenTerminal = policyOf({ scope: 'section', deviceId: 'r1', section: 'terminal', access: 'hidden' })
    expect(CliAccess.tabs(testRouter(), hiddenTerminal)).toEqual(['config'])
    expect(CliAccess.tabs(testRouter(), policyOf({ scope: 'device', deviceId: 'r1', access: 'hidden' }))).toEqual([])

    const router = testRouter()
    const renamed: Device = { ...router, features: { ...router.features, management: { hostname: 'R1' } } }
    const readOnly = policyOf({ scope: 'device', deviceId: 'r1', access: 'readOnly' })
    expect(CliAccess.tabs(router, readOnly)).toEqual(['cli', 'config'])
    expect(CliAccess.readOnly(router, readOnly)).toBe(true)
    expect(CliAccess.allowsChange(readOnly, router, renamed)).toBe(false)
    expect(CliAccess.allowsChange(ExerciseLockPolicy.none, router, renamed)).toBe(true)

    const routingLocked = policyOf({ scope: 'section', deviceId: 'r1', section: 'routing', access: 'readOnly' })
    expect(CliAccess.allowsChange(routingLocked, router, renamed)).toBe(true)
  })
})

describe('CliSimulation', () => {
  const lab: NetworkState = twoRouterLab()
  const engines = () => new CliSimulation((network) => Promise.resolve(createSimulation(network)), 300)

  it('runs a console ping on the lab and the shell prints its result', async () => {
    const simulation = engines()
    const router = lab.devices.find((device) => device.id === 'r1')
    if (!router) throw new Error('r1 missing')
    const opened = CliConsole.open(shell, router)
    const step = shell.submit(opened.session, router, NO_ENV(router), 'ping 10.0.2.10')
    if (!step.job) throw new Error('no job')
    expect(step.input).toBe('busy')
    const record = await simulation.run('lab1', lab, step.job)
    if (!record) throw new Error('no record')
    const env = { network: lab, ...simulation.view('lab1', lab, 'r1') }
    expect(env.runtime?.deviceId).toBe('r1')
    const resumed = shell.resume(step.state, router, env, record)
    expect(textOf(resumed.lines).join('\n')).toMatch(/Success rate is \d+ percent/)
    expect(resumed.input).toBe('command')
  })

  it('reads no runtime before the engine is built and drops it for another lab', async () => {
    const simulation = engines()
    expect(simulation.view('lab1', lab, 'r1').runtime).toBeUndefined()
    simulation.prepare('lab1', lab)
    await Promise.resolve()
    await Promise.resolve()
    expect(simulation.view('lab1', lab, 'r1').runtime?.deviceId).toBe('r1')
    expect(simulation.view('lab2', lab, 'r1').runtime).toBeUndefined()
  })
})

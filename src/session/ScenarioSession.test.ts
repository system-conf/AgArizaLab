import { describe, expect, it } from 'vitest'
import type { NetworkEngine, PacketTrace } from '../domain/EngineContract'
import type { Device } from '../domain/NetworkTypes'
import type { Scenario, ScenarioDefinition } from '../domain/ScenarioTypes'
import { networkEngine, solveChecker } from '../engine'
import { posGateway } from '../scenarios/posGateway'
import { printerDhcp } from '../scenarios/printerDhcp'
import { ScenarioSession } from './ScenarioSession'

const startedAt = 1_000_000

/** Placeholder texts: the session never reads them, so no i18n is needed here. */
function asScenario(definition: ScenarioDefinition): Scenario {
  return {
    ...definition,
    title: definition.id,
    complaint: { from: 'from', message: 'message' },
    hints: ['hint 1', 'hint 2', 'hint 3'],
    explanation: { whatHappened: 'what', realLife: 'real', interviewAnswer: 'answer' },
    topics: [],
  }
}

const posLab = asScenario(posGateway)
const printerLab = asScenario(printerDhcp)

function deviceOf(session: ScenarioSession, deviceId: string): Device {
  const device = session.state.devices.find((candidate) => candidate.id === deviceId)
  if (!device) throw new Error(`missing ${deviceId}`)
  return device
}

function fixKasaGateway(session: ScenarioSession): ScenarioSession {
  const kasa = deviceOf(session, 'kasa')
  if (!kasa.host) throw new Error('kasa has no host')
  return session.updateDevice({ ...kasa, host: { ...kasa.host, gateway: '192.168.10.1' } })
}

describe('ScenarioSession', () => {
  it('starts from the scenario initial state with nothing selected', () => {
    const session = ScenarioSession.start(posLab, startedAt)
    expect(session.state).toBe(posLab.initialState)
    expect(session.selectedDeviceId).toBeNull()
    expect(session.selectedDevice).toBeUndefined()
    expect(session.hintsRevealed).toBe(0)
    expect(session.notes).toBe('')
    expect(session.lastCheck).toBeNull()
    expect(session.isSolved).toBe(false)
    expect(session.terminalLines('kasa')).toEqual([])
  })

  it('returns new instances and leaves the old one unchanged', () => {
    const first = ScenarioSession.start(posLab, startedAt)
    const second = first.selectDevice('kasa').setNotes('ağ geçidi?')
    expect(second).not.toBe(first)
    expect(first.selectedDeviceId).toBeNull()
    expect(first.notes).toBe('')
    expect(second.selectedDevice?.id).toBe('kasa')
    expect(second.notes).toBe('ağ geçidi?')
  })

  it('rejects unknown device ids as programmer errors', () => {
    const session = ScenarioSession.start(posLab, startedAt)
    expect(() => session.selectDevice('yok')).toThrow()
    expect(() => session.updateDevice({ ...deviceOf(session, 'kasa'), id: 'yok' })).toThrow()
    expect(session.selectDevice(null).selectedDeviceId).toBeNull()
  })

  it('updates a device and a link without mutating the scenario data', () => {
    const session = fixKasaGateway(ScenarioSession.start(posLab, startedAt))
    expect(deviceOf(session, 'kasa').host?.gateway).toBe('192.168.10.1')
    expect(posGateway.initialState.devices.find((d) => d.id === 'kasa')?.host?.gateway).toBe('192.168.1.1')

    const link = session.state.links[0]
    if (!link) throw new Error('no link')
    const unplugged = session.updateLink({ ...link, connected: false })
    expect(unplugged.state.links[0]?.connected).toBe(false)
    expect(session.state.links[0]?.connected).toBe(true)
  })

  it('keeps terminal history per device: input first, then engine output', () => {
    const session = ScenarioSession.start(posLab, startedAt)
      .runCommand('kasa', 'ipconfig')
      .runCommand('mudurPc', 'help')
      .runCommand('kasa', 'ping 8.8.8.8')
    const kasaLines = session.terminalLines('kasa')
    expect(kasaLines[0]).toEqual({ kind: 'input', text: 'ipconfig' })
    expect(kasaLines.length).toBeGreaterThan(2)
    const secondInput = kasaLines.findIndex((line, index) => index > 0 && line.kind === 'input')
    expect(kasaLines[secondInput]).toEqual({ kind: 'input', text: 'ping 8.8.8.8' })
    expect(kasaLines.length).toBeGreaterThan(secondInput + 1)
    expect(session.terminalLines('mudurPc')[0]).toEqual({ kind: 'input', text: 'help' })
  })

  it('applies the network change of ipconfig /renew', () => {
    const satis = deviceOf(ScenarioSession.start(printerLab, startedAt), 'satis')
    if (!satis.host) throw new Error('no host')
    const cleared = ScenarioSession.start(printerLab, startedAt).updateDevice({
      ...satis,
      host: { ...satis.host, ip: '', gateway: '', dns: [] },
    })
    const renewed = cleared.runCommand('satis', 'ipconfig /renew')
    expect(deviceOf(renewed, 'satis').host?.ip).toBe('192.168.1.102')
    expect(deviceOf(cleared, 'satis').host?.ip).toBe('')
  })

  it('caps revealed hints at three', () => {
    let session = ScenarioSession.start(posLab, startedAt)
    for (let step = 0; step < 5; step += 1) session = session.revealHint()
    expect(session.hintsRevealed).toBe(3)
  })

  it('records a failed check without finishing', () => {
    const session = ScenarioSession.start(posLab, startedAt).checkSolved(startedAt + 5_000)
    expect(session.isSolved).toBe(false)
    expect(session.finishedAt).toBeNull()
    expect(session.lastCheck?.some((result) => !result.ok)).toBe(true)
  })

  it('finishes on a successful check and freezes the elapsed time', () => {
    const solved = fixKasaGateway(ScenarioSession.start(posLab, startedAt)).checkSolved(startedAt + 65_400)
    expect(solved.isSolved).toBe(true)
    expect(solved.finishedAt).toBe(startedAt + 65_400)
    expect(solved.lastCheck?.every((result) => result.ok)).toBe(true)
    expect(solved.elapsedSeconds(startedAt + 999_000)).toBe(65)
    expect(solved.checkSolved(startedAt + 90_000).finishedAt).toBe(startedAt + 65_400)
  })

  it('moves devices on the map without touching the network state', () => {
    const first = ScenarioSession.start(posLab, startedAt)
    const original = first.positionOf('kasa')
    const moved = first.moveDevice('kasa', { x: 123, y: 456 })
    expect(moved.positionOf('kasa')).toEqual({ x: 123, y: 456 })
    expect(moved.state).toBe(first.state)
    expect(moved.hasCustomLayout).toBe(true)
    expect(first.positionOf('kasa')).toEqual(original)
    expect(first.hasCustomLayout).toBe(false)
    expect(moved.checkSolved(startedAt + 1).lastCheck).toEqual(first.checkSolved(startedAt + 1).lastCheck)
  })

  it('keeps moved positions across selection and device edits, and resets the layout', () => {
    const moved = ScenarioSession.start(posLab, startedAt).moveDevice('kasa', { x: 10, y: 20 })
    const edited = fixKasaGateway(moved.selectDevice('kasa').selectDevice(null))
    expect(edited.positionOf('kasa')).toEqual({ x: 10, y: 20 })
    const reset = edited.resetLayout()
    expect(reset.hasCustomLayout).toBe(false)
    expect(reset.positionOf('kasa')).toEqual(deviceOf(reset, 'kasa').position)
    expect(reset.resetLayout()).toBe(reset)
  })

  it('rejects moving unknown devices or to invalid positions', () => {
    const session = ScenarioSession.start(posLab, startedAt)
    expect(() => session.moveDevice('yok', { x: 1, y: 1 })).toThrow()
    expect(() => session.moveDevice('kasa', { x: Number.NaN, y: 1 })).toThrow()
    expect(() => session.positionOf('yok')).toThrow()
  })

  it('keeps the trace of the latest ping until the next ping', () => {
    const trace: PacketTrace = { path: ['kasa', 'switch'], ok: false }
    const engine: NetworkEngine = {
      reach: (state, from, toIp) => networkEngine.reach(state, from, toIp),
      resolve: (state, from, name) => networkEngine.resolve(state, from, name),
      appLinkStatus: (state, deviceId) => networkEngine.appLinkStatus(state, deviceId),
      renewDhcp: (state, deviceId) => networkEngine.renewDhcp(state, deviceId),
      linkLight: (state, linkId) => networkEngine.linkLight(state, linkId),
      runCommand: (_state, _deviceId, line) => (line.startsWith('ping') ? { lines: [], trace } : { lines: [] }),
    }
    const session = ScenarioSession.start(posLab, startedAt, { engine, checker: solveChecker })
    expect(session.lastTrace).toBeNull()
    const pinged = session.runCommand('kasa', 'ping 8.8.8.8')
    expect(pinged.lastTrace).toBe(trace)
    expect(pinged.runCommand('kasa', 'ipconfig').lastTrace).toBe(trace)
    expect(session.lastTrace).toBeNull()
  })

  it('records the real engine trace for a ping', () => {
    const pinged = ScenarioSession.start(posLab, startedAt).runCommand('kasa', 'ping 192.168.10.1')
    expect(pinged.lastTrace?.path[0]).toBe('kasa')
  })

  it('counts elapsed whole seconds while unsolved and never goes negative', () => {
    const session = ScenarioSession.start(posLab, startedAt)
    expect(session.elapsedSeconds(startedAt + 2_999)).toBe(2)
    expect(session.elapsedSeconds(startedAt - 1_000)).toBe(0)
  })
})

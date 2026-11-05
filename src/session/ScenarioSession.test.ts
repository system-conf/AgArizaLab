import { createInstance, type i18n as I18n } from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import type { NetworkEngine, PacketTrace } from '../domain/EngineContract'
import type { Device } from '../domain/NetworkTypes'
import type { Scenario, ScenarioDefinition } from '../domain/ScenarioTypes'
import { networkEngine, solveChecker } from '../engine'
import enExercises from '../locales/en/exercises.json'
import trExercises from '../locales/tr/exercises.json'
import { localizeScenario } from '../scenarios/ScenarioLocalizer'
import { posGateway } from '../scenarios/posGateway'
import { printerDhcp } from '../scenarios/printerDhcp'
import { ScenarioSession } from './ScenarioSession'

/** Placeholder texts: most tests never read them, so no i18n is needed there (relabel uses real texts). */
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
    const session = ScenarioSession.start(posLab)
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
    const first = ScenarioSession.start(posLab)
    const second = first.selectDevice('kasa').setNotes('ağ geçidi?')
    expect(second).not.toBe(first)
    expect(first.selectedDeviceId).toBeNull()
    expect(first.notes).toBe('')
    expect(second.selectedDevice?.id).toBe('kasa')
    expect(second.notes).toBe('ağ geçidi?')
  })

  it('rejects unknown device ids as programmer errors', () => {
    const session = ScenarioSession.start(posLab)
    expect(() => session.selectDevice('yok')).toThrow()
    expect(() => session.updateDevice({ ...deviceOf(session, 'kasa'), id: 'yok' })).toThrow()
    expect(session.selectDevice(null).selectedDeviceId).toBeNull()
  })

  it('updates a device and a link without mutating the scenario data', () => {
    const session = fixKasaGateway(ScenarioSession.start(posLab))
    expect(deviceOf(session, 'kasa').host?.gateway).toBe('192.168.10.1')
    expect(posGateway.initialState.devices.find((d) => d.id === 'kasa')?.host?.gateway).toBe('192.168.1.1')

    const link = session.state.links[0]
    if (!link) throw new Error('no link')
    const unplugged = session.updateLink({ ...link, connected: false })
    expect(unplugged.state.links[0]?.connected).toBe(false)
    expect(session.state.links[0]?.connected).toBe(true)
  })

  it('keeps terminal history per device: input first, then engine output', () => {
    const session = ScenarioSession.start(posLab)
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
    const satis = deviceOf(ScenarioSession.start(printerLab), 'satis')
    if (!satis.host) throw new Error('no host')
    const cleared = ScenarioSession.start(printerLab).updateDevice({
      ...satis,
      host: { ...satis.host, ip: '', gateway: '', dns: [] },
    })
    const renewed = cleared.runCommand('satis', 'ipconfig /renew')
    expect(deviceOf(renewed, 'satis').host?.ip).toBe('192.168.1.102')
    expect(deviceOf(cleared, 'satis').host?.ip).toBe('')
  })

  it('caps revealed hints at three', () => {
    let session = ScenarioSession.start(posLab)
    for (let step = 0; step < 5; step += 1) session = session.revealHint()
    expect(session.hintsRevealed).toBe(3)
  })

  it('records a failed check without finishing', () => {
    const session = ScenarioSession.start(posLab).checkSolved()
    expect(session.isSolved).toBe(false)
    expect(session.lastCheck?.some((result) => !result.ok)).toBe(true)
  })

  it('stays solved after a successful check, even if a later check fails', () => {
    const solved = fixKasaGateway(ScenarioSession.start(posLab)).checkSolved()
    expect(solved.isSolved).toBe(true)
    expect(solved.lastCheck?.every((result) => result.ok)).toBe(true)
    const kasa = deviceOf(solved, 'kasa')
    if (!kasa.host) throw new Error('kasa has no host')
    const broken = solved.updateDevice({ ...kasa, host: { ...kasa.host, gateway: '' } }).checkSolved()
    expect(broken.lastCheck?.some((result) => !result.ok)).toBe(true)
    expect(broken.isSolved).toBe(true)
  })

  it('moves devices on the map without touching the network state', () => {
    const first = ScenarioSession.start(posLab)
    const original = first.positionOf('kasa')
    const moved = first.moveDevice('kasa', { x: 123, y: 456 })
    expect(moved.positionOf('kasa')).toEqual({ x: 123, y: 456 })
    expect(moved.state).toBe(first.state)
    expect(moved.hasCustomLayout).toBe(true)
    expect(first.positionOf('kasa')).toEqual(original)
    expect(first.hasCustomLayout).toBe(false)
    expect(moved.checkSolved().lastCheck).toEqual(first.checkSolved().lastCheck)
  })

  it('keeps moved positions across selection and device edits, and resets the layout', () => {
    const moved = ScenarioSession.start(posLab).moveDevice('kasa', { x: 10, y: 20 })
    const edited = fixKasaGateway(moved.selectDevice('kasa').selectDevice(null))
    expect(edited.positionOf('kasa')).toEqual({ x: 10, y: 20 })
    const reset = edited.resetLayout()
    expect(reset.hasCustomLayout).toBe(false)
    expect(reset.positionOf('kasa')).toEqual(deviceOf(reset, 'kasa').position)
    expect(reset.resetLayout()).toBe(reset)
  })

  it('rejects moving unknown devices or to invalid positions', () => {
    const session = ScenarioSession.start(posLab)
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
    const session = ScenarioSession.start(posLab, { engine, checker: solveChecker })
    expect(session.lastTrace).toBeNull()
    const pinged = session.runCommand('kasa', 'ping 8.8.8.8')
    expect(pinged.lastTrace).toBe(trace)
    expect(pinged.runCommand('kasa', 'ipconfig').lastTrace).toBe(trace)
    expect(session.lastTrace).toBeNull()
  })

  it('records the real engine trace for a ping', () => {
    const pinged = ScenarioSession.start(posLab).runCommand('kasa', 'ping 192.168.10.1')
    expect(pinged.lastTrace?.path[0]).toBe('kasa')
  })

})

describe('ScenarioSession.relabel', () => {
  let i18n: I18n

  beforeAll(async () => {
    i18n = createInstance()
    await i18n.init({
      resources: { tr: { exercises: trExercises }, en: { exercises: enExercises } },
      lng: 'tr',
      fallbackLng: false,
      ns: ['exercises'],
      interpolation: { escapeValue: false },
    })
  })

  it('takes the texts of the new language and keeps every learner change', () => {
    const trLab = localizeScenario(printerDhcp, i18n.getFixedT('tr'))
    const enLab = localizeScenario(printerDhcp, i18n.getFixedT('en'))
    const satis = deviceOf(ScenarioSession.start(trLab), 'satis')
    if (!satis.host) throw new Error('no host')
    const worked = ScenarioSession.start(trLab)
      .updateDevice({ ...satis, host: { ...satis.host, ip: '192.168.1.199' } })
      .moveDevice('satis', { x: 11, y: 22 })
      .runCommand('satis', 'ipconfig')
      .setNotes('notlar')
      .revealHint()
      .selectDevice('satis')
      .checkSolved()

    const relabelled = worked.relabel(enLab)

    expect(relabelled.scenario).toBe(enLab)
    const enSatis = enLab.initialState.devices.find((device) => device.id === 'satis')
    expect(deviceOf(relabelled, 'satis').name).toBe(enSatis?.name)
    expect(deviceOf(relabelled, 'satis').name).not.toBe(deviceOf(worked, 'satis').name)
    expect(deviceOf(relabelled, 'satis').appLinks?.[0]?.label).toBe(enSatis?.appLinks?.[0]?.label)
    expect(deviceOf(relabelled, 'satis').host?.ip).toBe('192.168.1.199')
    expect(relabelled.positionOf('satis')).toEqual({ x: 11, y: 22 })
    expect(relabelled.terminalLines('satis')).toBe(worked.terminalLines('satis'))
    expect(relabelled.notes).toBe('notlar')
    expect(relabelled.hintsRevealed).toBe(1)
    expect(relabelled.selectedDeviceId).toBe('satis')
    expect(relabelled.lastCheck).toBe(worked.lastCheck)
    expect(relabelled.isSolved).toBe(worked.isSolved)
    expect(relabelled.state.links).toBe(worked.state.links)
    expect(deviceOf(worked, 'satis').name).toBe(trLab.initialState.devices.find((d) => d.id === 'satis')?.name)
  })

  it('rejects a different scenario as a programmer error', () => {
    expect(() => ScenarioSession.start(posLab).relabel(printerLab)).toThrow()
  })
})

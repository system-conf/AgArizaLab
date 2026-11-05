import { describe, expect, it } from 'vitest'
import type { Device } from '../domain/NetworkTypes'
import { posGateway } from '../scenarios/posGateway'
import { printerDhcp } from '../scenarios/printerDhcp'
import { ScenarioSession } from './ScenarioSession'

const startedAt = 1_000_000

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
    const session = ScenarioSession.start(posGateway, startedAt)
    expect(session.state).toBe(posGateway.initialState)
    expect(session.selectedDeviceId).toBeNull()
    expect(session.selectedDevice).toBeUndefined()
    expect(session.hintsRevealed).toBe(0)
    expect(session.notes).toBe('')
    expect(session.lastCheck).toBeNull()
    expect(session.isSolved).toBe(false)
    expect(session.terminalLines('kasa')).toEqual([])
  })

  it('returns new instances and leaves the old one unchanged', () => {
    const first = ScenarioSession.start(posGateway, startedAt)
    const second = first.selectDevice('kasa').setNotes('ağ geçidi?')
    expect(second).not.toBe(first)
    expect(first.selectedDeviceId).toBeNull()
    expect(first.notes).toBe('')
    expect(second.selectedDevice?.id).toBe('kasa')
    expect(second.notes).toBe('ağ geçidi?')
  })

  it('rejects unknown device ids as programmer errors', () => {
    const session = ScenarioSession.start(posGateway, startedAt)
    expect(() => session.selectDevice('yok')).toThrow()
    expect(() => session.updateDevice({ ...deviceOf(session, 'kasa'), id: 'yok' })).toThrow()
    expect(session.selectDevice(null).selectedDeviceId).toBeNull()
  })

  it('updates a device and a link without mutating the scenario data', () => {
    const session = fixKasaGateway(ScenarioSession.start(posGateway, startedAt))
    expect(deviceOf(session, 'kasa').host?.gateway).toBe('192.168.10.1')
    expect(posGateway.initialState.devices.find((d) => d.id === 'kasa')?.host?.gateway).toBe('192.168.1.1')

    const link = session.state.links[0]
    if (!link) throw new Error('no link')
    const unplugged = session.updateLink({ ...link, connected: false })
    expect(unplugged.state.links[0]?.connected).toBe(false)
    expect(session.state.links[0]?.connected).toBe(true)
  })

  it('keeps terminal history per device: input first, then engine output', () => {
    const session = ScenarioSession.start(posGateway, startedAt)
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
    const printer = deviceOf(ScenarioSession.start(printerDhcp, startedAt), 'yazici')
    if (!printer.host) throw new Error('no host')
    const cleared = ScenarioSession.start(printerDhcp, startedAt).updateDevice({
      ...printer,
      host: { ...printer.host, ip: '', gateway: '', dns: [] },
    })
    const renewed = cleared.runCommand('yazici', 'ipconfig /renew')
    expect(deviceOf(renewed, 'yazici').host?.ip).toBe('192.168.1.153')
    expect(deviceOf(cleared, 'yazici').host?.ip).toBe('')
  })

  it('caps revealed hints at three', () => {
    let session = ScenarioSession.start(posGateway, startedAt)
    for (let step = 0; step < 5; step += 1) session = session.revealHint()
    expect(session.hintsRevealed).toBe(3)
  })

  it('records a failed check without finishing', () => {
    const session = ScenarioSession.start(posGateway, startedAt).checkSolved(startedAt + 5_000)
    expect(session.isSolved).toBe(false)
    expect(session.finishedAt).toBeNull()
    expect(session.lastCheck?.some((result) => !result.ok)).toBe(true)
  })

  it('finishes on a successful check and freezes the elapsed time', () => {
    const solved = fixKasaGateway(ScenarioSession.start(posGateway, startedAt)).checkSolved(startedAt + 65_400)
    expect(solved.isSolved).toBe(true)
    expect(solved.finishedAt).toBe(startedAt + 65_400)
    expect(solved.lastCheck?.every((result) => result.ok)).toBe(true)
    expect(solved.elapsedSeconds(startedAt + 999_000)).toBe(65)
    expect(solved.checkSolved(startedAt + 90_000).finishedAt).toBe(startedAt + 65_400)
  })

  it('counts elapsed whole seconds while unsolved and never goes negative', () => {
    const session = ScenarioSession.start(posGateway, startedAt)
    expect(session.elapsedSeconds(startedAt + 2_999)).toBe(2)
    expect(session.elapsedSeconds(startedAt - 1_000)).toBe(0)
  })
})

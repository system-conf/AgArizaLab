import { describe, expect, it } from 'vitest'
import { cableLab } from '../../../domain/v2/testDevicesV2'
import { CableToolState } from './CableToolState'

const lab = cableLab()

function readyRequest(outcome: ReturnType<CableToolState['pickPort']>) {
  if (outcome.kind !== 'ready') throw new Error(`expected a ready request, got ${outcome.kind}`)
  return outcome.request
}

describe('CableToolState', () => {
  it('walks first device → port → second device → port and returns the request', () => {
    let state = CableToolState.off().choose('copperStraight')
    expect(state.step).toEqual({ kind: 'firstDevice', tool: 'copperStraight' })
    state = state.clickDevice('pc')
    expect(state.portMenu).toEqual({ deviceId: 'pc', end: 'first' })
    const afterFirst = state.pickPort(lab, 'eth0')
    expect(afterFirst.kind).toBe('continue')
    state = afterFirst.state
    expect(state.firstEnd).toEqual({ deviceId: 'pc', portId: 'eth0' })
    state = state.clickDevice('sw')
    expect(state.portMenu).toEqual({ deviceId: 'sw', end: 'second' })
    const outcome = state.pickPort(lab, 'Fa0/1')
    expect(readyRequest(outcome)).toEqual({
      a: { deviceId: 'pc', portId: 'eth0' },
      b: { deviceId: 'sw', portId: 'Fa0/1' },
      cable: 'copperStraight',
    })
    // The tool stays armed for the next cable.
    expect(outcome.state.step).toEqual({ kind: 'firstDevice', tool: 'copperStraight' })
  })

  it('resolves the auto tool to the textbook cable', () => {
    const state = CableToolState.off().choose('auto').clickDevice('sw').pickPort(lab, 'Fa0/1').state.clickDevice('sw2')
    expect(readyRequest(state.pickPort(lab, 'Fa0/1')).cable).toBe('copperCross')
  })

  it('refuses auto between ports of different media and goes back to the second device', () => {
    const state = CableToolState.off().choose('auto').clickDevice('pc').pickPort(lab, 'eth0').state.clickDevice('sw')
    const outcome = state.pickPort(lab, 'Gi0/1')
    expect(outcome.kind).toBe('refused')
    expect(outcome.state.step.kind).toBe('secondDevice')
  })

  it('makes the first end of a serial cable the DCE', () => {
    const state = CableToolState.off().choose('serial').clickDevice('router').pickPort(lab, 'Se0/0/0').state.clickDevice('router2')
    expect(readyRequest(state.pickPort(lab, 'Se0/0/0'))).toMatchObject({ cable: 'serial', dceEnd: 'a' })
  })

  it('asks for an SSID on wireless and offers the SSIDs of the radio', () => {
    const state = CableToolState.off().choose('wireless').clickDevice('laptop').pickPort(lab, 'wlan0').state.clickDevice('ap')
    const outcome = state.pickPort(lab, 'Radio0')
    expect(outcome.kind).toBe('continue')
    expect(outcome.state.step).toMatchObject({ kind: 'ssid', options: ['Office'] })
    const done = outcome.state.submitSsid('  Guest ')
    if (done.kind !== 'ready') throw new Error('expected ready')
    expect(done.request).toMatchObject({ cable: 'wireless', ssid: 'Guest' })
  })

  it('steps back one level on Esc and switches off from the first step', () => {
    const open = CableToolState.off().choose('fiber').clickDevice('sw')
    const afterPick = open.pickPort(lab, 'Gi0/1').state.clickDevice('sw2')
    expect(afterPick.back().step.kind).toBe('secondDevice')
    expect(afterPick.back().back().step.kind).toBe('firstDevice')
    expect(open.back().step.kind).toBe('firstDevice')
    expect(open.back().back().active).toBe(false)
  })

  it('moves an open port picker to another clicked device', () => {
    const state = CableToolState.off().choose('auto').clickDevice('pc').clickDevice('sw')
    expect(state.portMenu).toEqual({ deviceId: 'sw', end: 'first' })
  })

  it('ignores port picks and device clicks while off', () => {
    const off = CableToolState.off()
    expect(off.clickDevice('pc').active).toBe(false)
    expect(off.pickPort(lab, 'eth0').state.active).toBe(false)
  })
})

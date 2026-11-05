import { useState } from 'react'
import type { Device, Link, MapPosition } from '../domain/NetworkTypes'
import type { Scenario } from '../domain/ScenarioTypes'
import { ScenarioSession } from './ScenarioSession'

export interface ScenarioSessionControls {
  session: ScenarioSession
  selectDevice: (deviceId: string | null) => void
  updateDevice: (next: Device) => void
  updateLink: (next: Link) => void
  runCommand: (deviceId: string, commandLine: string) => void
  moveDevice: (deviceId: string, position: MapPosition) => void
  resetLayout: () => void
  /** Shows the next guide step. */
  revealGuideStep: () => void
  setNotes: (notes: string) => void
  /** Runs the solve check and returns the resulting session (so the caller can react to a success). */
  checkSolved: () => ScenarioSession
}

/**
 * React state around an immutable ScenarioSession. Mount it with `key={scenario.id}`
 * so switching exercises starts a fresh session. No timer: the screen re-renders only on changes.
 */
export function useScenarioSession(scenario: Scenario): ScenarioSessionControls {
  const [session, setSession] = useState(() => ScenarioSession.start(scenario, Date.now()))

  function checkSolved(): ScenarioSession {
    const next = session.checkSolved(Date.now())
    setSession(next)
    return next
  }

  return {
    session,
    selectDevice: (deviceId) => setSession((current) => current.selectDevice(deviceId)),
    updateDevice: (next) => setSession((current) => current.updateDevice(next)),
    updateLink: (next) => setSession((current) => current.updateLink(next)),
    runCommand: (deviceId, commandLine) => setSession((current) => current.runCommand(deviceId, commandLine)),
    moveDevice: (deviceId, position) => setSession((current) => current.moveDevice(deviceId, position)),
    resetLayout: () => setSession((current) => current.resetLayout()),
    revealGuideStep: () => setSession((current) => current.revealHint()),
    setNotes: (notes) => setSession((current) => current.setNotes(notes)),
    checkSolved,
  }
}

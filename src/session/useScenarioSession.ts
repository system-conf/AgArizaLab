import { useEffect, useState } from 'react'
import type { Device, Link } from '../domain/NetworkTypes'
import type { Scenario } from '../domain/ScenarioTypes'
import { ScenarioSession } from './ScenarioSession'

export interface ScenarioSessionControls {
  session: ScenarioSession
  /** Ticks every second while unsolved; frozen once solved. */
  elapsedSeconds: number
  selectDevice: (deviceId: string | null) => void
  updateDevice: (next: Device) => void
  updateLink: (next: Link) => void
  runCommand: (deviceId: string, commandLine: string) => void
  revealHint: () => void
  setNotes: (notes: string) => void
  /** Runs the solve check and returns the resulting session (so the caller can react to a win). */
  checkSolved: () => ScenarioSession
}

/**
 * React state around an immutable ScenarioSession. Mount it with `key={scenario.id}`
 * so switching scenarios starts a fresh session.
 */
export function useScenarioSession(scenario: Scenario): ScenarioSessionControls {
  const [session, setSession] = useState(() => ScenarioSession.start(scenario, Date.now()))
  const [now, setNow] = useState(() => session.startedAt)
  const solved = session.isSolved

  useEffect(() => {
    if (solved) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [solved])

  function checkSolved(): ScenarioSession {
    const next = session.checkSolved(Date.now())
    setSession(next)
    return next
  }

  return {
    session,
    elapsedSeconds: session.elapsedSeconds(now),
    selectDevice: (deviceId) => setSession((current) => current.selectDevice(deviceId)),
    updateDevice: (next) => setSession((current) => current.updateDevice(next)),
    updateLink: (next) => setSession((current) => current.updateLink(next)),
    runCommand: (deviceId, commandLine) => setSession((current) => current.runCommand(deviceId, commandLine)),
    revealHint: () => setSession((current) => current.revealHint()),
    setNotes: (notes) => setSession((current) => current.setNotes(notes)),
    checkSolved,
  }
}

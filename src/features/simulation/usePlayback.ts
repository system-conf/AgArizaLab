import { useCallback, useEffect, useState } from 'react'
import { usePreference } from '../../preferences'
import type { SimulationPlayer } from './model/SimulationPlayer'
import type { PlaySpeed } from './simulationServices'

/** Length of one step's animation at speed 1 (the packets walk one hop). */
export const STEP_ANIMATION_MS = 900
/** Pause after a step's animation before play takes the next one, at speed 1. */
const STEP_GAP_MS = 250

export interface Playback {
  readonly playing: boolean
  readonly speed: PlaySpeed
  /** Animation length of one step at the chosen speed. */
  readonly stepMs: number
  setSpeed(speed: PlaySpeed): void
  play(): void
  pause(): void
  stepForward(): void
  stepBack(): void
}

/**
 * Play / pause / step of a SimulationPlayer (docs/SIMULATION.md §8): play takes one step per tick at
 * the chosen speed and stops by itself when nothing is left; manual steps pause playback.
 * `windowSerial` changes with every step, so the next tick is planned after each one.
 */
export function usePlayback(player: SimulationPlayer | null, windowSerial: number): Playback {
  const [playing, setPlaying] = useState(false)
  // PU (Preferences → Animation & simulation): the speed is remembered; the panel and the Preferences screen share it.
  const [speed, setSpeed] = usePreference('simulation.speed')
  const stepMs = STEP_ANIMATION_MS / speed

  useEffect(() => {
    if (!playing || !player) return undefined
    const timer = window.setTimeout(() => {
      if (player.stepForward() === null) setPlaying(false)
    }, stepMs + STEP_GAP_MS / speed)
    return () => window.clearTimeout(timer)
  }, [playing, player, windowSerial, stepMs, speed])

  const play = useCallback(() => {
    if (!player || player.stepForward() === null) return
    setPlaying(true)
  }, [player])

  const pause = useCallback(() => setPlaying(false), [])

  const stepForward = useCallback(() => {
    setPlaying(false)
    player?.stepForward()
  }, [player])

  const stepBack = useCallback(() => {
    setPlaying(false)
    player?.stepBack()
  }, [player])

  return { playing: playing && player !== null, speed, stepMs, setSpeed, play, pause, stepForward, stepBack }
}

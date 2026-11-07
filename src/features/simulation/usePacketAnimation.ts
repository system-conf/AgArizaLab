import { useLayoutEffect, useRef, useState } from 'react'
import type { PacketMarkers } from './model/PacketMarkers'
import { PacketPlacement, type PacketPlace } from './model/PacketPlacement'

/** Fill of a packet the receiver dropped (red ✕). */
export const DROPPED_FILL = 'var(--color-packet-dropped)'

/** A packet element on the map and what the animation writes into it. */
export interface PacketElement {
  readonly element: HTMLElement
  /** Protocol colour while the packet is not dropped. */
  readonly fill: string
  /** Accessible name and tooltip (moving, dropped here); null for decorative replay packets. */
  readonly labels: { readonly moving: string; readonly dropped: string } | null
}

/** Packet elements by transmission id, filled by the elements' ref callbacks. */
export type PacketElements = Map<number, PacketElement>

/** One map per map layer: the ref callbacks add and remove elements, the animation reads them. */
export function usePacketElements(): PacketElements {
  const [elements] = useState<PacketElements>(() => new Map())
  return elements
}

function write(entry: PacketElement, place: PacketPlace): void {
  const { element } = entry
  element.style.transform = PacketPlacement.transform(place)
  const wasDropped = element.hasAttribute('data-dropped')
  if (wasDropped === place.droppedHere) return
  element.toggleAttribute('data-dropped', place.droppedHere)
  element.style.backgroundColor = place.droppedHere ? DROPPED_FILL : entry.fill
  if (entry.labels) {
    const label = place.droppedHere ? entry.labels.dropped : entry.labels.moving
    element.setAttribute('aria-label', label)
    element.setAttribute('title', label)
  }
}

export interface PacketAnimationInput {
  readonly markers: PacketMarkers
  readonly placement: PacketPlacement
  readonly elements: PacketElements
  /** Changes with every step (or replay hop): the animation starts again from 0. */
  readonly serial: number
  /** false: packets are drawn where they are at the end of the step (step back, reduced motion). */
  readonly animate: boolean
  readonly durationMs: number
}

/**
 * Moves the packets of the current step outside React state (docs/CANVAS_PERFORMANCE.md): one
 * requestAnimationFrame loop writes each packet's transform (and, when it arrives dropped, its colour,
 * ✕ and label) straight into the elements, so the map layer renders once per step instead of once per
 * frame. The render's own values are those at the start; this effect sets them again before paint, so
 * React and the loop never disagree. A re-run within the same step (new markers, a moved device)
 * continues from where the step's animation is.
 */
export function usePacketAnimation(input: PacketAnimationInput): void {
  const { markers, placement, elements, serial, animate, durationMs } = input
  const clock = useRef<{ serial: number; startedAt: number | null }>({ serial: Number.NaN, startedAt: null })

  useLayoutEffect(() => {
    function apply(progress: number) {
      for (const packet of markers.at(progress)) {
        const entry = elements.get(packet.transmissionId)
        if (entry) write(entry, placement.place(packet))
      }
    }

    if (!animate || durationMs <= 0) {
      apply(1)
      return undefined
    }
    if (clock.current.serial !== serial) clock.current = { serial, startedAt: null }
    const started = clock.current.startedAt
    apply(started === null ? 0 : Math.min(1, (performance.now() - started) / durationMs))
    let handle = requestAnimationFrame(tick)

    function tick(now: number) {
      const startedAt = clock.current.startedAt ?? now
      clock.current.startedAt = startedAt
      const progress = Math.min(1, (now - startedAt) / durationMs)
      apply(progress)
      if (progress < 1) handle = requestAnimationFrame(tick)
    }

    return () => cancelAnimationFrame(handle)
  }, [animate, durationMs, elements, markers, placement, serial])
}

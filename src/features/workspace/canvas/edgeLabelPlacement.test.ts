import { describe, expect, it } from 'vitest'
import { clearDistance, placeCableEnd } from './edgeLabelPlacement'

const centre = { x: 0, y: 0 }

describe('edge label placement', () => {
  it('keeps the port label below the name label on a cable going straight down', () => {
    const { led, label } = placeCableEnd(centre, { x: 0, y: 300 }, 'eth0', 34, 66)
    expect(led.y).toBeGreaterThanOrEqual(58)
    expect(label.y - led.y).toBeGreaterThanOrEqual(24)
  })

  it('leaves sideways and upward cables at the usual distances', () => {
    expect(placeCableEnd(centre, { x: 300, y: 0 }, 'Gi0/1', 34, 66)).toEqual({ led: { x: 34, y: 0 }, label: { x: 66, y: 0 } })
    expect(placeCableEnd(centre, { x: 0, y: -300 }, 'Fa0/8', 34, 66).label).toEqual({ x: 0, y: -66 })
  })

  it('keeps the two labels of a short cable apart, each in its own half', () => {
    const top = placeCableEnd(centre, { x: 0, y: 100 }, 'Gi0/0', 34, 66).label
    const bottom = placeCableEnd({ x: 0, y: 100 }, centre, 'Fa0/1', 34, 66).label
    expect(top.y + 9).toBeLessThanOrEqual(50)
    expect(bottom.y - 9).toBeGreaterThanOrEqual(50)
  })

  it('clears the name only for cables that pass under the box', () => {
    expect(clearDistance({ x: 0, y: 1 }, 10, 9)).toBeGreaterThan(clearDistance({ x: 0, y: -1 }, 10, 9))
    expect(clearDistance({ x: 1, y: 0 }, 10, 9)).toBe(35)
  })
})

import { describe, expect, it } from 'vitest'
import { LongPressGesture } from './LongPressGesture'

describe('LongPressGesture', () => {
  it('fires once after a still press and swallows the following click', () => {
    const gesture = new LongPressGesture()
    gesture.begin(1, 100, 100)
    expect(gesture.move(1, 104, 103)).toBe(false)
    expect(gesture.fire()).toBe(true)
    expect(gesture.fire()).toBe(false)
    expect(gesture.active).toBe(true)
    expect(gesture.consumeClick()).toBe(true)
    expect(gesture.consumeClick()).toBe(false)
    expect(gesture.active).toBe(false)
  })

  it('is cancelled by moving the finger (scroll or drag)', () => {
    const gesture = new LongPressGesture()
    gesture.begin(1, 100, 100)
    expect(gesture.move(1, 100, 100 + LongPressGesture.MOVE_TOLERANCE + 1)).toBe(true)
    expect(gesture.pending).toBe(false)
    expect(gesture.fire()).toBe(false)
    expect(gesture.consumeClick()).toBe(false)
  })

  it('ignores moves of another pointer and is cancelled by an early release', () => {
    const gesture = new LongPressGesture()
    gesture.begin(1, 0, 0)
    expect(gesture.move(2, 50, 50)).toBe(false)
    expect(gesture.pending).toBe(true)
    gesture.cancel()
    expect(gesture.fire()).toBe(false)
    expect(gesture.consumeClick()).toBe(false)
  })

  it('a new press clears a fired press that never got its click', () => {
    const gesture = new LongPressGesture()
    gesture.begin(1, 0, 0)
    gesture.fire()
    gesture.begin(2, 0, 0)
    gesture.cancel()
    expect(gesture.consumeClick()).toBe(false)
  })
})

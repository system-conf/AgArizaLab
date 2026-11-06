import { describe, expect, it } from 'vitest'
import { LabHistory } from './LabHistory'

interface Box {
  value: number
}

const box = (value: number): Box => ({ value })
const values = (items: readonly Box[]): number[] => items.map((item) => item.value)

describe('LabHistory', () => {
  it('undoes and redoes in order', () => {
    let history = LabHistory.start(box(0)).push(box(1)).push(box(2))
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)
    history = history.undo()
    expect(history.present.value).toBe(1)
    history = history.undo()
    expect(history.present.value).toBe(0)
    expect(history.canUndo).toBe(false)
    expect(history.undo()).toBe(history)
    history = history.redo().redo()
    expect(history.present.value).toBe(2)
    expect(history.redo()).toBe(history)
  })

  it('clears redo on a new step and ignores pushing the present again', () => {
    const start = LabHistory.start(box(0))
    const history = start.push(box(1)).undo().push(box(5))
    expect(history.canRedo).toBe(false)
    expect(values(history.past)).toEqual([0])
    expect(history.push(history.present)).toBe(history)
  })

  it('coalesces consecutive steps with the same key into one undo step', () => {
    let history = LabHistory.start(box(0)).push(box(1))
    for (let value = 2; value <= 10; value += 1) history = history.push(box(value), 'drag1')
    expect(values(history.past)).toEqual([0, 1])
    history = history.push(box(11), 'drag2').push(box(12), 'drag2')
    expect(values(history.past)).toEqual([0, 1, 10])
    expect(history.undo().present.value).toBe(10)
    // After an undo the same key starts a new step instead of rewriting the undone one.
    const resumed = history.undo().push(box(20), 'drag2')
    expect(values(resumed.past)).toEqual([0, 1, 10])
    expect(values(resumed.push(box(21), 'drag2').past)).toEqual([0, 1, 10])
  })

  it('keeps at most `limit` undo steps', () => {
    let history = LabHistory.start(box(0), 3)
    for (let value = 1; value <= 10; value += 1) history = history.push(box(value))
    expect(values(history.past)).toEqual([7, 8, 9])
    history = history.undo().undo().undo()
    expect(history.present.value).toBe(7)
    expect(history.canUndo).toBe(false)
    expect(values(history.redo().past)).toEqual([7])
    expect(() => LabHistory.start(box(0), 0)).toThrow()
  })

  it('reset starts over with the same limit', () => {
    const history = LabHistory.start(box(0), 5).push(box(1)).reset(box(9))
    expect(history.present.value).toBe(9)
    expect(history.canUndo || history.canRedo).toBe(false)
    expect(history.limit).toBe(5)
  })

  it('maps every step without adding one and keeps coalescing', () => {
    const history = LabHistory.start(box(1)).push(box(2)).push(box(3)).undo().push(box(4), 'drag')
    const mapped = history.map((item) => box(item.value * 10))
    expect(values(mapped.past)).toEqual([10, 20])
    expect(mapped.present.value).toBe(40)
    expect(mapped.push(box(5), 'drag').past).toHaveLength(2)
    const withFuture = LabHistory.start(box(1)).push(box(2)).undo().map((item) => box(item.value + 1))
    expect(withFuture.present.value).toBe(2)
    expect(values(withFuture.future)).toEqual([3])
  })
})

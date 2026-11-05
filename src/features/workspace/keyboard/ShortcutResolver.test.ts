import { describe, expect, it } from 'vitest'
import { ShortcutResolver, type KeyPress } from './ShortcutResolver'

const resolver = new ShortcutResolver(4, 24)

function press(key: string, modifiers: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...modifiers }
}

describe('ShortcutResolver', () => {
  it('maps undo and both redo forms (Ctrl and Cmd)', () => {
    expect(resolver.resolve(press('z', { ctrlKey: true }))).toEqual({ kind: 'undo' })
    expect(resolver.resolve(press('z', { metaKey: true }))).toEqual({ kind: 'undo' })
    expect(resolver.resolve(press('Z', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'redo' })
    expect(resolver.resolve(press('y', { ctrlKey: true }))).toEqual({ kind: 'redo' })
    expect(resolver.resolve(press('a', { ctrlKey: true }))).toEqual({ kind: 'selectAll' })
  })

  it('maps delete, escape, the cable tool and help', () => {
    expect(resolver.resolve(press('Delete'))).toEqual({ kind: 'delete' })
    expect(resolver.resolve(press('Backspace'))).toEqual({ kind: 'delete' })
    expect(resolver.resolve(press('Escape'))).toEqual({ kind: 'escape' })
    expect(resolver.resolve(press('C', { shiftKey: true }))).toBeNull()
    expect(resolver.resolve(press('c'))).toEqual({ kind: 'cableTool' })
    expect(resolver.resolve(press('?', { shiftKey: true }))).toEqual({ kind: 'showShortcuts' })
  })

  it('nudges with the arrow keys, further with Shift', () => {
    expect(resolver.resolve(press('ArrowLeft'))).toEqual({ kind: 'nudge', dx: -4, dy: 0 })
    expect(resolver.resolve(press('ArrowDown', { shiftKey: true }))).toEqual({ kind: 'nudge', dx: 0, dy: 24 })
  })

  it('ignores other keys and modified plain keys', () => {
    expect(resolver.resolve(press('x'))).toBeNull()
    expect(resolver.resolve(press('c', { ctrlKey: true }))).toBeNull()
    expect(resolver.resolve(press('c', { altKey: true }))).toBeNull()
    expect(resolver.resolve(press('ArrowUp', { ctrlKey: true }))).toBeNull()
  })

  it('never treats a non-DOM target as editable', () => {
    expect(ShortcutResolver.isEditableTarget(null)).toBe(false)
  })
})

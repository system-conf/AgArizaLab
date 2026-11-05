// Keyboard shortcuts of the workspace: key press → command (pure; the hook performs them).

export type WorkspaceCommand =
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'delete' }
  | { kind: 'escape' }
  | { kind: 'cableTool' }
  | { kind: 'selectAll' }
  | { kind: 'showShortcuts' }
  /** Move the selection; `dx` / `dy` in canvas units. */
  | { kind: 'nudge'; dx: number; dy: number }

/** The parts of a KeyboardEvent the resolver reads (testable without a DOM). */
export interface KeyPress {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const ARROWS: Readonly<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export class ShortcutResolver {
  private readonly step: number
  private readonly largeStep: number

  /** Arrow keys nudge by `step`, Shift + arrow by `largeStep` (canvas units). */
  constructor(step: number, largeStep: number) {
    this.step = step
    this.largeStep = largeStep
  }

  /** Command for a key press, or null when the key is not a workspace shortcut. */
  resolve(press: KeyPress): WorkspaceCommand | null {
    const key = press.key.length === 1 ? press.key.toLowerCase() : press.key
    const command = press.ctrlKey || press.metaKey ? this.withModifier(key, press.shiftKey) : null
    if (command !== null || press.ctrlKey || press.metaKey || press.altKey) return command
    return this.plain(key, press)
  }

  private withModifier(key: string, shift: boolean): WorkspaceCommand | null {
    if (key === 'z') return shift ? { kind: 'redo' } : { kind: 'undo' }
    if (key === 'y') return { kind: 'redo' }
    if (key === 'a' && !shift) return { kind: 'selectAll' }
    return null
  }

  private plain(key: string, press: KeyPress): WorkspaceCommand | null {
    const arrow = ARROWS[key]
    if (arrow) {
      const distance = press.shiftKey ? this.largeStep : this.step
      return { kind: 'nudge', dx: arrow[0] * distance, dy: arrow[1] * distance }
    }
    switch (key) {
      case 'Delete':
      case 'Backspace':
        return { kind: 'delete' }
      case 'Escape':
        return { kind: 'escape' }
      case 'c':
        return press.shiftKey ? null : { kind: 'cableTool' }
      case '?':
        return { kind: 'showShortcuts' }
      default:
        return null
    }
  }

  /** True when the key press happens inside a text field, where shortcuts must not fire. */
  static isEditableTarget(target: EventTarget | null): boolean {
    if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  }
}

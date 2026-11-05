import { useEffect, useMemo, useRef } from 'react'
import { ShortcutResolver, type WorkspaceCommand } from './ShortcutResolver'
import { GRID_SIZE, NUDGE_FACTOR, NUDGE_STEP } from '../workspaceConstants'

/** What each shortcut does; supplied by the workspace screen. */
export interface ShortcutHandlers {
  run: (command: WorkspaceCommand) => void
  /** Enter on a focused canvas node (device or annotation), by node id. */
  activateNode: (nodeId: string) => void
}

/** Focused React Flow node (or the multi-selection box), which handles arrow keys itself. */
function flowNodeOf(target: EventTarget | null): HTMLElement | null {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return null
  return target.closest<HTMLElement>('.react-flow__node, .react-flow__nodesselection-rect')
}

/**
 * Workspace shortcuts on the whole window while the workspace is shown. Ignored inside text
 * fields; arrow keys on a focused node are left to React Flow (it moves the selection itself and
 * the move is committed like a drag).
 */
export function useWorkspaceKeyboard(handlers: ShortcutHandlers, snapToGrid: boolean): void {
  const resolver = useMemo(() => {
    const step = snapToGrid ? GRID_SIZE : NUDGE_STEP
    return new ShortcutResolver(step, step * NUDGE_FACTOR)
  }, [snapToGrid])
  // Latest handlers without re-subscribing on every render.
  const latest = useRef(handlers)
  useEffect(() => {
    latest.current = handlers
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || ShortcutResolver.isEditableTarget(event.target)) return
      const node = flowNodeOf(event.target)
      if (event.key === 'Enter' && node?.dataset.id) {
        latest.current.activateNode(node.dataset.id)
        return
      }
      const command = resolver.resolve(event)
      if (command === null || (command.kind === 'nudge' && node !== null)) return
      // Buttons keep their own Enter / Space; only our keys are taken over.
      event.preventDefault()
      latest.current.run(command)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [resolver])
}

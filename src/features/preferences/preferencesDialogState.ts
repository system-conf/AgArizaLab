// Whether the Preferences dialog is open in the workspace screens (header gear button, File menu item).
// One small external store, so both entry points open the same dialog without threading props through
// WorkspaceView; the dialog itself loads on demand.
import { useSyncExternalStore } from 'react'

export class PreferencesDialogState {
  private open = false
  private readonly listeners = new Set<() => void>()

  readonly isOpen = (): boolean => this.open

  readonly show = (): void => this.set(true)

  readonly hide = (): void => this.set(false)

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private set(open: boolean): void {
    if (this.open === open) return
    this.open = open
    for (const listener of [...this.listeners]) listener()
  }
}

/** The app's one dialog state. */
export const preferencesDialog = new PreferencesDialogState()

/** true while the Preferences dialog is open. */
export function usePreferencesDialogOpen(): boolean {
  return useSyncExternalStore(preferencesDialog.subscribe, preferencesDialog.isOpen, preferencesDialog.isOpen)
}

// React state over the PaletteMemory store (one store per mounted palette).
import { useCallback, useState } from 'react'
import { PaletteMemory, type PaletteMemoryState } from './PaletteMemory'

export interface PaletteMemoryControls extends PaletteMemoryState {
  recordUse: (modelId: string) => void
  toggleFavourite: (modelId: string) => void
}

export function usePaletteMemory(): PaletteMemoryControls {
  const [store] = useState(() => PaletteMemory.fromBrowser())
  const [state, setState] = useState<PaletteMemoryState>(() => store.read())
  const recordUse = useCallback((modelId: string) => setState(store.recordUse(modelId)), [store])
  const toggleFavourite = useCallback((modelId: string) => setState(store.toggleFavourite(modelId)), [store])
  return { ...state, recordUse, toggleFavourite }
}

import type { CableTool } from '../../../domain'
import { usePreference } from '../../../preferences'
import { offeredCableTools } from '../../preferences/model/preferenceWiring'

/** Cable tools the toolbar, the palette and the cable shortcut offer (PU: Preferences → Cables, automatic cable). */
export function useOfferedCableTools(): readonly CableTool[] {
  const [autoCable] = usePreference('cables.autoCable')
  return offeredCableTools(autoCable)
}

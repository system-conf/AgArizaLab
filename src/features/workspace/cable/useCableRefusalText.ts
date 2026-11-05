import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { CableRefusal } from '../../../domain/v2'

/** Every CableRefusal has a `workspace:cableRefusal.<reason>` text; a new reason fails to compile here. */
const REFUSAL_KEYS = {
  unknownDevice: 'cableRefusal.unknownDevice',
  unknownPort: 'cableRefusal.unknownPort',
  sameDevice: 'cableRefusal.sameDevice',
  cableDoesNotFitPort: 'cableRefusal.cableDoesNotFitPort',
  wirelessNeedsClientAndRadio: 'cableRefusal.wirelessNeedsClientAndRadio',
  portInUse: 'cableRefusal.portInUse',
  consoleNeedsTerminal: 'cableRefusal.consoleNeedsTerminal',
  ssidRequired: 'cableRefusal.ssidRequired',
  crossoverRequired: 'cableRefusal.crossoverRequired',
  straightThroughRequired: 'cableRefusal.straightThroughRequired',
} as const satisfies Record<CableRefusal, `cableRefusal.${CableRefusal}`>

/** Translated explanation of a cable refusal. */
export function useCableRefusalText(): (reason: CableRefusal) => string {
  const { t } = useTranslation('workspace')
  return useCallback((reason: CableRefusal) => t(REFUSAL_KEYS[reason]), [t])
}

// Compile-checked messages of the `simulation` namespace for codes the contract defines: a code without
// its key in src/locales/en/simulation.json is a type error here (docs/I18N.md §3).
import type { LocalizedMessage } from '../../domain/Messages'
import { localizedMessage } from '../../i18n/messageKeys'
import type { PduFieldKey } from './PduLayers'
import type { OsiLayer, SimAction, SimProtocol } from './SimEvent'
import type { SimReason } from './SimReason'

export class SimMessages {
  static action(action: SimAction): LocalizedMessage {
    return localizedMessage(`simulation:actions.${action}`)
  }

  static reason(reason: SimReason): LocalizedMessage {
    return localizedMessage(`simulation:reasons.${reason}`)
  }

  static protocol(protocol: SimProtocol): LocalizedMessage {
    return localizedMessage(`simulation:protocols.${protocol}`)
  }

  static layer(layer: OsiLayer): LocalizedMessage {
    return localizedMessage(`simulation:layers.layer${layer}`)
  }

  static field(field: PduFieldKey): LocalizedMessage {
    return localizedMessage(`simulation:fields.${field}`)
  }
}

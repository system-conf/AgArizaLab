import type { ExerciseTexts } from '../domain'
import { translateList, translateMessage, type AnyTFunction } from '../i18n/localizedMessage'

/**
 * Reads exercise texts from the `exercises` namespace (layout in docs/I18N.md §5). A missing text
 * never crashes: it is reported with console.warn and replaced by a fallback (usually the id);
 * missing topics become an empty list.
 */
export class ExerciseTextReader {
  private readonly t: AnyTFunction

  /** `t` is any i18next t function (useTranslation, i18n.t or i18n.getFixedT). */
  constructor(t: AnyTFunction) {
    this.t = t
  }

  /** Title, complaint, guide steps, explanation and topics of one exercise. */
  texts(exerciseId: string): ExerciseTexts {
    const text = (path: string): string => this.text(`exercises:${exerciseId}.${path}`, exerciseId)
    return {
      title: text('title'),
      complaint: { from: text('complaint.from'), message: text('complaint.message') },
      guide: [text('hints.0'), text('hints.1'), text('hints.2')],
      explanation: {
        whatHappened: text('explanation.whatHappened'),
        realLife: text('explanation.realLife'),
        interviewAnswer: text('explanation.interviewAnswer'),
      },
      topics: translateList(this.t, `exercises:${exerciseId}.topics`),
    }
  }

  deviceName(exerciseId: string, deviceId: string): string {
    return this.text(`exercises:${exerciseId}.devices.${deviceId}`, deviceId)
  }

  appLinkLabel(exerciseId: string, appLinkId: string): string {
    return this.text(`exercises:${exerciseId}.appLinks.${appLinkId}`, appLinkId)
  }

  /** i18next returns the key (with or without namespace) for a missing text; that counts as missing. */
  text(key: string, fallback: string): string {
    const result = translateMessage(this.t, { key })
    const keyWithoutNamespace = key.slice(key.indexOf(':') + 1)
    if (result.trim() !== '' && result !== key && result !== keyWithoutNamespace) return result
    console.warn(`Missing exercise text '${key}', showing '${fallback}' instead`)
    return fallback
  }
}

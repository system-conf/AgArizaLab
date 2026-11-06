import { translateList, translateMessage, type AnyTFunction } from '../../i18n/localizedMessage'
import { SampleTextKeys } from './SampleTextKeys'
import type { SampleDefinition, SampleTexts } from './SampleTypes'

/**
 * Reads sample texts from the `samples` namespace (layout in docs/SAMPLE_LABS.md §Texts). A missing
 * text never crashes: it is reported with console.warn and replaced by the id; missing topics become [].
 */
export class SampleTextReader {
  private readonly t: AnyTFunction

  /** `t` is any i18next t function (useTranslation, i18n.t or i18n.getFixedT). */
  constructor(t: AnyTFunction) {
    this.t = t
  }

  texts(sample: Pick<SampleDefinition, 'id' | 'steps' | 'breakIt'>): SampleTexts {
    const id = sample.id
    return {
      title: this.text(SampleTextKeys.title(id), id),
      summary: this.text(SampleTextKeys.summary(id), ''),
      intro: {
        what: this.text(SampleTextKeys.intro(id, 'what'), ''),
        why: this.text(SampleTextKeys.intro(id, 'why'), ''),
        realWorld: this.text(SampleTextKeys.intro(id, 'realWorld'), ''),
      },
      steps: sample.steps.map((step) => ({
        id: step.id,
        title: this.text(SampleTextKeys.step(id, step.id, 'title'), step.id),
        detail: this.text(SampleTextKeys.step(id, step.id, 'detail'), ''),
      })),
      breakIt: sample.breakIt.map((ideaId) => ({
        id: ideaId,
        change: this.text(SampleTextKeys.breakIt(id, ideaId, 'change'), ideaId),
        result: this.text(SampleTextKeys.breakIt(id, ideaId, 'result'), ''),
      })),
      topics: translateList(this.t, SampleTextKeys.topics(id)),
    }
  }

  /** Only the card texts (list screen). */
  title(sampleId: string): string {
    return this.text(SampleTextKeys.title(sampleId), sampleId)
  }

  summary(sampleId: string): string {
    return this.text(SampleTextKeys.summary(sampleId), '')
  }

  /** i18next returns the key (with or without namespace) for a missing text; that counts as missing. */
  text(key: string, fallback: string): string {
    const result = translateMessage(this.t, { key })
    const keyWithoutNamespace = key.slice(key.indexOf(':') + 1)
    if (result.trim() !== '' && result !== key && result !== keyWithoutNamespace) return result
    console.warn(`Missing sample text '${key}', showing '${fallback}' instead`)
    return fallback
  }
}

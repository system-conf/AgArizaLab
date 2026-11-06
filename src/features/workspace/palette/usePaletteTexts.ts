// Translated texts of the palette models (name, description, use case, port summary) and the
// search index built from them; rebuilt when the language changes.
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeviceModel } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import { modelDescriptionKey, PortSummary, sectionOfModel, type PortSummaryInfo } from '../labServices'
import { PaletteFilter } from './PaletteFilter'

export interface PaletteModelText {
  name: string
  description: string
  useCase: string
  /** e.g. "24× Fa · 2× Gi uplink · PoE · Console". */
  ports: string
}

export interface PaletteTexts {
  textOf: (modelId: string) => PaletteModelText | undefined
  filter: PaletteFilter
}

/** Builds the one-line port summary text of a model. */
export function usePortSummaryText(): (summary: PortSummaryInfo) => string {
  const { t } = useTranslation('workspace')
  return useCallback(
    (summary: PortSummaryInfo) => {
      const parts = summary.parts.map((part) => {
        const text = t(`palette.ports.${part.type}`, { count: part.count })
        return part.qualifier === undefined
          ? text
          : t('palette.ports.withQualifier', { part: text, qualifier: t(`palette.ports.qualifiers.${part.qualifier}`) })
      })
      if (summary.poe) parts.push(t('palette.ports.poe'))
      if (summary.console) parts.push(t('palette.ports.console'))
      return parts.join(t('palette.ports.separator'))
    },
    [t],
  )
}

export function usePaletteTexts(models: readonly DeviceModel[]): PaletteTexts {
  const translate = useMessageTranslator()
  const portsText = usePortSummaryText()
  return useMemo(() => {
    const texts = new Map<string, PaletteModelText>()
    const entries = models.map((model) => {
      const text: PaletteModelText = {
        name: translate({ key: model.nameKey }),
        description: translate({ key: modelDescriptionKey(model) }),
        useCase: translate({ key: model.useCaseKey }),
        ports: portsText(PortSummary.forModel(model)),
      }
      texts.set(model.id, text)
      const searchText = [
        text.description,
        text.useCase,
        text.ports,
        translate({ key: `catalog:subcategories.${model.subcategory}` }),
        translate({ key: `catalog:sections.${sectionOfModel(model)}` }),
        translate({ key: `catalog:kinds.${model.kind}` }),
        model.capabilities.join(' '),
        String(model.ports.filter((port) => port.medium !== 'console').length),
      ].join(' ')
      return { modelId: model.id, name: text.name, searchText }
    })
    return { textOf: (modelId: string) => texts.get(modelId), filter: new PaletteFilter(entries) }
  }, [models, portsText, translate])
}

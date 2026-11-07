import { Cloud } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CheckboxField from '../fields/CheckboxField'
import SectionCard from '../fields/SectionCard'
import SectionForm from '../fields/SectionForm'
import { patchAt } from '../model/formTypes'
import { InternetServiceModel, type ServiceLineDraft } from '../model/InternetServiceModel'
import type { SectionProps } from './sectionTypes'

/** Internet cloud: one service switch per port (provider outage when off). */
function InternetSection({ device, access, saved, onSave }: SectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [lines, setLines] = useState<ServiceLineDraft[]>(() => InternetServiceModel.serviceLines(device))

  return (
    <SectionCard title={t('sections.internet')} icon={Cloud} access={access} saved={saved}>
      <SectionForm
        editable={access === 'editable'}
        onSubmit={() => onSave({ ...device, internet: InternetServiceModel.apply(lines, device) })}
        onDiscard={() => setLines(InternetServiceModel.serviceLines(device))}
      >
        <p className="text-xs text-fg-subtle">{t('internet.hint')}</p>
        {lines.length === 0 && <p className="text-sm text-fg-subtle">{t('internet.noPorts')}</p>}
        {lines.map((line, index) => (
          <CheckboxField
            key={line.portId}
            label={t('internet.serviceUp', { port: line.portId })}
            checked={line.serviceUp}
            onChange={(serviceUp) => setLines((current) => patchAt(current, index, { serviceUp }))}
          />
        ))}
      </SectionForm>
    </SectionCard>
  )
}

export default InternetSection

import { useTranslation } from 'react-i18next'
import { usePreference } from '../../../preferences'
import ComingSoonBadge from '../controls/ComingSoonBadge'
import { FIELD_LIST } from '../controls/fieldList'
import SwitchField from '../controls/SwitchField'

/** Cables: the automatic cable tool; cable length effects come with the physical view (BACKLOG 15). */
function CablesSection() {
  const { t } = useTranslation('preferences')
  const [autoCable, setAutoCable] = usePreference('cables.autoCable')

  return (
    <div className={FIELD_LIST}>
      <SwitchField label={t('cables.autoCable.label')} hint={t('cables.autoCable.hint')} checked={autoCable} onChange={setAutoCable} />
      <SwitchField label={t('cables.length.label')} hint={t('cables.length.hint')} checked={false} onChange={() => undefined} disabled badge={<ComingSoonBadge />} />
    </div>
  )
}

export default CablesSection

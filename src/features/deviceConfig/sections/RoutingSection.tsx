import { Route } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RoutingSettings } from '../../../domain'
import CheckboxField from '../fields/CheckboxField'
import InputField from '../fields/InputField'
import RowList from '../fields/RowList'
import SectionCard from '../fields/SectionCard'
import SectionForm from '../fields/SectionForm'
import SelectField from '../fields/SelectField'
import { useShownErrors } from '../fields/useShownErrors'
import { anyRowErrors, patchAt, removeAt } from '../model/formTypes'
import { StaticRouteFormModel, type RoutingDraft, type StaticRouteDraft } from '../model/StaticRouteFormModel'
import { fieldGrid, type SectionProps } from './sectionTypes'

interface RoutingSectionProps extends SectionProps {
  routing: RoutingSettings
  /** L3 switch: `ip routing` can be switched; routers always route. */
  ipRoutingChoice: boolean
}

/** `ip routing` (L3 switch) and the static routes table. */
function RoutingSection({ device, routing, ipRoutingChoice, access, saved, onSave }: RoutingSectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [draft, setDraft] = useState<RoutingDraft>(() => StaticRouteFormModel.toDraft(routing))
  const errors = useShownErrors()
  const interfaces = StaticRouteFormModel.exitInterfaces(device)
  const validation = StaticRouteFormModel.validate(draft.routes, interfaces)
  const setRoutes = (change: (routes: StaticRouteDraft[]) => StaticRouteDraft[]) =>
    setDraft((current) => ({ ...current, routes: change(current.routes) }))

  function submit() {
    errors.markSubmitted()
    if (anyRowErrors(validation)) return
    onSave({ ...device, routing: StaticRouteFormModel.apply(draft, routing) })
  }

  function discard() {
    setDraft(StaticRouteFormModel.toDraft(routing))
    errors.reset()
  }

  function interfaceOptions(current: string) {
    // A route may name an interface that no longer exists: keep it visible so the error makes sense.
    const ids = current === '' || interfaces.includes(current) ? interfaces : [...interfaces, current]
    return [{ value: '', label: t('routing.noExitInterface') }, ...ids.map((id) => ({ value: id, label: id }))]
  }

  return (
    <SectionCard title={t('sections.routing')} icon={Route} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        {ipRoutingChoice && (
          <CheckboxField
            label={t('routing.ipRouting')}
            checked={draft.ipRouting}
            onChange={(ipRouting) => setDraft((current) => ({ ...current, ipRouting }))}
            hint={t('routing.ipRoutingHint')}
          />
        )}
        <h4 className="text-sm font-medium text-slate-700">{t('routing.staticRoutes')}</h4>
        <p className="text-xs text-slate-500">{t('routing.routeHint')}</p>
        <RowList
          items={draft.routes}
          keyOf={(row) => row.key}
          titleOf={(_, index) => t('routing.item', { index: index + 1 })}
          emptyText={t('routing.empty')}
          addLabel={t('routing.add')}
          onAdd={() => setRoutes((routes) => [...routes, StaticRouteFormModel.newDraft()])}
          removeLabelOf={(_, index) => t('routing.remove', { index: index + 1 })}
          onRemove={(index) => setRoutes((routes) => removeAt(routes, index))}
          renderRow={(row, index) => {
            const rowErrors = validation[index] ?? {}
            const patch = (change: Partial<StaticRouteDraft>) => setRoutes((routes) => patchAt(routes, index, change))
            return (
              <div className={fieldGrid}>
                <InputField label={t('routing.prefix')} type="address" value={row.prefix} onChange={(prefix) => patch({ prefix })} error={errors.show(rowErrors.prefix)} />
                <InputField label={t('routing.mask')} type="address" value={row.mask} onChange={(mask) => patch({ mask })} error={errors.show(rowErrors.mask)} />
                <InputField label={t('routing.nextHop')} type="address" value={row.nextHop} onChange={(nextHop) => patch({ nextHop })} error={errors.show(rowErrors.nextHop)} />
                <SelectField
                  label={t('routing.exitInterface')}
                  value={row.exitInterfaceId}
                  options={interfaceOptions(row.exitInterfaceId)}
                  onChange={(exitInterfaceId) => patch({ exitInterfaceId })}
                  error={errors.show(rowErrors.exitInterfaceId)}
                />
                <InputField
                  label={t('routing.adminDistance')}
                  type="number"
                  value={row.adminDistance}
                  onChange={(adminDistance) => patch({ adminDistance })}
                  error={errors.show(rowErrors.adminDistance)}
                />
              </div>
            )
          }}
        />
      </SectionForm>
    </SectionCard>
  )
}

export default RoutingSection

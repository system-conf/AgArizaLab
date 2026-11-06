import { Layers } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SwitchingSettings } from '../../../domain'
import { focusRing } from '../../shared/focusRing'
import InputField from '../fields/InputField'
import RowList from '../fields/RowList'
import SectionCard from '../fields/SectionCard'
import SectionForm from '../fields/SectionForm'
import { useShownErrors } from '../fields/useShownErrors'
import { anyRowErrors, patchAt } from '../model/formTypes'
import { MAX_VLAN_NAME, VlanDatabaseModel, type VlanRowDraft } from '../model/VlanDatabaseModel'
import { VlanListParser } from '../model/VlanListParser'
import { fieldGrid, type SectionProps } from './sectionTypes'

interface VlansSectionProps extends SectionProps {
  switching: SwitchingSettings
}

/** VLAN database: add, rename, remove (VLAN 1 stays; removing a VLAN in use asks first). */
function VlansSection({ device, switching, access, saved, onSave }: VlansSectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [rows, setRows] = useState<VlanRowDraft[]>(() => VlanDatabaseModel.toDrafts(switching.vlans))
  /** Row key waiting for "Remove anyway". */
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const errors = useShownErrors()
  const validation = VlanDatabaseModel.validate(rows)
  const patch = (index: number, change: Partial<VlanRowDraft>) => setRows((current) => patchAt(current, index, change))

  function usersOf(row: VlanRowDraft): string[] {
    const vlan = VlanListParser.parseId(row.id)
    return row.existing && vlan !== null ? VlanDatabaseModel.usage(device, vlan) : []
  }

  function requestRemove(index: number) {
    const row = rows[index]
    if (!row) return
    if (usersOf(row).length > 0 && confirmKey !== row.key) {
      setConfirmKey(row.key)
      return
    }
    remove(row.key)
  }

  function remove(key: string) {
    setConfirmKey(null)
    setRows((current) => current.filter((row) => row.key !== key))
  }

  function submit() {
    errors.markSubmitted()
    if (anyRowErrors(validation)) return
    onSave({ ...device, switching: { ...switching, vlans: VlanDatabaseModel.apply(rows) } })
  }

  function discard() {
    setRows(VlanDatabaseModel.toDrafts(switching.vlans))
    setConfirmKey(null)
    errors.reset()
  }

  return (
    <SectionCard title={t('sections.vlans')} icon={Layers} access={access} saved={saved}>
      <SectionForm editable={access === 'editable'} onSubmit={submit} onDiscard={discard}>
        <RowList
          items={rows}
          keyOf={(row) => row.key}
          titleOf={(row) => (row.existing ? t('vlans.item', { vlan: row.id }) : t('vlans.newItem'))}
          addLabel={t('vlans.add')}
          onAdd={() => setRows((current) => [...current, VlanDatabaseModel.newDraft()])}
          removeLabelOf={(row) => t('vlans.remove', { vlan: row.id })}
          onRemove={requestRemove}
          canRemove={(row) => VlanDatabaseModel.isRemovable(row)}
          renderRow={(row, index) => (
            <div className="flex flex-col gap-3">
              <div className={fieldGrid}>
                {!row.existing && (
                  <InputField
                    label={t('vlans.id')}
                    type="number"
                    value={row.id}
                    onChange={(id) => patch(index, { id })}
                    error={errors.show(validation[index]?.id)}
                  />
                )}
                <InputField
                  label={t('vlans.name')}
                  value={row.name}
                  onChange={(name) => patch(index, { name })}
                  hint={row.existing ? undefined : t('vlans.nameHint')}
                  maxLength={MAX_VLAN_NAME * 2}
                  error={errors.show(validation[index]?.name)}
                />
              </div>
              {!VlanDatabaseModel.isRemovable(row) && <p className="text-xs text-slate-500">{t('vlans.defaultFixed')}</p>}
              {confirmKey === row.key && (
                <div role="alert" className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                  <p>{t('vlans.inUse', { vlan: row.id, users: usersOf(row).join(', ') })}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => remove(row.key)}
                      className={`rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 ${focusRing}`}
                    >
                      {t('actions.removeAnyway')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmKey(null)}
                      className={`rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm hover:bg-amber-100 ${focusRing}`}
                    >
                      {t('actions.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        />
      </SectionForm>
    </SectionCard>
  )
}

export default VlansSection

import { useTranslation } from 'react-i18next'
import CheckboxField from '../../fields/CheckboxField'
import InputField from '../../fields/InputField'
import RowList from '../../fields/RowList'
import { patchAt, removeAt, type FieldErrors } from '../../model/formTypes'
import { SubInterfaceFormModel, type SubInterfaceDraft, type SubInterfaceField } from '../../model/SubInterfaceFormModel'
import { fieldGrid, type ShowError } from '../sectionTypes'

interface SubInterfaceListProps {
  parentId: string
  rows: readonly SubInterfaceDraft[]
  errors: readonly FieldErrors<SubInterfaceField>[]
  show: ShowError
  onChange: (rows: SubInterfaceDraft[]) => void
}

/** dot1Q sub-interfaces of a routed Ethernet port (router-on-a-stick). */
function SubInterfaceList({ parentId, rows, errors, show, onChange }: SubInterfaceListProps) {
  const { t } = useTranslation('deviceConfig')
  const patch = (index: number, change: Partial<SubInterfaceDraft>) => onChange(patchAt(rows, index, change))

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium text-slate-700">{t('subInterfaces.title')}</h4>
      <RowList
        items={rows}
        keyOf={(row) => row.key}
        titleOf={(row) => t('subInterfaces.item', { id: SubInterfaceFormModel.idOf(parentId, row.suffix) })}
        emptyText={t('subInterfaces.empty')}
        addLabel={t('subInterfaces.add')}
        onAdd={() => onChange([...rows, SubInterfaceFormModel.newDraft(rows)])}
        removeLabelOf={(row) => t('subInterfaces.remove', { id: SubInterfaceFormModel.idOf(parentId, row.suffix) })}
        onRemove={(index) => onChange(removeAt(rows, index))}
        renderRow={(row, index) => {
          const rowErrors = errors[index] ?? {}
          return (
            <div className={fieldGrid}>
              <InputField
                label={t('subInterfaces.number')}
                type="number"
                value={row.suffix}
                onChange={(suffix) => patch(index, { suffix })}
                error={show(rowErrors.suffix)}
              />
              <InputField label={t('subInterfaces.vlan')} type="number" value={row.vlan} onChange={(vlan) => patch(index, { vlan })} error={show(rowErrors.vlan)} />
              <InputField label={t('port.address')} type="address" value={row.address} onChange={(address) => patch(index, { address })} error={show(rowErrors.address)} />
              <InputField label={t('port.mask')} type="address" value={row.mask} onChange={(mask) => patch(index, { mask })} error={show(rowErrors.mask)} />
              <InputField label={t('port.description')} value={row.description} onChange={(description) => patch(index, { description })} />
              <div className="flex flex-col gap-2 @md:pt-6">
                <CheckboxField label={t('subInterfaces.adminUp')} checked={row.adminUp} onChange={(adminUp) => patch(index, { adminUp })} />
                <CheckboxField
                  label={t('subInterfaces.native')}
                  checked={row.native}
                  onChange={(native) => patch(index, { native })}
                  error={show(rowErrors.native)}
                />
              </div>
            </div>
          )
        }}
      />
    </div>
  )
}

export default SubInterfaceList

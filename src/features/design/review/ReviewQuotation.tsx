import { Coins, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { findDeviceModel } from '../../../catalog'
import { useMessageTranslator } from '../../../i18n'
import { useNumberFormat } from '../../layout/useNumberFormat'
import type { DesignReviewViewModel } from '../model/DesignReviewView'
import BudgetMeterBar from '../workspace/BudgetMeterBar'
import ReviewSection from './ReviewSection'

interface ReviewQuotationProps {
  view: DesignReviewViewModel
}

const cell = 'px-2 py-1.5'

/** The quotation ("teklif") of the learner's additions and the device counts. */
function ReviewQuotation({ view }: ReviewQuotationProps) {
  const { t } = useTranslation(['design', 'catalog', 'workspace'])
  const translate = useMessageTranslator()
  const formatNumber = useNumberFormat()
  const price = (amount: number) => t('design:units.price', { amount })
  const modelName = (modelId: string) => {
    const model = findDeviceModel(modelId)
    return model ? translate({ key: model.nameKey }) : modelId
  }
  const lines = [
    ...view.cost.devices.map((line) => ({ key: `device-${line.modelId}`, name: modelName(line.modelId), ...line })),
    ...view.cost.cables.map((line) => ({ key: `cable-${line.cable}`, name: t(`workspace:cableTools.${line.cable}`), ...line })),
  ]

  return (
    <>
      <ReviewSection id="designReviewQuotation" title={t('design:ui.review.cost.title')} icon={Coins}>
        {lines.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('design:ui.review.cost.empty')}</p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[20rem] text-sm">
              <thead className="text-xs text-fg-subtle">
                <tr className="border-b border-border">
                  <th scope="col" className={`${cell} text-start font-medium`}>
                    {t('design:ui.review.cost.item')}
                  </th>
                  <th scope="col" className={`${cell} text-end font-medium`}>
                    {t('design:ui.review.cost.count')}
                  </th>
                  <th scope="col" className={`${cell} text-end font-medium`}>
                    {t('design:ui.review.cost.unitPrice')}
                  </th>
                  <th scope="col" className={`${cell} text-end font-medium`}>
                    {t('design:ui.review.cost.subtotal')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key} className="border-b border-border/60">
                    <th scope="row" className={`${cell} text-start font-normal text-fg`}>
                      {line.name}
                    </th>
                    <td className={`${cell} text-end tabular-nums`}>{formatNumber(line.count)}</td>
                    <td className={`${cell} text-end tabular-nums`}>{price(line.unitPrice)}</td>
                    <td className={`${cell} text-end tabular-nums`}>{price(line.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3} className={`${cell} text-start font-semibold text-fg-strong`}>
                    {t('design:ui.review.cost.total')}
                  </th>
                  <td className={`${cell} text-end font-semibold tabular-nums text-fg-strong`}>{price(view.cost.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2">
          {view.budget && <BudgetMeterBar meter={view.budget} />}
          <p className="text-sm text-fg">{translate(view.budgetMessage)}</p>
        </div>
      </ReviewSection>
      <ReviewSection id="designReviewDevices" title={t('design:ui.review.devices.title')} icon={Server}>
        <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-surface-subtle p-2.5">
            <dt className="text-xs text-fg-subtle">{t('design:ui.review.devices.provided')}</dt>
            <dd className="text-lg font-semibold text-fg-strong">{formatNumber(view.provided)}</dd>
          </div>
          <div className="rounded-lg bg-surface-subtle p-2.5">
            <dt className="text-xs text-fg-subtle">{t('design:ui.review.devices.added')}</dt>
            <dd className="text-lg font-semibold text-fg-strong">{formatNumber(view.added)}</dd>
          </div>
        </dl>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[18rem] text-sm">
            <thead className="text-xs text-fg-subtle">
              <tr className="border-b border-border">
                <th scope="col" className={`${cell} text-start font-medium`}>
                  {t('design:ui.review.devices.kind')}
                </th>
                <th scope="col" className={`${cell} text-end font-medium`}>
                  {t('design:ui.review.devices.provided')}
                </th>
                <th scope="col" className={`${cell} text-end font-medium`}>
                  {t('design:ui.review.devices.added')}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.devicesByKind.map((entry) => (
                <tr key={entry.kind} className="border-b border-border/60">
                  <th scope="row" className={`${cell} text-start font-normal text-fg`}>
                    {translate(entry.label)}
                  </th>
                  <td className={`${cell} text-end tabular-nums`}>{formatNumber(entry.provided)}</td>
                  <td className={`${cell} text-end tabular-nums`}>{formatNumber(entry.added)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReviewSection>
    </>
  )
}

export default ReviewQuotation

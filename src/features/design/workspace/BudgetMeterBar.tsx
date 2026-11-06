import { Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BudgetMeterView, BudgetTone } from '../model/BudgetMeter'

const toneStyles: Record<BudgetTone, { bar: string; text: string }> = {
  ok: { bar: 'bg-emerald-500', text: 'text-emerald-800' },
  near: { bar: 'bg-amber-500', text: 'text-amber-800' },
  over: { bar: 'bg-rose-600', text: 'text-rose-800' },
}

interface BudgetMeterBarProps {
  meter: BudgetMeterView
  /** Narrow form for the footer on small screens (no "left / over" line). */
  compact?: boolean
}

/** Cost of the learner's additions against the budget, coloured green / amber / red. */
function BudgetMeterBar({ meter, compact = false }: BudgetMeterBarProps) {
  const { t } = useTranslation('design')
  const price = (amount: number) => t('units.price', { amount })
  const style = toneStyles[meter.tone]
  const valueText = t('ui.budget.valueText', { cost: price(meter.cost), budget: price(meter.budget) })
  const status =
    meter.tone === 'over' ? t('ui.budget.over', { amount: price(meter.overBy) }) : t('ui.budget.left', { amount: price(meter.remaining) })

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1 font-medium text-slate-700">
          <Wallet className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          {t('ui.budget.label')}
        </span>
        <span className={`truncate font-semibold ${style.text}`}>{valueText}</span>
      </div>
      <div
        role="meter"
        aria-label={t('ui.budget.label')}
        aria-valuemin={0}
        aria-valuemax={meter.budget}
        aria-valuenow={Math.min(meter.cost, meter.budget)}
        aria-valuetext={t('ui.budget.ariaValue', { value: valueText, status })}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className={`h-full rounded-full transition-[width] duration-300 ${style.bar}`} style={{ width: `${meter.percent}%` }} />
      </div>
      {!compact && <p className={`text-xs ${style.text}`}>{status}</p>}
    </div>
  )
}

export default BudgetMeterBar

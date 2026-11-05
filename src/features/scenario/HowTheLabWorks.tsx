import { FolderOpen, SquareTerminal, Wrench, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNumberFormat } from '../layout/useNumberFormat'

type StepKey = 'open' | 'inspect' | 'verify'

const steps: { key: StepKey; icon: LucideIcon }[] = [
  { key: 'open', icon: FolderOpen },
  { key: 'inspect', icon: SquareTerminal },
  { key: 'verify', icon: Wrench },
]

/** "How the lab works" section of the start page: three numbered steps. */
function HowTheLabWorks() {
  const { t } = useTranslation('landing')
  const formatNumber = useNumberFormat()

  return (
    <section aria-labelledby="howTheLabWorksTitle" className="flex flex-col gap-4">
      <h2 id="howTheLabWorksTitle" className="text-lg font-semibold text-slate-900">
        {t('howItWorks.title')}
      </h2>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <li key={step.key} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-col">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                  {formatNumber(index + 1)}
                </span>
              </span>
              <div>
                <h3 className="font-medium text-slate-900">{t(`howItWorks.${step.key}.title`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{t(`howItWorks.${step.key}.text`)}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default HowTheLabWorks

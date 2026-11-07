import { ArrowLeft, CircleCheck, ClipboardCheck, FileText, FlaskConical, List, ListChecks, PencilRuler, TriangleAlert, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DesignReview } from '../../../design'
import type { DesignExercise, LabDocument } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import SiteHeader from '../../layout/SiteHeader'
import { useDocumentMeta } from '../../layout/useDocumentMeta'
import { useNumberFormat } from '../../layout/useNumberFormat'
import { focusRing } from '../../shared/focusRing'
import { designLabs } from '../model/DesignLabs'
import { DesignReviewView } from '../model/DesignReviewView'
import type { DesignSubmission } from '../workspace/DesignScreen'
import ReviewQuotation from './ReviewQuotation'
import ReviewReference from './ReviewReference'
import ReviewRequirementList from './ReviewRequirementList'
import ReviewSpofList from './ReviewSpofList'

export interface DesignReviewScreenProps {
  /** The brief in the active language. */
  brief: DesignExercise
  submission: DesignSubmission
  /** Copies a lab into a new free lab and opens the workspace; resolves false when that failed. */
  onOpenInLab: (doc: LabDocument) => Promise<boolean>
  /** Opens the handover pack of the submitted design. */
  onHandover: (doc: LabDocument) => void
  onBackToDesign: () => void
  onBackToList: () => void
}

const secondaryButton = `flex items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2.5 text-sm font-medium text-fg hover:bg-surface-subtle disabled:opacity-60 ${focusRing}`

/**
 * `/design/<id>/review`: the design review report (DesignReview) of the submitted design: score,
 * requirement results, quotation, device counts, single points of failure, hints and the reference
 * design with how to present it; the designs open in the lab, the handover pack prints.
 */
function DesignReviewScreen({ brief, submission, onOpenInLab, onHandover, onBackToDesign, onBackToList }: DesignReviewScreenProps) {
  const { t } = useTranslation('design')
  const formatNumber = useNumberFormat()
  const translate = useMessageTranslator()
  const [opening, setOpening] = useState<'idle' | 'busy' | 'failed'>('idle')
  useDocumentMeta(t('ui.review.pageTitle', { title: brief.texts.title }))

  // The submitted lab in the active language (customer device names, zones).
  const lab = useMemo(() => designLabs.relabel(submission.lab, submission.brief, brief), [brief, submission])
  const view = useMemo(() => DesignReviewView.build(new DesignReview(brief).analyze(lab.state)), [brief, lab])
  const price = (amount: number) => t('units.price', { amount })

  function open(doc: LabDocument) {
    setOpening('busy')
    onOpenInLab(doc).then(
      (opened) => setOpening(opened ? 'idle' : 'failed'),
      (error: unknown) => {
        console.error('Open in lab failed', error)
        setOpening('failed')
      },
    )
  }

  const summaryChips = [
    {
      key: 'cost',
      icon: Wallet,
      text: view.budget ? t('ui.review.chips.costOfBudget', { cost: price(view.cost.total), budget: price(view.budget.budget) }) : price(view.cost.total),
    },
    { key: 'added', icon: PencilRuler, text: t('ui.review.chips.added', { count: view.added, formatted: formatNumber(view.added) }) },
    {
      key: 'spof',
      icon: TriangleAlert,
      text: t('ui.review.chips.spof', { count: view.singlePointsOfFailure.length, formatted: formatNumber(view.singlePointsOfFailure.length) }),
    },
  ]

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">
        <section
          aria-labelledby="designReviewTitle"
          className={`flex flex-col items-center gap-3 rounded-3xl px-5 py-8 text-center text-white shadow-lg ${
            view.solved ? 'bg-gradient-to-br from-emerald-600 to-teal-700' : 'bg-gradient-to-br from-indigo-700 to-slate-900'
          }`}
        >
          <span className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white/15 ring-4 ring-white/30">
            <span className="text-2xl font-bold">{t('ui.review.percent', { percent: formatNumber(view.percent) })}</span>
          </span>
          <p className="text-sm font-medium uppercase tracking-wide text-white/80">{t('ui.review.kicker')}</p>
          <h1 id="designReviewTitle" className="text-2xl font-semibold sm:text-3xl">
            {brief.texts.title}
          </h1>
          <p className="flex items-center gap-1.5 text-white/90">
            {view.solved ? <CircleCheck className="h-4 w-4" aria-hidden="true" /> : <ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
            {translate(view.verdict)}
          </p>
          <p className="text-xs text-white/75">{translate(view.scoreText)}</p>
          <ul aria-label={t('ui.review.summaryAria')} className="flex flex-wrap justify-center gap-2 text-sm">
            {summaryChips.map((chip) => {
              const Icon = chip.icon
              return (
                <li key={chip.key} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {chip.text}
                </li>
              )
            })}
          </ul>
          {brief.texts.topics.length > 0 && (
            <ul aria-label={t('ui.list.topics')} className="flex flex-wrap justify-center gap-1.5">
              {brief.texts.topics.map((topic) => (
                <li key={topic} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-900">
                  {topic}
                </li>
              ))}
            </ul>
          )}
        </section>

        <ReviewRequirementList rows={view.requirements} />
        <ReviewQuotation view={view} />
        <ReviewSpofList rows={view.singlePointsOfFailure} />
        <ReviewReference hints={view.hints} hintsRevealed={view.hintsRevealed} reference={brief.texts.reference} />

        <section aria-labelledby="designReviewActions" className="flex flex-col gap-3 rounded-2xl border border-sky-200 dark:border-sky-800 bg-accent-muted p-4">
          <h2 id="designReviewActions" className="text-sm font-semibold text-sky-950 dark:text-sky-200">
            {t('ui.review.actions.title')}
          </h2>
          <p className="text-sm text-sky-900 dark:text-sky-200">{t('ui.review.actions.hint')}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={() => open(designLabs.reference(brief, t('ui.review.referenceLabTitle', { title: brief.texts.title })))} disabled={opening === 'busy'} className={secondaryButton}>
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              {t('ui.review.actions.openReference')}
            </button>
            <button type="button" onClick={() => open(designLabs.toFreeLab(lab, t('ui.review.myLabTitle', { title: brief.texts.title })))} disabled={opening === 'busy'} className={secondaryButton}>
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              {t('ui.review.actions.openMine')}
            </button>
            <button type="button" onClick={() => onHandover(lab)} className={secondaryButton}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              {t('ui.review.actions.handover')}
            </button>
          </div>
          {opening === 'failed' && (
            <p role="alert" className="text-sm text-rose-800 dark:text-rose-200">
              {t('ui.review.actions.openFailed')}
            </p>
          )}
        </section>

        <nav aria-label={t('ui.review.nav.aria')} className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          <button type="button" onClick={onBackToList} className={secondaryButton}>
            <List className="h-4 w-4" aria-hidden="true" />
            {t('ui.review.nav.backToList')}
          </button>
          <button
            type="button"
            onClick={onBackToDesign}
            className={`flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover ${focusRing}`}
          >
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            {t('ui.review.nav.backToDesign')}
          </button>
        </nav>
        <p className="flex items-center justify-center gap-1.5 text-xs text-fg-subtle">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          {t('ui.review.footnote')}
        </p>
      </main>
    </div>
  )
}

export default DesignReviewScreen

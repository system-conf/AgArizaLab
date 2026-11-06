import { ReactFlowProvider } from '@xyflow/react'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RequirementChecker, RequirementDescriber } from '../../../design'
import type { DesignExercise, LabDocument } from '../../../domain'
import { useLabDocument } from '../../../lab/useLabDocument'
import { routes } from '../../../routing'
import { ExerciseLockPolicy } from '../../../session/ExerciseLockPolicy'
import { useDocumentMeta } from '../../layout/useDocumentMeta'
import { useNumberFormat } from '../../layout/useNumberFormat'
import AppLink from '../../shared/AppLink'
import { focusRing } from '../../shared/focusRing'
import { useMediaQuery } from '../../shared/useMediaQuery'
import { useToasts } from '../../workspace/useToasts'
import WorkspaceView from '../../workspace/WorkspaceView'
import { BudgetMeter } from '../model/BudgetMeter'
import { designLabs } from '../model/DesignLabs'
import { RequirementChecklist } from '../model/RequirementChecklist'
import { useLiveRequirementCheck } from '../useLiveRequirementCheck'
import BriefPanel from './BriefPanel'
import BriefSheet from './BriefSheet'
import DesignFooter from './DesignFooter'
import { useDesignPalette } from './useDesignPalette'

/** A design in progress, with the (localized) brief it was made in (to relabel it in another language). */
export interface DesignDraft {
  lab: LabDocument
  brief: DesignExercise
}

/** A submitted design: what the review needs. */
export interface DesignSubmission extends DesignDraft {
  /** Every requirement (hidden ones included) held at submission. */
  solved: boolean
}

export interface DesignScreenProps {
  brief: DesignExercise
  total: number
  /** The learner's earlier design of this brief in this session, if any. */
  draft: DesignDraft | undefined
  onSubmit: (submission: DesignSubmission) => void
  /** Called with the current design when the screen closes (kept as the draft). */
  onLeave: (draft: DesignDraft) => void
}

/** From this width the brief is a side panel next to the canvas; below it is a bottom sheet. */
const SIDE_PANEL_QUERY = '(min-width: 1280px)'

/**
 * Design mode of the workspace: the customer's devices are placed and pinned (`placement` locks),
 * the palette offers the brief's models (with prices when there is a budget), the brief panel shows
 * the customer's message, the budget and the live checklist; "Submit design" opens the review.
 */
function DesignWorkspace({ brief, total, draft, onSubmit, onLeave }: DesignScreenProps) {
  const { t } = useTranslation('design')
  const formatNumber = useNumberFormat()
  const [initial] = useState(() => (draft ? designLabs.relabel(draft.lab, draft.brief, brief) : designLabs.open(brief)))
  const lab = useLabDocument(initial, { autosave: false })
  const toasts = useToasts()
  const policy = useMemo(() => new ExerciseLockPolicy(brief.locks, brief.lab.state.links), [brief])
  const checker = useMemo(() => new RequirementChecker(brief), [brief])
  const live = useLiveRequirementCheck(checker, lab.doc.state)
  const checklist = useMemo(() => {
    const describer = new RequirementDescriber(checker.groups)
    return RequirementChecklist.build(brief.requirements, live.results, (requirement) => describer.describe(brief.lab.state, requirement.condition))
  }, [brief, checker, live.results])
  const cost = useMemo(() => checker.inventory.totalCost(lab.doc.state), [checker, lab.doc.state])
  const budget = BudgetMeter.of(cost, brief.budget)
  const palette = useDesignPalette(brief)
  const sidePanelFits = useMediaQuery(SIDE_PANEL_QUERY)
  const [panelOpen, setPanelOpen] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [labelledWith, setLabelledWith] = useState(brief)
  const panelId = useId()
  useDocumentMeta(brief.texts.title)

  // Same brief in another language: relabel the open lab (and its undo steps) during render.
  if (labelledWith !== brief) {
    setLabelledWith(brief)
    lab.rewrite((doc) => designLabs.relabel(doc, labelledWith, brief))
  }

  // The design survives leaving the screen (review, back to the list) as the session's draft.
  const latest = useRef<{ draft: DesignDraft; onLeave: (draft: DesignDraft) => void }>({ draft: { lab: lab.doc, brief }, onLeave })
  useEffect(() => {
    latest.current = { draft: { lab: lab.doc, brief }, onLeave }
  })
  useEffect(() => () => latest.current.onLeave(latest.current.draft), [])

  function submit() {
    const solved = checker.check(lab.doc.state).every((result) => result.ok)
    onSubmit({ lab: lab.doc, brief, solved })
  }

  const briefPanel = <BriefPanel brief={brief} checklist={checklist} checking={live.checking} budget={budget} />

  const headerStart = (
    <>
      <AppLink
        to={routes.designs}
        aria-label={t('ui.workspace.backAria')}
        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        <span className="hidden sm:inline">{t('ui.workspace.back')}</span>
      </AppLink>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-indigo-700">
          {t('ui.workspace.position', { order: formatNumber(brief.order), total: formatNumber(total) })}
        </p>
        <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{brief.texts.title}</h1>
      </div>
    </>
  )

  return (
    <>
      <WorkspaceView
        lab={lab}
        policy={policy}
        toasts={toasts}
        headerStart={headerStart}
        paletteModels={palette.models}
        priceLabelOf={palette.priceLabelOf}
        sidePanel={
          sidePanelFits && panelOpen ? (
            <aside
              id={panelId}
              aria-label={t('ui.brief.title')}
              className="w-72 shrink-0 overflow-y-auto border-s border-slate-200 bg-slate-50 p-3 2xl:w-80"
            >
              {briefPanel}
            </aside>
          ) : undefined
        }
        footer={
          <DesignFooter
            checklist={checklist}
            budget={budget}
            briefOpen={sidePanelFits ? panelOpen : sheetOpen}
            briefControls={sidePanelFits ? panelId : undefined}
            onToggleBrief={() => (sidePanelFits ? setPanelOpen((open) => !open) : setSheetOpen((open) => !open))}
            onSubmit={submit}
          />
        }
        lockedNote={t('ui.workspace.pinned')}
      />
      {!sidePanelFits && sheetOpen && <BriefSheet onClose={() => setSheetOpen(false)}>{briefPanel}</BriefSheet>}
    </>
  )
}

/** Lazy-loaded design mode of `/design/<id>` (the design routes check the id first). */
function DesignScreen(props: DesignScreenProps) {
  return (
    <ReactFlowProvider key={props.brief.id}>
      <DesignWorkspace {...props} />
    </ReactFlowProvider>
  )
}

export default DesignScreen

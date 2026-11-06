import { ReactFlowProvider } from '@xyflow/react'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LabDocument } from '../../../domain'
import { useLabDocument } from '../../../lab/useLabDocument'
import { routes } from '../../../routing'
import { openSampleLab, SampleTextReader, type SampleDefinition } from '../../../samples'
import { ExerciseLockPolicy } from '../../../session/ExerciseLockPolicy'
import { useDocumentMeta } from '../../layout/useDocumentMeta'
import AppLink from '../../shared/AppLink'
import { focusRing } from '../../shared/focusRing'
import { useMediaQuery } from '../../shared/useMediaQuery'
import { useToasts } from '../../workspace/useToasts'
import WorkspaceView from '../../workspace/WorkspaceView'
import { LessonSteps } from '../model/LessonSteps'
import type { RelatedLinkView } from '../model/RelatedLinks'
import type { SampleProgressState } from '../useSampleProgress'
import { useStepCheck } from '../useStepCheck'
import LessonFooter from './LessonFooter'
import LessonPanel from './LessonPanel'
import LessonSheet from './LessonSheet'

export interface SampleScreenProps {
  sample: SampleDefinition
  progress: SampleProgressState
  related: readonly RelatedLinkView[]
  /** "Open as my own lab": stores the lab as a new lab and opens it in `/lab`; rejects when saving failed. */
  onSaveAsMine: (doc: LabDocument) => Promise<void>
}

/** From this width the lesson is a side panel next to the canvas; below it is a bottom sheet. */
const SIDE_PANEL_QUERY = '(min-width: 1280px)'

/**
 * A sample opened as a free, unlocked lab (`/samples/<id>`) with the lesson beside it. The lab is
 * not autosaved (the learner's `/lab` lab stays untouched; a reload opens a fresh sample); progress
 * is kept in the SampleProgressBook. Automatic steps are checked live on the lab (debounced).
 */
function SampleWorkspace({ sample, progress, related, onSaveAsMine }: SampleScreenProps) {
  const { t } = useTranslation('samples')
  const texts = useMemo(() => new SampleTextReader(t).texts(sample), [t, sample])
  const [initial] = useState(() => openSampleLab(sample, { title: texts.title }))
  const lab = useLabDocument(initial, { autosave: false })
  const toasts = useToasts()
  const live = useStepCheck(sample, lab.doc.state)
  const sidePanelFits = useMediaQuery(SIDE_PANEL_QUERY)
  const [panelOpen, setPanelOpen] = useState(true)
  // On a narrow screen the lesson opens with the sample; the learner closes it to work on the lab.
  const [sheetOpen, setSheetOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const panelId = useId()
  const { update } = progress
  useDocumentMeta(texts.title)

  // Passed automatic steps are recorded once; they stay done when the learner breaks the lab later.
  useEffect(() => {
    const statuses = live.statuses
    if (statuses) update((book) => book.withPassedSteps(sample, statuses, new Date()))
  }, [live.statuses, sample, update])

  const steps = LessonSteps.build(sample, live.statuses, progress.book)
  const completion = progress.book.completion(sample)

  function tick(stepId: string, done: boolean) {
    const now = new Date()
    update((book) => (done ? book.withStepsDone(sample, [stepId], now) : book.withStepUndone(sample, stepId, now)))
  }

  function resetLab() {
    lab.replace(openSampleLab(sample, { title: texts.title }))
    toasts.show(t('ui.lesson.resetLabDone'), 'info')
  }

  async function saveAsMine() {
    setSaving(true)
    try {
      await onSaveAsMine(lab.doc)
    } catch (error) {
      console.warn('The sample could not be saved as a new lab.', error)
      toasts.show(t('ui.lesson.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const lessonPanel = (
    <LessonPanel
      texts={texts}
      steps={steps}
      completion={completion}
      checking={live.checking}
      related={related}
      nameOf={(deviceId) => lab.doc.state.devices.find((device) => device.id === deviceId)?.name}
      onTick={tick}
      onResetProgress={() => update((book) => book.withReset(sample.id))}
    />
  )

  const headerStart = (
    <>
      <AppLink
        to={routes.samples}
        aria-label={t('ui.lesson.backAria')}
        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        <span className="hidden sm:inline">{t('ui.lesson.back')}</span>
      </AppLink>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-teal-700">{t(`categories.${sample.category}.title`)}</p>
        <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{texts.title}</h1>
      </div>
    </>
  )

  return (
    <>
      <WorkspaceView
        lab={lab}
        policy={ExerciseLockPolicy.none}
        toasts={toasts}
        headerStart={headerStart}
        sidePanel={
          sidePanelFits && panelOpen ? (
            <aside
              id={panelId}
              aria-label={t('ui.lesson.title')}
              className="w-80 shrink-0 overflow-y-auto border-s border-slate-200 bg-slate-50 p-3 2xl:w-96"
            >
              {lessonPanel}
            </aside>
          ) : undefined
        }
        footer={
          <LessonFooter
            completion={completion}
            lessonOpen={sidePanelFits ? panelOpen : sheetOpen}
            lessonControls={sidePanelFits ? panelId : undefined}
            saving={saving}
            onToggleLesson={() => (sidePanelFits ? setPanelOpen((open) => !open) : setSheetOpen((open) => !open))}
            onResetLab={resetLab}
            onSaveAsMine={() => void saveAsMine()}
          />
        }
      />
      {!sidePanelFits && sheetOpen && <LessonSheet onClose={() => setSheetOpen(false)}>{lessonPanel}</LessonSheet>}
    </>
  )
}

/** Lazy-loaded sample screen of `/samples/<id>` (the sample routes check the id first). */
function SampleScreen(props: SampleScreenProps) {
  return (
    <ReactFlowProvider key={props.sample.id}>
      <SampleWorkspace {...props} />
    </ReactFlowProvider>
  )
}

export default SampleScreen

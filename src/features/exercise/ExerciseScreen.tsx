import { ReactFlowProvider } from '@xyflow/react'
import { ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Exercise, LabDocument } from '../../domain'
import { useLabDocument } from '../../lab/useLabDocument'
import { routes } from '../../routing'
import { useLocalizedExercises } from '../../scenarios/useLocalizedExercises'
import { ExerciseAttempt } from '../../session/ExerciseAttempt'
import { exerciseLabs } from '../../session/ExerciseLabs'
import { ExerciseLockPolicy } from '../../session/ExerciseLockPolicy'
import { simWorkerClient } from '../../workers/SimWorkerClient'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import { useNumberFormat } from '../layout/useNumberFormat'
import ComplaintCard from '../scenario/ComplaintCard'
import GuideButton from '../scenario/GuideButton'
import SolveFooter from '../scenario/SolveFooter'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'
import { labEditor } from '../workspace/labServices'
import { useToasts } from '../workspace/useToasts'
import WorkspaceView from '../workspace/WorkspaceView'

/** A verified exercise: what the solution report and "Open in lab" need. */
export interface SolvedExercise {
  exerciseId: string
  guideStepsUsed: number
  /** The repaired lab at the moment of the successful verification. */
  lab: LabDocument
}

export interface ExerciseScreenProps {
  exerciseId: string
  onSolved: (solved: SolvedExercise) => void
}

/** Typing in the notes field is one undo step. */
const NOTES_EDIT = { coalesceKey: 'notes' }

interface ExerciseWorkspaceProps {
  exercise: Exercise
  total: number
  onSolved: (solved: SolvedExercise) => void
}

/**
 * Exercise mode of the workspace: the exercise opens as a locked lab (not autosaved); complaint
 * card, Guide button, notes and Verify. A language switch relabels device names in place.
 */
function ExerciseWorkspace({ exercise, total, onSolved }: ExerciseWorkspaceProps) {
  const { t } = useTranslation('exercise')
  const formatNumber = useNumberFormat()
  const [initial] = useState(() => exerciseLabs.open(exercise))
  const lab = useLabDocument(initial, { autosave: false })
  const toasts = useToasts()
  const policy = useMemo(() => new ExerciseLockPolicy(exercise.locks, exercise.lab.state.links), [exercise])
  const [attempt, setAttempt] = useState(() => ExerciseAttempt.start(exercise))
  const [checking, setChecking] = useState(false)
  const [labelledWith, setLabelledWith] = useState(exercise)
  useDocumentMeta(exercise.texts.title)

  // Same exercise in another language: relabel the open lab (and its undo steps) during render.
  if (labelledWith !== exercise) {
    setLabelledWith(exercise)
    lab.rewrite((doc) => exerciseLabs.relabel(doc, labelledWith, exercise))
  }

  /** Verification on the simulator; a large lab is checked in the Web Worker (small ones answer at once). */
  function verify() {
    const checked = lab.doc
    const guideStepsUsed = attempt.guideStepsRevealed
    setChecking(true)
    simWorkerClient
      .solve(checked.state, attempt.conditions)
      .then((results) => {
        setAttempt((current) => current.withCheck(results))
        if (results.every((result) => result.ok)) onSolved({ exerciseId: exercise.id, guideStepsUsed, lab: checked })
      })
      .catch((error: unknown) => console.error('Exercise verification failed', error))
      .finally(() => setChecking(false))
  }

  const headerStart = (
    <>
      <AppLink
        to={routes.exercises}
        aria-label={t('header.backAria')}
        className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${focusRing}`}
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
        <span className="hidden sm:inline">{t('header.back')}</span>
      </AppLink>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-sky-700">
          {t('header.position', { order: formatNumber(exercise.order), total: formatNumber(total) })}
        </p>
        <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{exercise.texts.title}</h1>
      </div>
    </>
  )

  return (
    <WorkspaceView
      lab={lab}
      policy={policy}
      toasts={toasts}
      headerStart={headerStart}
      headerEnd={
        <GuideButton
          steps={exercise.texts.guide}
          revealedCount={attempt.guideStepsRevealed}
          onReveal={() => setAttempt((current) => current.revealGuideStep())}
        />
      }
      banner={
        <section aria-label={t('mode.complaintRegion')} className="border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-4">
          <ComplaintCard from={exercise.texts.complaint.from} message={exercise.texts.complaint.message} />
        </section>
      }
      footer={
        <SolveFooter
          notes={lab.doc.notes}
          onNotesChange={(notes) => lab.apply((doc) => labEditor.setNotes(doc, notes), NOTES_EDIT)}
          onVerify={verify}
          checking={checking}
          failedChecks={attempt.failedChecks(lab.doc.state)}
        />
      }
      exerciseMode
      lockedNote={policy.topologyLocked ? t('mode.topologyLocked') : undefined}
    />
  )
}

/** Lazy-loaded entry of the `/exercises/<id>` route (the app checks the id first). */
function ExerciseScreen({ exerciseId, onSolved }: ExerciseScreenProps) {
  const exercises = useLocalizedExercises()
  const exercise = exercises.find((candidate) => candidate.id === exerciseId)
  if (!exercise) throw new Error(`Unknown exercise id: ${exerciseId}`)
  return (
    <ReactFlowProvider key={exercise.id}>
      <ExerciseWorkspace exercise={exercise} total={exercises.length} onSolved={onSolved} />
    </ReactFlowProvider>
  )
}

export default ExerciseScreen

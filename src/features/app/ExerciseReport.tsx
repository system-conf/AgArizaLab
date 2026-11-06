import type { ExerciseSummary } from '../../scenarios/exerciseSummaries'
import { exerciseLabs } from '../../session/ExerciseLabs'
import { routes, useAppRouter } from '../../routing'
import type { SolvedExercise } from '../exercise/ExerciseScreen'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import ResultScreen from '../result/ResultScreen'
import { loadLabLauncher } from '../shared/labLauncherLoader'

interface ExerciseReportProps {
  solved: SolvedExercise
  exercise: ExerciseSummary
  /** The following exercise, if any. */
  next: ExerciseSummary | undefined
}

/** `/exercises/<id>/report`: the solution report, with "Open in lab" for the repaired network. */
function ExerciseReport({ solved, exercise, next }: ExerciseReportProps) {
  const router = useAppRouter()
  const { texts } = exercise
  useDocumentMeta(texts.title)

  async function openInLab(): Promise<boolean> {
    const launcher = await loadLabLauncher()
    await launcher.saveLabAsNew(exerciseLabs.toFreeLab(solved.lab, texts.title))
    router.navigate(routes.lab)
    return true
  }

  return (
    <ResultScreen
      title={texts.title}
      explanation={texts.explanation}
      topics={texts.topics}
      guideStepsUsed={solved.guideStepsUsed}
      totalGuideSteps={texts.guide.length}
      onNext={next ? () => router.navigate(routes.exercise(next.id)) : undefined}
      onSolveAgain={() => router.navigate(routes.exercise(exercise.id))}
      onBackToList={() => router.navigate(routes.exercises)}
      onOpenInLab={openInLab}
    />
  )
}

export default ExerciseReport

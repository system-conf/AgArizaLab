import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { LabDocument } from '../../domain'
import { translateList, translateMessage } from '../../i18n'
import { AppRouteCodec, RouteResolver, routes, useAppRouter, type AppRoute } from '../../routing'
import { SampleCatalog, sampleDefinitions, SampleTextKeys, SampleTextReader } from '../../samples'
import { useExerciseSummaries } from '../../scenarios/exerciseSummaries'
import { loadLabLauncher } from '../shared/labLauncherLoader'
import SampleScreen from './lesson/SampleScreen'
import SampleListScreen from './list/SampleListScreen'
import { RelatedLinks, type RelatedLinkView } from './model/RelatedLinks'
import { SampleListModel } from './model/SampleListModel'
import { useSampleProgress } from './useSampleProgress'

/** The routes this module renders. */
export type SampleRoute = Extract<AppRoute, { name: 'samples' | 'sample' }>

export interface SampleRoutesProps {
  route: SampleRoute
}

/** Every sample this build can open (samples needing a missing feature are left out). */
const catalog = new SampleCatalog(sampleDefinitions)
const availableIds = catalog.available().map((sample) => sample.id)

/**
 * Lazy-loaded sample labs (`/samples`, `/samples/<id>`): the list and a sample opened as a free lab
 * with its lesson. Knows the available sample ids, so it resolves its own redirect (unknown or
 * unavailable sample → the list). Progress lives in localStorage (SampleProgressBook).
 */
function SampleRoutes({ route }: SampleRoutesProps) {
  const router = useAppRouter()
  const { t, i18n } = useTranslation(['samples', 'designBriefs'])
  const exercises = useExerciseSummaries()
  const progress = useSampleProgress()

  const decision = RouteResolver.resolve(route, { exerciseIds: [], reportExerciseId: null, hasShareHash: false, sampleIds: availableIds })
  const redirect = decision.kind === 'redirect' ? decision.to : null
  const redirectUrl = redirect ? AppRouteCodec.format(redirect) : null

  useEffect(() => {
    if (redirect) router.navigate(redirect, { replace: true })
    // redirectUrl identifies the redirect; the decision object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectUrl, router])

  const reader = useMemo(() => new SampleTextReader(t), [t])
  const listModel = useMemo(
    () =>
      SampleListModel.from(
        catalog,
        {
          title: (id) => reader.title(id),
          summary: (id) => reader.summary(id),
          topics: (id) => translateList(t, SampleTextKeys.topics(id)),
          categoryTitle: (category) => t(`samples:categories.${category}.title`),
          level: (level) => t(`samples:levels.${level}`),
          feature: (feature) => t(`samples:features.${feature}`),
        },
        progress.book,
      ),
    [reader, t, progress.book],
  )

  async function saveAsMine(doc: LabDocument): Promise<void> {
    const launcher = await loadLabLauncher()
    await launcher.saveLabAsNew(doc)
    router.navigate(routes.lab)
  }

  if (redirect) return null

  switch (route.name) {
    case 'samples':
      return <SampleListScreen model={listModel} />
    case 'sample': {
      const sample = catalog.find(route.sampleId)
      if (!sample) return null
      const related: RelatedLinkView[] = RelatedLinks.resolve(sample.related, {
        exercise: (exerciseId) => exercises.find((exercise) => exercise.id === exerciseId)?.texts.title,
        design: (briefId) => {
          const key = `designBriefs:${briefId}.title`
          return i18n.exists(key) ? translateMessage(t, { key }) : undefined
        },
        sample: (sampleId) => (catalog.find(sampleId) ? reader.title(sampleId) : undefined),
      })
      return <SampleScreen key={sample.id} sample={sample} progress={progress} related={related} onSaveAsMine={saveAsMine} />
    }
  }
}

export default SampleRoutes

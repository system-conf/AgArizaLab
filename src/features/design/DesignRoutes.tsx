import { useCallback, useEffect, useState } from 'react'
import type { LabDocument } from '../../domain'
import { AppRouteCodec, RouteResolver, routes, useAppRouter, type AppRoute } from '../../routing'
import { loadLabLauncher } from '../shared/labLauncherLoader'
import { DesignProgressStore } from './model/DesignProgressStore'
import HandoverOverlay from './handover/HandoverOverlay'
import { designListItems } from './list/designListItem'
import DesignListScreen from './list/DesignListScreen'
import DesignReviewScreen from './review/DesignReviewScreen'
import { useDesignBriefs } from './useDesignBriefs'
import DesignScreen, { type DesignDraft, type DesignSubmission } from './workspace/DesignScreen'

/** The routes this module renders. */
export type DesignRoute = Extract<AppRoute, { name: 'designs' | 'design' | 'designReview' }>

export interface DesignRoutesProps {
  route: DesignRoute
}

/**
 * Lazy-loaded design tasks (`/design`, `/design/<id>`, `/design/<id>/review`): the brief list, the
 * workspace in design mode and the review. Knows the brief ids, so it resolves its own redirects
 * (unknown brief → list, review without a submitted design → the brief). Drafts and the latest
 * submission live here for the session; progress (submitted / solved) in localStorage.
 */
function DesignRoutes({ route }: DesignRoutesProps) {
  const router = useAppRouter()
  const briefs = useDesignBriefs()
  const [progressStore] = useState(() => DesignProgressStore.fromBrowser())
  const [progress, setProgress] = useState(() => progressStore.read())
  const [drafts, setDrafts] = useState<Readonly<Record<string, DesignDraft>>>({})
  const [submission, setSubmission] = useState<{ briefId: string; design: DesignSubmission } | null>(null)
  const [handover, setHandover] = useState<LabDocument | null>(null)

  const decision = RouteResolver.resolve(route, {
    exerciseIds: [],
    reportExerciseId: null,
    hasShareHash: false,
    briefIds: briefs.map((brief) => brief.id),
    reviewBriefId: submission?.briefId ?? null,
  })
  const redirect = decision.kind === 'redirect' ? decision.to : null
  const redirectUrl = redirect ? AppRouteCodec.format(redirect) : null

  useEffect(() => {
    if (redirect) router.navigate(redirect, { replace: true })
    // redirectUrl identifies the redirect; the decision object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectUrl, router])

  const keepDraft = useCallback((briefId: string, draft: DesignDraft) => setDrafts((current) => ({ ...current, [briefId]: draft })), [])

  async function openInLab(doc: LabDocument): Promise<boolean> {
    const launcher = await loadLabLauncher()
    await launcher.saveLabAsNew(doc)
    router.navigate(routes.lab)
    return true
  }

  if (redirect) return null

  switch (route.name) {
    case 'designs':
      return (
        <DesignListScreen
          items={designListItems(briefs, progress)}
          onStart={(briefId) => router.navigate(routes.design(briefId))}
        />
      )
    case 'design': {
      const brief = briefs.find((candidate) => candidate.id === route.briefId)
      if (!brief) return null
      return (
        <DesignScreen
          key={brief.id}
          brief={brief}
          total={briefs.length}
          draft={drafts[brief.id]}
          onLeave={(draft) => keepDraft(brief.id, draft)}
          onSubmit={(design) => {
            setProgress(progressStore.recordSubmission(brief.id, design.solved))
            setSubmission({ briefId: brief.id, design })
            router.navigate(routes.designReview(brief.id))
          }}
        />
      )
    }
    case 'designReview': {
      const brief = briefs.find((candidate) => candidate.id === route.briefId)
      if (!brief || !submission) return null
      return (
        <>
          <DesignReviewScreen
            brief={brief}
            submission={submission.design}
            onOpenInLab={openInLab}
            onHandover={setHandover}
            onBackToDesign={() => router.navigate(routes.design(brief.id))}
            onBackToList={() => router.navigate(routes.designs)}
          />
          {handover && <HandoverOverlay source={handover} brief={brief} onClose={() => setHandover(null)} />}
        </>
      )
    }
  }
}

export default DesignRoutes

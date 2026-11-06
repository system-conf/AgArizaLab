import { ReactFlowProvider } from '@xyflow/react'
import { Network } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { routes } from '../../routing'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import AppLink from '../shared/AppLink'
import { focusRing } from '../shared/focusRing'
import FileMenu from './file/FileMenu'
import RecentLabsDialog from './file/RecentLabsDialog'
import { useLabFileActions } from './file/useLabFileActions'
import { useLabOpening } from './file/useLabOpening'
import { ExerciseLockPolicy, labEditor, useLabDocument } from './labServices'
import CommitField from './panels/CommitField'
import { useToasts } from './useToasts'
import WorkspaceView from './WorkspaceView'

export interface LabWorkspaceScreenProps {
  /** `#lab=…` the page was opened with, or null. */
  shareHash: string | null
  onShareHashUsed: () => void
}

/** The free lab (`/lab`): autosaved, with the File menu (new, recent, import, export, share). */
function LabWorkspace({ shareHash, onShareHashUsed }: LabWorkspaceScreenProps) {
  const { t } = useTranslation(['workspace', 'lab', 'common'])
  const lab = useLabDocument()
  const toasts = useToasts()
  useLabOpening({ lab, notify: toasts.show, shareHash, onShareHashUsed })
  const files = useLabFileActions(lab, toasts.show)
  const [recentOpen, setRecentOpen] = useState(false)
  const title = lab.doc.meta.title
  useDocumentMeta(title === '' ? t('workspace:title') : title)

  const headerStart = (
    <>
      <AppLink
        to={routes.landing}
        aria-label={t('workspace:header.home')}
        title={t('workspace:header.home')}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-50 ${focusRing}`}
      >
        <Network className="h-6 w-6" aria-hidden="true" />
      </AppLink>
      <CommitField
        label={t('workspace:header.titleLabel')}
        value={title}
        onCommit={(next) => lab.apply((doc) => labEditor.updateMeta(doc, { title: next.trim() }))}
        placeholder={t('lab:untitled')}
        hideLabel
        className="min-w-0 max-w-md flex-1"
      />
      <FileMenu actions={files} onOpenRecent={() => setRecentOpen(true)} />
    </>
  )

  return (
    <>
      <WorkspaceView lab={lab} policy={ExerciseLockPolicy.none} toasts={toasts} headerStart={headerStart} />
      {recentOpen && <RecentLabsDialog onOpen={files.openRecent} onClose={() => setRecentOpen(false)} />}
    </>
  )
}

/** Lazy-loaded entry of the `/lab` route. */
function LabWorkspaceScreen(props: LabWorkspaceScreenProps) {
  return (
    <ReactFlowProvider>
      <LabWorkspace {...props} />
    </ReactFlowProvider>
  )
}

export default LabWorkspaceScreen

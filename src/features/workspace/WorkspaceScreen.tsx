import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { LayoutGrid, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentMeta } from '../layout/useDocumentMeta'
import { focusRing } from '../shared/focusRing'
import { useMediaQuery } from '../shared/useMediaQuery'
import CableHint from './cable/CableHint'
import PortPicker from './cable/PortPicker'
import SsidPicker from './cable/SsidPicker'
import { useCableTool } from './cable/useCableTool'
import { AnnotationActionsContext, type AnnotationActions } from './canvas/annotationActions'
import CanvasToolbar from './canvas/CanvasToolbar'
import { EMPTY_SELECTION, type WorkspaceNode, type WorkspaceSelection } from './canvas/canvasTypes'
import { SelectionModel } from './canvas/SelectionModel'
import WorkspaceCanvas from './canvas/WorkspaceCanvas'
import type { WorkspaceCommand } from './keyboard/ShortcutResolver'
import { useWorkspaceKeyboard } from './keyboard/useWorkspaceKeyboard'
import { deviceCatalog, labEditor, useLabDocument } from './labServices'
import DevicePalette from './palette/DevicePalette'
import PropertiesPanel from './panels/PropertiesPanel'
import ShortcutsHelp from './panels/ShortcutsHelp'
import ToastRegion from './ToastRegion'
import { annotationIdOf } from './canvas/flowElements'
import { useRestoreAutosave } from './useRestoreAutosave'
import { useToasts } from './useToasts'
import { useWorkspaceActions } from './useWorkspaceActions'
import WorkspaceHeader from './WorkspaceHeader'

/** The lab builder: header, device palette, canvas with tools, properties panel. */
function WorkspaceView() {
  const { t } = useTranslation('workspace')
  useDocumentMeta(t('title'))
  const flow = useReactFlow<WorkspaceNode>()
  const lab = useLabDocument()
  useRestoreAutosave(lab)
  const { doc } = lab
  const canvasRef = useRef<HTMLDivElement>(null)
  const [rawSelection, setSelection] = useState<WorkspaceSelection>(EMPTY_SELECTION)
  const selection = useMemo(() => SelectionModel.prune(rawSelection, doc), [doc, rawSelection])
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const wide = useMediaQuery('(min-width: 1024px)')
  const toasts = useToasts()
  const cable = useCableTool({ lab, editor: labEditor, notify: toasts.show })
  const actions = useWorkspaceActions({ lab, editor: labEditor, selection, snapToGrid, canvasRef })
  const selectedCount = SelectionModel.count(selection)
  const nameOf = useCallback(
    (deviceId: string) => doc.state.devices.find((device) => device.id === deviceId)?.name ?? deviceId,
    [doc],
  )

  // A different lab was opened (autosave restore): show all of it.
  useEffect(() => {
    const frame = requestAnimationFrame(() => void flow.fitView({ padding: 0.3, maxZoom: 1.25 }))
    return () => cancelAnimationFrame(frame)
  }, [flow, lab.labId])

  const annotationActions = useMemo<AnnotationActions>(
    () => ({
      editingId,
      startEditing: setEditingId,
      commitText: (annotationId, text) => {
        // A late blur of another note's editor must not close the one just opened.
        setEditingId((current) => (current === annotationId ? null : current))
        actions.setNoteText(annotationId, text)
      },
      cancelEditing: () => setEditingId(null),
    }),
    [actions, editingId],
  )

  function addNote() {
    const id = actions.addNoteAtCentre()
    setSelection(SelectionModel.only('annotationIds', id))
    setEditingId(id)
  }

  function addModel(modelId: string) {
    actions.addModelAtCentre(modelId)
    setPaletteOpen(false)
  }

  function runCommand(command: WorkspaceCommand) {
    switch (command.kind) {
      case 'undo':
        return lab.undo()
      case 'redo':
        return lab.redo()
      case 'delete':
        return selectedCount > 0 ? actions.deleteSelection() : undefined
      case 'escape':
        if (shortcutsOpen) return setShortcutsOpen(false)
        if (cable.state.active) return cable.back()
        return setSelection(EMPTY_SELECTION)
      case 'cableTool':
        return cable.state.active ? cable.stop() : cable.choose('auto')
      case 'selectAll':
        return setSelection(SelectionModel.all(doc))
      case 'showShortcuts':
        return setShortcutsOpen((open) => !open)
      case 'nudge':
        return selectedCount > 0 ? actions.nudge(command.dx, command.dy) : undefined
    }
  }

  useWorkspaceKeyboard(
    {
      run: runCommand,
      activateNode: (nodeId) => {
        const annotationId = annotationIdOf(nodeId)
        if (annotationId !== null) setEditingId(annotationId)
        else if (cable.state.active) cable.clickDevice(nodeId)
      },
    },
    snapToGrid,
  )

  const menu = cable.state.portMenu
  const menuDevice = menu ? doc.state.devices.find((device) => device.id === menu.deviceId) : undefined
  const step = cable.state.step

  const properties = (onClose?: () => void) => (
    <PropertiesPanel
      doc={doc}
      selection={selection}
      onRename={actions.rename}
      onDisconnect={(linkId) => lab.apply((current) => labEditor.disconnect(current, linkId))}
      onAnnotationChange={(annotation) => lab.apply((current) => labEditor.updateAnnotation(current, annotation))}
      onNoteText={actions.setNoteText}
      onDeleteSelection={actions.deleteSelection}
      onNotes={actions.setNotes}
      onClose={onClose}
    />
  )

  return (
    <div className="flex h-dvh flex-col bg-slate-100 text-slate-900">
      <WorkspaceHeader
        title={doc.meta.title}
        onTitle={actions.setTitle}
        canUndo={lab.canUndo}
        canRedo={lab.canRedo}
        onUndo={lab.undo}
        onRedo={lab.redo}
        shortcutsOpen={shortcutsOpen}
        onToggleShortcuts={() => setShortcutsOpen((open) => !open)}
      />
      <div className="relative flex min-h-0 flex-1">
        <aside aria-labelledby="palette-heading" className="hidden w-56 shrink-0 overflow-y-auto border-e border-slate-200 bg-white p-3 md:block">
          <h2 id="palette-heading" className="mb-2 text-sm font-semibold text-slate-900">
            {t('palette.title')}
          </h2>
          <DevicePalette models={deviceCatalog} onAdd={addModel} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <CanvasToolbar
            activeTool={cable.state.tool}
            onSelectTool={cable.stop}
            onChooseCable={cable.choose}
            onAddNote={addNote}
            canDelete={selectedCount > 0}
            onDelete={actions.deleteSelection}
            snapToGrid={snapToGrid}
            onToggleSnap={() => setSnapToGrid((snap) => !snap)}
            canAlign={selection.deviceIds.length + selection.annotationIds.length > 1}
            onAlign={actions.align}
          />
          <div className="relative min-h-0 flex-1">
            <AnnotationActionsContext.Provider value={annotationActions}>
              <WorkspaceCanvas
                doc={doc}
                selection={selection}
                onSelectionChange={setSelection}
                onCommitMoves={actions.commitMoves}
                onDropModel={actions.addModelAt}
                onDeviceClick={(deviceId) => {
                  if (cable.state.active) cable.clickDevice(deviceId)
                }}
                cableActive={cable.state.active}
                cableHighlight={cable.highlightOf}
                snapToGrid={snapToGrid}
                screenToFlow={flow.screenToFlowPosition}
                canvasRef={canvasRef}
              >
                <CableHint state={cable.state} nameOf={nameOf} />
                {menu && menuDevice && (
                  <PortPicker
                    device={menuDevice}
                    end={menu.end}
                    options={cable.portOptions}
                    nameOf={nameOf}
                    onPick={cable.pickPort}
                    onClose={cable.back}
                  />
                )}
                {step.kind === 'ssid' && (
                  <SsidPicker nodeId={step.second.deviceId} options={step.options} onSubmit={cable.submitSsid} onCancel={cable.back} />
                )}
              </WorkspaceCanvas>
            </AnnotationActionsContext.Provider>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className={`absolute bottom-3 start-3 z-20 flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-sky-700 md:hidden ${focusRing}`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              {t('palette.open')}
            </button>
            <ToastRegion toasts={toasts.toasts} onDismiss={toasts.dismiss} />
          </div>
        </main>
        {wide && <aside className="w-72 shrink-0 border-s border-slate-200 bg-white">{properties()}</aside>}
        {!wide && selectedCount > 0 && !paletteOpen && (
          <div className="absolute inset-x-0 bottom-0 z-30 h-[45vh] overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl">
            {properties(() => setSelection(EMPTY_SELECTION))}
          </div>
        )}
        {paletteOpen && (
          <div
            role="dialog"
            aria-labelledby="palette-drawer-heading"
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              setPaletteOpen(false)
            }}
            className="absolute inset-x-0 bottom-0 z-40 max-h-[65vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-3 shadow-2xl md:hidden"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 id="palette-drawer-heading" className="text-sm font-semibold text-slate-900">
                {t('palette.title')}
              </h2>
              <button
                type="button"
                // The drawer was opened on purpose; its close button takes the focus.
                autoFocus
                onClick={() => setPaletteOpen(false)}
                aria-label={t('palette.close')}
                className={`rounded p-1 text-slate-500 hover:bg-slate-100 ${focusRing}`}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <DevicePalette models={deviceCatalog} onAdd={addModel} />
          </div>
        )}
        {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      </div>
    </div>
  )
}

/** Workspace screen (`?view=workspace` until I2 wires the real navigation). */
function WorkspaceScreen() {
  return (
    <ReactFlowProvider>
      <WorkspaceView />
    </ReactFlowProvider>
  )
}

export default WorkspaceScreen

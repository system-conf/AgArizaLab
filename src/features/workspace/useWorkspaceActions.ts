import { useReactFlow } from '@xyflow/react'
import { useCallback, useMemo, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { CanvasPoint, DeviceKindV2, LabDocument } from '../../domain/v2'
import type { WorkspaceNode, WorkspaceSelection } from './canvas/canvasTypes'
import { annotationNodeId } from './canvas/flowElements'
import { AlignCalculator, type AlignMode, type PlacedItem } from './geometry/AlignCalculator'
import { PlacementFinder } from './geometry/PlacementFinder'
import { findDeviceModel, PortFactory, type LabDocumentState, type LabEditor } from './labServices'
import { WorkspaceOperations, type NodeMove } from './WorkspaceOperations'
import { DEVICE_NODE_SIZE, GRID_SIZE, NOTE_SIZE } from './workspaceConstants'

export interface WorkspaceActions {
  /** Adds a device of the model with its icon centred on `point` (flow coordinates). */
  addModelAt: (modelId: string, point: CanvasPoint) => void
  /** Adds a device in the middle of the visible canvas (palette click, touch). */
  addModelAtCentre: (modelId: string) => void
  /** Adds a text note in the middle of the visible canvas; returns its id (to start editing). */
  addNoteAtCentre: () => string
  deleteSelection: () => void
  align: (mode: AlignMode) => void
  nudge: (dx: number, dy: number) => void
  /** Commits finished moves; moves with the same `coalesceKey` in a row form one undo step. */
  commitMoves: (moves: readonly NodeMove[], coalesceKey?: string) => void
  rename: (deviceId: string, name: string) => void
  setTitle: (title: string) => void
  setNotes: (notes: string) => void
  setNoteText: (annotationId: string, text: string) => void
}

interface ActionsInput {
  lab: LabDocumentState
  editor: LabEditor
  selection: WorkspaceSelection
  snapToGrid: boolean
  /** The canvas element, for "middle of the visible canvas". */
  canvasRef: RefObject<HTMLElement | null>
}

const calculator = new AlignCalculator(GRID_SIZE)
const placement = new PlacementFinder(DEVICE_NODE_SIZE + GRID_SIZE)

/** Trailing number of a device id ('router3' → 3), used for the default device name. */
function numberOf(id: string, fallback: number): number {
  const match = /(\d+)$/.exec(id)
  return match ? Number(match[1]) : fallback
}

/** Every editing action of the workspace UI; each one is a single undo step. */
export function useWorkspaceActions({ lab, editor, selection, snapToGrid, canvasRef }: ActionsInput): WorkspaceActions {
  const { t } = useTranslation('workspace')
  const flow = useReactFlow<WorkspaceNode>()
  const operations = useMemo(() => new WorkspaceOperations(editor), [editor])
  const { apply } = lab

  const visibleCentre = useCallback((): CanvasPoint => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return flow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  }, [canvasRef, flow])

  const defaultName = useCallback(
    (kind: DeviceKindV2, id: string, doc: LabDocument) => {
      const sameKind = doc.state.devices.filter((device) => device.kind === kind).length
      return t('deviceName', { kind: t(`deviceKinds.${kind}`), number: numberOf(id, sameKind + 1) })
    },
    [t],
  )

  const addModelAt = useCallback(
    (modelId: string, point: CanvasPoint) => {
      const model = findDeviceModel(modelId)
      if (!model) {
        console.warn(`Unknown device model '${modelId}' dropped on the canvas`)
        return
      }
      apply((doc) => {
        const id = editor.nextDeviceId(doc, model.kind)
        const device = PortFactory.createDevice(model, id, defaultName(model.kind, id, doc))
        const topLeft = { x: point.x - DEVICE_NODE_SIZE / 2, y: point.y - DEVICE_NODE_SIZE / 2 }
        const wanted = snapToGrid ? calculator.snap(topLeft) : topLeft
        return editor.addDevice(doc, device, placement.find(wanted, Object.values(doc.layout.devices)))
      })
    },
    [apply, defaultName, editor, snapToGrid],
  )

  /** Current position and size of every selected node, as React Flow measured them. */
  const selectedItems = useCallback((): PlacedItem[] => {
    const nodeIds = new Set([...selection.deviceIds, ...selection.annotationIds.map(annotationNodeId)])
    return flow
      .getNodes()
      .filter((node) => nodeIds.has(node.id))
      .map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width ?? (node.type === 'device' ? DEVICE_NODE_SIZE : NOTE_SIZE.width),
        height: node.measured?.height ?? (node.type === 'device' ? DEVICE_NODE_SIZE : NOTE_SIZE.height),
      }))
  }, [flow, selection])

  const commitMoves = useCallback(
    (moves: readonly NodeMove[], coalesceKey?: string) => {
      if (moves.length === 0) return
      apply((doc) => operations.move(doc, moves), coalesceKey === undefined ? undefined : { coalesceKey })
    },
    [apply, operations],
  )

  const addNoteAtCentre = useCallback(() => {
    const centre = visibleCentre()
    const at = { x: centre.x - NOTE_SIZE.width / 2, y: centre.y - NOTE_SIZE.height / 2 }
    const id = editor.nextAnnotationId(lab.doc)
    apply((doc) => {
      const taken = doc.annotations.flatMap((annotation) => (annotation.type === 'line' ? [] : [annotation.at]))
      const spot = placement.find(snapToGrid ? calculator.snap(at) : at, taken)
      return operations.addNote(doc, id, spot, t('annotation.defaultText'))
    })
    return id
  }, [apply, editor, lab.doc, operations, snapToGrid, t, visibleCentre])

  const selectionKey = [...selection.deviceIds, ...selection.annotationIds].join(',')

  return {
    addModelAt,
    addModelAtCentre: useCallback((modelId: string) => addModelAt(modelId, visibleCentre()), [addModelAt, visibleCentre]),
    addNoteAtCentre,
    deleteSelection: useCallback(() => apply((doc) => operations.deleteSelection(doc, selection)), [apply, operations, selection]),
    align: useCallback(
      (mode: AlignMode) => commitMoves(calculator.align(selectedItems(), mode).map((move) => ({ nodeId: move.id, to: move.to }))),
      [commitMoves, selectedItems],
    ),
    // Holding an arrow key: one undo step per selection, not one per key repeat.
    nudge: useCallback(
      (dx: number, dy: number) =>
        commitMoves(
          calculator.nudge(selectedItems(), dx, dy).map((move) => ({ nodeId: move.id, to: move.to })),
          `nudge:${selectionKey}`,
        ),
      [commitMoves, selectedItems, selectionKey],
    ),
    commitMoves,
    rename: useCallback(
      (deviceId: string, name: string) => {
        const trimmed = name.trim()
        if (trimmed !== '') apply((doc) => editor.renameDevice(doc, deviceId, trimmed))
      },
      [apply, editor],
    ),
    setTitle: useCallback((title: string) => apply((doc) => editor.updateMeta(doc, { title: title.trim() })), [apply, editor]),
    setNotes: useCallback((notes: string) => apply((doc) => editor.setNotes(doc, notes)), [apply, editor]),
    setNoteText: useCallback(
      (annotationId: string, text: string) => apply((doc) => operations.setNoteText(doc, annotationId, text)),
      [apply, operations],
    ),
  }
}

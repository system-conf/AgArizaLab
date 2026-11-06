import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  type EdgeChange,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useMemo, useState, type DragEvent, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { CanvasPoint, LabDocument } from '../../../domain'
import { useMessageTranslator } from '../../../i18n'
import { useMapAriaLabels } from './mapLabels'
import { findDeviceModel, linkLightOf } from '../labServices'
import type { NodeMove } from '../WorkspaceOperations'
import { GRID_SIZE, MODEL_DRAG_TYPE } from '../workspaceConstants'
import AnnotationNodeView from './AnnotationNodeView'
import type { CableHighlight, LinkFlowEdge, WorkspaceNode, WorkspaceSelection } from './canvasTypes'
import { annotationText, buildEdges, buildNodes, type FlowLabels, type MeasuredSizes } from './flowElements'
import { SelectionModel } from './SelectionModel'
import WorkspaceDeviceNode from './WorkspaceDeviceNode'
import WorkspaceLinkEdge from './WorkspaceLinkEdge'

interface WorkspaceCanvasProps {
  doc: LabDocument
  selection: WorkspaceSelection
  onSelectionChange: (update: (selection: WorkspaceSelection) => WorkspaceSelection) => void
  /** Finished drags and keyboard moves; same `coalesceKey` in a row = one undo step. */
  onCommitMoves: (moves: readonly NodeMove[], coalesceKey?: string) => void
  /** A palette model was dropped at `point` (flow coordinates). */
  onDropModel: (modelId: string, point: CanvasPoint) => void
  onDeviceClick: (deviceId: string) => void
  cableActive: boolean
  cableHighlight: (deviceId: string) => CableHighlight
  snapToGrid: boolean
  /** false: devices cannot be dragged (exercise with a locked topology). */
  devicesDraggable: boolean
  screenToFlow: (point: CanvasPoint) => CanvasPoint
  canvasRef: RefObject<HTMLDivElement | null>
  /** Overlays inside the flow (cable hint, port picker). */
  children?: ReactNode
}

const nodeTypes = { device: WorkspaceDeviceNode, annotation: AnnotationNodeView }
const edgeTypes = { link: WorkspaceLinkEdge }
const snapGrid: [number, number] = [GRID_SIZE, GRID_SIZE]
const fitViewOptions = { padding: 0.3, maxZoom: 1.25 }
const selectionKey = 'Shift'
const multiSelectionKeys = ['Shift', 'Meta', 'Control']

/** The lab canvas (React Flow, controlled): devices, cables, notes; drop target of the palette. */
function WorkspaceCanvas({
  doc,
  selection,
  onSelectionChange,
  onCommitMoves,
  onDropModel,
  onDeviceClick,
  cableActive,
  cableHighlight,
  snapToGrid,
  devicesDraggable,
  screenToFlow,
  canvasRef,
  children,
}: WorkspaceCanvasProps) {
  const { t } = useTranslation('workspace')
  const translate = useMessageTranslator()
  const ariaLabels = useMapAriaLabels()
  const [measured, setMeasured] = useState<MeasuredSizes>({})
  const [dragPositions, setDragPositions] = useState<Readonly<Record<string, CanvasPoint>>>({})

  const labels = useMemo<FlowLabels>(
    () => ({
      device: (device) => (device.powered ? device.name : t('canvas.deviceOff', { name: device.name })),
      modelName: (device) => {
        const model = findDeviceModel(device.modelId)
        return model ? translate({ key: model.nameKey }) : device.modelId
      },
      annotation: (annotation) =>
        t('annotation.label', { text: annotationText(annotation) }),
      link: (link, a, b) => t('canvas.link', { cable: t(`cableTools.${link.cable}`), a: a.name, b: b.name }),
    }),
    [t, translate],
  )

  const nodes = buildNodes({ doc, selection, dragPositions, measured, labels, cableHighlight, devicesDraggable })
  const edges = useMemo(
    () => buildEdges(doc, selection, (link) => linkLightOf(doc.state, link.id), labels),
    [doc, labels, selection],
  )

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkspaceNode>[]) => {
      const sizes: Record<string, { width: number; height: number }> = {}
      const dragging: Record<string, CanvasPoint> = {}
      const finished: NodeMove[] = []
      let fromKeyboard = false
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions) sizes[change.id] = change.dimensions
        else if (change.type === 'select') onSelectionChange((current) => SelectionModel.node(current, change.id, change.selected))
        else if (change.type === 'position' && change.position) {
          if (change.dragging) dragging[change.id] = change.position
          else {
            finished.push({ nodeId: change.id, to: change.position })
            // Arrow keys on a focused node move it without a drag before.
            if (dragPositions[change.id] === undefined) fromKeyboard = true
          }
        }
      }
      if (Object.keys(sizes).length > 0) setMeasured((current) => ({ ...current, ...sizes }))
      if (Object.keys(dragging).length > 0) setDragPositions((current) => ({ ...current, ...dragging }))
      if (finished.length > 0) {
        const ids = finished.map((move) => move.nodeId)
        onCommitMoves(finished, fromKeyboard ? `nudge:${ids.join(',')}` : undefined)
        setDragPositions((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))))
      }
    },
    [dragPositions, onCommitMoves, onSelectionChange],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<LinkFlowEdge>[]) => {
      for (const change of changes) {
        if (change.type === 'select') onSelectionChange((current) => SelectionModel.link(current, change.id, change.selected))
      }
    },
    [onSelectionChange],
  )

  const handleNodeClick: NodeMouseHandler<WorkspaceNode> = (_event, node) => {
    if (node.type === 'device') onDeviceClick(node.id)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(MODEL_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const modelId = event.dataTransfer.getData(MODEL_DRAG_TYPE)
    if (modelId === '') return
    event.preventDefault()
    onDropModel(modelId, screenToFlow({ x: event.clientX, y: event.clientY }))
  }

  return (
    <div
      ref={canvasRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative h-full w-full bg-slate-50 ${cableActive ? '[&_.react-flow__node-device]:cursor-crosshair' : ''}`}
      role="group"
      aria-label={t('canvas.label')}
    >
      <ReactFlow<WorkspaceNode, LinkFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.2}
        maxZoom={2.5}
        snapToGrid={snapToGrid}
        snapGrid={snapGrid}
        nodesConnectable={false}
        elementsSelectable={!cableActive}
        deleteKeyCode={null}
        selectionKeyCode={selectionKey}
        multiSelectionKeyCode={multiSelectionKeys}
        zoomOnDoubleClick={false}
        ariaLabelConfig={ariaLabels}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_SIZE} size={1.5} color="#cbd5e1" />
        {/* Hidden while cabling: the port picker opens beside devices and must not sit under it. */}
        {!cableActive && (
          <MiniMap className="hidden md:block" position="bottom-right" pannable zoomable nodeColor="#cbd5e1" nodeStrokeColor="#64748b" />
        )}
        {children}
      </ReactFlow>
      {doc.state.devices.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto max-w-xs px-4 text-center text-sm text-slate-500">
          {t('canvas.empty')}
        </p>
      )}
    </div>
  )
}

export default WorkspaceCanvas

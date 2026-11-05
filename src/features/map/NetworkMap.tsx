import { Background, ReactFlow, type CoordinateExtent, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useMemo, useState } from 'react'
import type { PacketTrace } from '../../domain/EngineContract'
import type { MapPosition, NetworkState } from '../../domain/NetworkTypes'
import { networkEngine } from '../../engine'
import DeviceNode from './DeviceNode'
import { buildEdges, buildNodes, type MeasuredSizes } from './flowElements'
import LinkEdge from './LinkEdge'
import MapControls from './MapControls'
import { mapAriaLabels } from './mapLabels'
import type { DeviceFlowNode } from './mapTypes'
import PacketOverlay from './PacketOverlay'
import { usePacketAnimation } from './usePacketAnimation'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import type { FullscreenControls } from './useFullscreen'

interface NetworkMapProps {
  state: NetworkState
  selectedDeviceId: string | null
  onSelect: (deviceId: string) => void
  /** Drawn position of a device (dragged or scenario position). */
  positionOf: (deviceId: string) => MapPosition
  onMoveDevice: (deviceId: string, position: MapPosition) => void
  canResetLayout: boolean
  onResetLayout: () => void
  /** Latest ping route; a new object starts the packet animation. */
  trace: PacketTrace | null
  fullscreen: FullscreenControls
}

const nodeTypes = { device: DeviceNode }
const edgeTypes = { link: LinkEdge }
/** Node position = icon centre, so links and the packet line up with it. */
const nodeOrigin: [number, number] = [0.5, 0.5]
/** Scenario grid is 0..1000 x 0..600; devices may be dragged a little beyond it. */
const nodeExtent: CoordinateExtent = [[-200, -150], [1200, 750]]
const fitViewOptions = { padding: 0.2 }

/** Zoomable, pannable network map (React Flow). Dragging devices changes only the drawing. */
function NetworkMap({
  state,
  selectedDeviceId,
  onSelect,
  positionOf,
  onMoveDevice,
  canResetLayout,
  onResetLayout,
  trace,
  fullscreen,
}: NetworkMapProps) {
  const [measured, setMeasured] = useState<MeasuredSizes>({})
  const reducedMotion = usePrefersReducedMotion()
  const frame = usePacketAnimation(trace, positionOf, reducedMotion)
  const nodes = buildNodes(state, positionOf, selectedDeviceId, measured)
  const edges = useMemo(() => buildEdges(state, networkEngine), [state])

  const handleNodesChange = useCallback(
    (changes: NodeChange<DeviceFlowNode>[]) => {
      const sizes: Record<string, { width: number; height: number }> = {}
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions) sizes[change.id] = change.dimensions
        else if (change.type === 'position' && change.position) onMoveDevice(change.id, change.position)
        else if (change.type === 'select' && change.selected) onSelect(change.id)
      }
      if (Object.keys(sizes).length > 0) setMeasured((current) => ({ ...current, ...sizes }))
    },
    [onMoveDevice, onSelect],
  )

  return (
    <div
      className="h-[55vh] min-h-80 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 md:h-full md:min-h-96"
      role="group"
      aria-label="Ağ haritası"
    >
      <ReactFlow<DeviceFlowNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onNodeClick={(_event, node) => onSelect(node.id)}
        nodeOrigin={nodeOrigin}
        nodeExtent={nodeExtent}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.3}
        maxZoom={2.5}
        nodesConnectable={false}
        edgesFocusable={false}
        elevateNodesOnSelect={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        zoomOnDoubleClick={false}
        ariaLabelConfig={mapAriaLabels}
      >
        <Background gap={24} color="#e2e8f0" />
        <MapControls fullscreen={fullscreen} canResetLayout={canResetLayout} onResetLayout={onResetLayout} />
        <PacketOverlay frame={frame} />
      </ReactFlow>
    </div>
  )
}

export default NetworkMap

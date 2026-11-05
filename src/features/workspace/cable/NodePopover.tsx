import { NodeToolbar, Position } from '@xyflow/react'
import type { ReactNode } from 'react'
import { useMediaQuery } from '../../shared/useMediaQuery'

interface NodePopoverProps {
  /** Device node the popover belongs to. */
  nodeId: string
  /** Accessible name of the dialog. */
  label: string
  children: ReactNode
}

/**
 * A small dialog attached to a device: beside the node on wide screens (follows pan and zoom),
 * a bottom sheet on phones where there is no room next to the node.
 */
function NodePopover({ nodeId, label, children }: NodePopoverProps) {
  const wide = useMediaQuery('(min-width: 768px)')
  const panel = (
    <div
      role="dialog"
      aria-label={label}
      className="nodrag nowheel nopan max-h-[60vh] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg md:w-72"
    >
      {children}
    </div>
  )
  if (wide) {
    return (
      <NodeToolbar nodeId={nodeId} isVisible position={Position.Right} offset={16}>
        {panel}
      </NodeToolbar>
    )
  }
  return <div className="fixed inset-x-0 bottom-0 z-40 p-2">{panel}</div>
}

export default NodePopover

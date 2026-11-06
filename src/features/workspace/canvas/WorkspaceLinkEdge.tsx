import { getStraightPath, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import LinkEdge from './LinkEdge'
import type { LinkFlowEdge } from './canvasTypes'

/**
 * A cable on the workspace: LinkEdge (port labels at both ends, link lights,
 * dashed wireless) plus a sky halo while the cable is selected.
 */
function WorkspaceLinkEdge(props: EdgeProps<LinkFlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, selected } = props
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  return (
    <>
      {selected && <path d={path} fill="none" stroke="#7dd3fc" strokeWidth={10} strokeLinecap="round" opacity={0.8} />}
      <LinkEdge {...props} />
    </>
  )
}

export default memo(WorkspaceLinkEdge)

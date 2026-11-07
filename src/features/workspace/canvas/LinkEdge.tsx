import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePreference } from '../../../preferences'
import { portLabelClassName } from '../../preferences/model/preferenceWiring'
import type { LinkFlowEdge, SwitchEnd } from './canvasTypes'

/** Distance from the switch centre (flow px) of the link light and the port label. */
const ledDistance = 34
const labelDistance = 66

interface Point {
  x: number
  y: number
}

/** Point `distance` px from `from` towards `to`, never past 40 % of the line. */
function pointAlong(from: Point, to: Point, distance: number): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length === 0) return from
  const fraction = Math.min(distance / length, 0.4)
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction }
}

/**
 * One cable or wireless association. Line style shows only plugged / wireless; the LED at a
 * switch end shows the physical link light. Nothing here reflects IP, VLAN or DNS health.
 */
function LinkEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<LinkFlowEdge>) {
  const { t } = useTranslation('map')
  // PU (Preferences → Map): port labels always / on hover / never, link lights on or off.
  const [portLabels] = usePreference('map.portLabels')
  const [linkLights] = usePreference('map.linkLights')
  const labelClass = portLabelClassName(portLabels)
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  if (!data) return null
  const { link, light, wireless, switchEnds } = data
  const source = { x: sourceX, y: sourceY }
  const target = { x: targetX, y: targetY }
  const stroke = link.connected ? 'var(--color-cable)' : 'var(--color-cable-unplugged)'
  const dash = wireless ? '8 6' : link.connected ? undefined : '2 6'

  function renderSwitchEnd(end: SwitchEnd) {
    const from = end.side === 'source' ? source : target
    const to = end.side === 'source' ? target : source
    const led = pointAlong(from, to, ledDistance)
    const label = pointAlong(from, to, labelDistance)
    const up = light === 'up'
    return (
      <g key={end.side}>
        {linkLights && (
          <circle cx={led.x} cy={led.y} r={5} fill={up ? 'var(--color-link-up)' : 'var(--color-link-down)'} stroke="var(--color-canvas)" strokeWidth={2}>
            <title>{up ? t('edge.linkLightUp', { port: end.portId }) : t('edge.linkLightDown', { port: end.portId })}</title>
          </circle>
        )}
        {labelClass !== null && (
          <text
            className={labelClass}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fill="var(--color-port-label)"
            stroke="var(--color-port-label-halo)"
            strokeWidth={4}
            paintOrder="stroke"
          >
            {end.portId}
          </text>
        )}
      </g>
    )
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke, strokeWidth: 2.5, strokeDasharray: dash, strokeLinecap: 'round' }}
      />
      {switchEnds.map(renderSwitchEnd)}
      {!link.connected && (
        <title>{t('edge.unplugged')}</title>
      )}
    </>
  )
}

export default memo(LinkEdge)

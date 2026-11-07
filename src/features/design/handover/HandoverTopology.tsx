import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceKindIcon } from '../../../catalog'
import type { HandoverSource } from '../../../design'
import { TopologySketch } from './TopologySketch'

interface HandoverTopologyProps {
  source: HandoverSource
}

const ICON_SIZE = 28

/** The topology picture of the handover pack: zones, cables and devices as a static SVG. */
function HandoverTopology({ source }: HandoverTopologyProps) {
  const { t } = useTranslation('design')
  const sketch = useMemo(() => TopologySketch.build(source), [source])
  if (!sketch) return null
  const { viewBox } = sketch

  return (
    <section aria-labelledby="handover-topology" className="flex flex-col gap-3 break-inside-avoid">
      <h2 id="handover-topology" className="border-b border-border-strong pb-1 text-lg font-semibold">
        {t('ui.handover.topology')}
      </h2>
      <svg
        role="img"
        aria-label={t('ui.handover.topologyAria', { count: sketch.nodes.length })}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="max-h-[32rem] w-full rounded-lg border border-border bg-surface"
      >
        {sketch.zones.map((zone) =>
          zone.ellipse ? (
            <ellipse
              key={zone.id}
              cx={zone.x + zone.width / 2}
              cy={zone.y + zone.height / 2}
              rx={zone.width / 2}
              ry={zone.height / 2}
              className="fill-surface-subtle stroke-border-strong"
            />
          ) : (
            <rect key={zone.id} x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx={8} className="fill-surface-subtle stroke-border-strong" />
          ),
        )}
        {sketch.zones.map(
          (zone) =>
            zone.label !== undefined && (
              <text key={`${zone.id}-label`} x={zone.x + 8} y={zone.y + 18} className="fill-fg-muted text-[13px] font-semibold">
                {zone.label}
              </text>
            ),
        )}
        {sketch.links.map((link) => (
          <line
            key={link.id}
            x1={link.x1}
            y1={link.y1}
            x2={link.x2}
            y2={link.y2}
            strokeWidth={2}
            strokeDasharray={link.wireless || !link.connected ? '6 4' : undefined}
            className={link.connected ? 'stroke-cable' : 'stroke-rose-400'}
          />
        ))}
        {sketch.nodes.map((node) => (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={ICON_SIZE / 2 + 6} className="fill-node stroke-node-border" />
            <svg x={node.x - ICON_SIZE / 2} y={node.y - ICON_SIZE / 2} width={ICON_SIZE} height={ICON_SIZE} className="text-fg">
              <DeviceKindIcon kind={node.kind} modelId={node.modelId} className="h-full w-full" aria-hidden="true" />
            </svg>
            <text x={node.x} y={node.y + ICON_SIZE / 2 + 22} textAnchor="middle" strokeWidth={4} paintOrder="stroke" className="fill-fg-strong stroke-surface text-[12px]">
              {node.name}
            </text>
          </g>
        ))}
      </svg>
    </section>
  )
}

export default HandoverTopology

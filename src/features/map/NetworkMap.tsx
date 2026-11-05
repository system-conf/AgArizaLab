import type { NetworkState } from '../../domain/NetworkTypes'
import DeviceNode from './DeviceNode'
import LinkLine from './LinkLine'

interface NetworkMapProps {
  state: NetworkState
  selectedDeviceId: string | null
  onSelect: (deviceId: string) => void
}

// Device positions use a 1000x600 grid; a margin keeps edge devices fully visible.
const marginX = 60
const marginY = 50
const viewWidth = 1000 + marginX * 2
const viewHeight = 600 + marginY * 2

function toPercent(value: number, margin: number, size: number): number {
  return ((value + margin) / size) * 100
}

/** Hand-drawn SVG map of the network: links as lines, devices as buttons on top. */
function NetworkMap({ state, selectedDeviceId, onSelect }: NetworkMapProps) {
  const devicesById = new Map(state.devices.map((device) => [device.id, device]))

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
      style={{ aspectRatio: `${viewWidth} / ${viewHeight}` }}
      role="group"
      aria-label="Ağ haritası"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={`${-marginX} ${-marginY} ${viewWidth} ${viewHeight}`}
        aria-hidden="true"
      >
        {state.links.map((link) => {
          const deviceA = devicesById.get(link.a.deviceId)
          const deviceB = devicesById.get(link.b.deviceId)
          if (!deviceA || !deviceB) {
            console.warn(`Link ${link.id} points to a missing device; it is not drawn.`)
            return null
          }
          return <LinkLine key={link.id} link={link} deviceA={deviceA} deviceB={deviceB} />
        })}
      </svg>
      {state.devices.map((device) => (
        <DeviceNode
          key={device.id}
          device={device}
          leftPercent={toPercent(device.position.x, marginX, viewWidth)}
          topPercent={toPercent(device.position.y, marginY, viewHeight)}
          selected={device.id === selectedDeviceId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

export default NetworkMap

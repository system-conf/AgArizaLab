import type { Device, Link } from '../../domain/NetworkTypes'

interface LinkLineProps {
  link: Link
  deviceA: Device
  deviceB: Device
}

/** Fraction of the line length from the switch where the port label sits. */
const labelOffset = 0.28

function isWireless(link: Link): boolean {
  return link.ssid !== undefined || link.a.portId === 'radio' || link.b.portId === 'radio'
}

/**
 * One cable or wireless association on the map.
 * Styling depends only on plugged/wireless state, never on whether the link "works",
 * so the map never points at the fault.
 */
function LinkLine({ link, deviceA, deviceB }: LinkLineProps) {
  const wireless = isWireless(link)
  const stroke = link.connected ? '#64748b' : '#cbd5e1'
  const ax = deviceA.position.x
  const ay = deviceA.position.y
  const bx = deviceB.position.x
  const by = deviceB.position.y

  const switchEnd =
    deviceA.kind === 'switch' ? { at: deviceA, port: link.a.portId, towards: deviceB } :
    deviceB.kind === 'switch' ? { at: deviceB, port: link.b.portId, towards: deviceA } :
    undefined

  return (
    <g>
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke={stroke}
        strokeWidth={2.5}
        strokeDasharray={wireless ? '8 6' : link.connected ? undefined : '2 6'}
        strokeLinecap="round"
      />
      {switchEnd && (
        <text
          x={switchEnd.at.position.x + (switchEnd.towards.position.x - switchEnd.at.position.x) * labelOffset}
          y={switchEnd.at.position.y + (switchEnd.towards.position.y - switchEnd.at.position.y) * labelOffset}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={14}
          fill="#475569"
          stroke="#f8fafc"
          strokeWidth={4}
          paintOrder="stroke"
        >
          {switchEnd.port}
        </text>
      )}
      {!link.connected && (
        <title>Kablo takılı değil</title>
      )}
    </g>
  )
}

export default LinkLine

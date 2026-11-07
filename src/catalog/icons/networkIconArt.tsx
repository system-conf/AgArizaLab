// Network gear in the classic, generic network-diagram symbol language, drawn from scratch on the
// 24×24 grid: router = cylinder with four arrows, switch = flat box with two-way arrows, L3 switch
// = switch box carrying the router arrows, hub = box with one shared bus, firewall = brick wall,
// access point = box with waves, wireless router = router cylinder with waves.
import type { DeviceIconArt } from './deviceIconTypes'
import { arrowPath, doubleArrowPath } from './iconGeometry'

const BODY = 'deviceIconBody'

const router: DeviceIconArt = {
  tone: 'network',
  glyph: (
    <>
      <path className={BODY} d="M2.5 9.25c0-2.76 4.25-5 9.5-5s9.5 2.24 9.5 5v6.5c0 2.76-4.25 5-9.5 5s-9.5-2.24-9.5-5Z" />
      <path d="M2.5 9.25c0 2.76 4.25 5 9.5 5s9.5-2.24 9.5-5" />
      <path
        strokeWidth={1.5}
        d={[
          arrowPath([13.4, 8.5], [17.8, 6.3]),
          arrowPath([10.6, 10], [6.2, 12.2]),
          arrowPath([6.2, 6.3], [10.6, 8.5]),
          arrowPath([17.8, 12.2], [13.4, 10]),
        ].join('')}
      />
    </>
  ),
}

/** Oblique flat box shared by the switch drawings (front face x 2…19). */
function boxOutline(top: number, bottom: number) {
  return (
    <>
      <path className={BODY} d={`M2 ${top}L5 ${top - 3}H22V${bottom - 3}L19 ${bottom}H2Z`} />
      <path d={`M2 ${top}H19L22 ${top - 3}M19 ${top}V${bottom}`} />
    </>
  )
}

const switchArt: DeviceIconArt = {
  tone: 'network',
  glyph: (
    <>
      {boxOutline(9, 18)}
      <path strokeWidth={1.5} d={arrowPath([5, 11.8], [15.5, 11.8]) + arrowPath([15.5, 15.2], [5, 15.2])} />
    </>
  ),
}

const l3Switch: DeviceIconArt = {
  tone: 'network',
  glyph: (
    <>
      {boxOutline(8.5, 20)}
      <path
        strokeWidth={1.5}
        d={[
          arrowPath([11.6, 13.2], [15, 10.7], 1.6, 1.1),
          arrowPath([9.4, 15.3], [6, 17.8], 1.6, 1.1),
          arrowPath([6, 10.7], [9.4, 13.2], 1.6, 1.1),
          arrowPath([15, 17.8], [11.6, 15.3], 1.6, 1.1),
        ].join('')}
      />
    </>
  ),
}

const hub: DeviceIconArt = {
  tone: 'network',
  glyph: (
    <>
      <rect className={BODY} x="2" y="7" width="20" height="10" rx="1.5" />
      <path strokeWidth={1.5} d={doubleArrowPath([5, 10.5], [19, 10.5]) + 'M8 10.5V14M12 10.5V14M16 10.5V14'} />
    </>
  ),
}

const firewall: DeviceIconArt = {
  tone: 'security',
  glyph: (
    <>
      <rect className={BODY} x="3" y="4.5" width="18" height="15" rx="1" />
      <path strokeWidth={1.5} d="M3 9.5h18M3 14.5h18M9 4.5v5M15 4.5v5M6 9.5v5M12 9.5v5M18 9.5v5M9 14.5v5M15 14.5v5" />
    </>
  ),
}

const accessPoint: DeviceIconArt = {
  tone: 'network',
  glyph: (
    <>
      <rect className={BODY} x="3" y="14.5" width="18" height="5.5" rx="2.75" />
      <path d="M7 17.25h.01M12 14.5V13" />
      <path d="M9.74 10.24a3.2 3.2 0 0 1 4.52 0M7.19 7.69a6.8 6.8 0 0 1 9.62 0M4.6 5.1a10.5 10.5 0 0 1 14.8 0" />
    </>
  ),
}

const wirelessRouter: DeviceIconArt = {
  tone: 'network',
  glyph: (
    <>
      <path className={BODY} d="M3 13.5c0-1.93 4.03-3.5 9-3.5s9 1.57 9 3.5V18c0 1.93-4.03 3.5-9 3.5S3 19.93 3 18Z" />
      <path d="M3 13.5c0 1.93 4.03 3.5 9 3.5s9-1.57 9-3.5" />
      <path strokeWidth={1.5} d={arrowPath([13, 13], [16.8, 11.7], 1.5, 1) + arrowPath([7.2, 15.3], [11, 14], 1.5, 1)} />
      <path d="M10.16 7.66a2.6 2.6 0 0 1 3.68 0M8.04 5.54a5.6 5.6 0 0 1 7.92 0" />
    </>
  ),
}

export const networkIconArt = {
  router,
  switch: switchArt,
  l3Switch,
  hub,
  firewall,
  accessPoint,
  wirelessRouter,
} as const satisfies Readonly<Record<string, DeviceIconArt>>

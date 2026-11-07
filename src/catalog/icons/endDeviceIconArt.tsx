// End devices and servers on the 24×24 grid, drawn from scratch with simple, distinct silhouettes.
import type { DeviceIconArt } from './deviceIconTypes'

const BODY = 'deviceIconBody'

const towerServer: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="6" y="2.5" width="12" height="19" rx="1.5" />
      <path strokeWidth={1.5} d="M9 6.5h6M9 9.5h6" />
      <circle cx="12" cy="16.5" r="1.5" />
    </>
  ),
}

const rackServer: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="2.5" y="3" width="19" height="5" rx="1" />
      <rect className={BODY} x="2.5" y="9.5" width="19" height="5" rx="1" />
      <rect className={BODY} x="2.5" y="16" width="19" height="5" rx="1" />
      <path d="M6 5.5h.01M6 12h.01M6 18.5h.01" />
      <path strokeWidth={1.5} d="M11 5.5h7M11 12h7M11 18.5h7" />
    </>
  ),
}

const pc: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="2" y="4" width="13.5" height="10.5" rx="1.5" />
      <path d="M8.75 14.5V18M5.5 18.5h6.5" />
      <rect className={BODY} x="17.5" y="5" width="4.5" height="15" rx="1" />
      <path strokeWidth={1.5} d="M19 8h1.5M19 10.5h1.5" />
    </>
  ),
}

const laptop: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="4.5" y="4.5" width="15" height="10" rx="1.5" />
      <path className={BODY} d="M2.5 19.5 4.5 16h15l2 3.5Z" />
    </>
  ),
}

const smartphone: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10.5 5.5h3M12 18.5h.01" />
    </>
  ),
}

const tablet: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="3.5" y="3" width="17" height="18" rx="2.5" />
      <path d="M12 18h.01" />
    </>
  ),
}

const ipPhone: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <path className={BODY} d="M5 12.5h14l2 8H3Z" />
      <path className={BODY} d="M3 9.5C3 6.7 7 5 12 5s9 1.7 9 4.5V11h-4.5V9.5h-9V11H3Z" />
      <path d="M9 15h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01M15 18h.01" />
    </>
  ),
}

const printer: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <path d="M6.5 9V3h11v6" />
      <rect className={BODY} x="2.5" y="9" width="19" height="8" rx="2" />
      <path className={BODY} d="M6.5 14h11v7h-11Z" />
      <path strokeWidth={1.5} d="M9 17.5h6M18 11.5h.01" />
    </>
  ),
}

const multifunctionPrinter: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M2.5 8h19" />
      <path className={BODY} d="M6.5 14h11v7h-11Z" />
      <path strokeWidth={1.5} d="M9 17.5h6M18 11h.01" />
    </>
  ),
}

const ipCamera: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="2.5" y="5" width="14" height="6.5" rx="1.5" transform="rotate(15 9.5 8.25)" />
      <path d="M2.4 7.6 1.6 10.6" />
      <path d="M13.5 12.8 15 16.5h5M20.5 12.5v8" />
    </>
  ),
}

const nvr: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="2.5" y="7.5" width="19" height="9" rx="1.5" />
      <circle cx="7" cy="12" r="2" fill="currentColor" />
      <path strokeWidth={1.5} d="M11 10.5h7M11 13.5h7" />
      <path d="M5 16.5V18M19 16.5V18" />
    </>
  ),
}

const pos: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="6" y="2.5" width="12" height="19" rx="2.5" />
      <rect x="8.5" y="5" width="7" height="5" rx="0.5" />
      <path d="M9 13h.01M12 13h.01M15 13h.01M9 15.75h.01M12 15.75h.01M15 15.75h.01M9 18.5h.01M12 18.5h.01M15 18.5h.01" />
    </>
  ),
}

const kitchenDisplay: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="2.5" y="3.5" width="19" height="13" rx="1.5" />
      <path strokeWidth={1.5} d="M5.5 6.5h3.5v7H5.5ZM10.25 6.5h3.5v5h-3.5ZM15 6.5h3.5v6H15Z" />
      <path d="M12 16.5V20M8.5 20.5h7" />
    </>
  ),
}

const smartTv: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className={BODY} x="2" y="4.5" width="20" height="12.5" rx="1.5" />
      <path d="M10.5 8.25v5l4-2.5Z" />
      <path d="M6.5 17 5 20.5M17.5 17l1.5 3.5" />
    </>
  ),
}

export const endDeviceIconArt = {
  towerServer,
  rackServer,
  pc,
  laptop,
  smartphone,
  tablet,
  ipPhone,
  printer,
  multifunctionPrinter,
  ipCamera,
  nvr,
  pos,
  kitchenDisplay,
  smartTv,
} as const satisfies Readonly<Record<string, DeviceIconArt>>

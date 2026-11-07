// WAN / ISP symbols on the 24×24 grid: the network-diagram cloud and the two ISP modems (a modem
// is drawn as a box with a carrier wave; DSL = flat box on a phone cord, cable = upright box with a
// coax connector).
import type { DeviceIconArt } from './deviceIconTypes'

const BODY = 'deviceIconBody'

const internetCloud: DeviceIconArt = {
  tone: 'wan',
  glyph: <path className={BODY} d="M6.6 19a4.5 4.5 0 0 1-1.1-8.86A6.5 6.5 0 0 1 17.8 8.8a5.1 5.1 0 0 1-.7 10.2Z" />,
}

const dslModem: DeviceIconArt = {
  tone: 'wan',
  glyph: (
    <>
      <rect className={BODY} x="2.5" y="9.5" width="19" height="8.5" rx="2" />
      <path strokeWidth={1.5} d="M5.5 13.75c1.25-2 2.5-2 3.75 0s2.5 2 3.75 0 2.5-2 3.75 0" />
      <path d="M18.5 9.5V7c0-1.4.9-2.5 2.5-2.5" />
      <path d="M6 20.5v-2.5M18 20.5v-2.5" />
    </>
  ),
}

const cableModem: DeviceIconArt = {
  tone: 'wan',
  glyph: (
    <>
      <rect className={BODY} x="6.5" y="2.5" width="11" height="19" rx="2" />
      <path strokeWidth={1.5} d="M9 9c1-1.6 2-1.6 3 0s2 1.6 3 0" />
      <circle cx="12" cy="16" r="2.25" />
      <path d="M12 16h.01" />
    </>
  ),
}

export const wanIconArt = { internetCloud, dslModem, cableModem } as const satisfies Readonly<Record<string, DeviceIconArt>>

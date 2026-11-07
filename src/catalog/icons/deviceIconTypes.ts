import type { ReactNode } from 'react'

/** Props every device icon accepts (a subset of lucide's, so the frame stays interchangeable). */
export interface DeviceIconProps {
  className?: string
  /** Width and height; default 24. */
  size?: number | string
  strokeWidth?: number | string
  /** Explicit stroke colour; default `currentColor`. */
  color?: string
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-label'?: string
}

/**
 * Colour family of an icon. The colour itself comes from the CSS variables in `deviceIcons.css`
 * (`--device-icon-network`, `--device-icon-end-device`, `--device-icon-security`, `--device-icon-wan`).
 */
export type DeviceIconTone = 'network' | 'endDevice' | 'security' | 'wan'

/** Every icon of the set (one per device kind plus model-specific variants). */
export type DeviceIconId =
  | 'router'
  | 'switch'
  | 'l3Switch'
  | 'hub'
  | 'firewall'
  | 'accessPoint'
  | 'wirelessRouter'
  | 'internetCloud'
  | 'dslModem'
  | 'cableModem'
  | 'towerServer'
  | 'rackServer'
  | 'pc'
  | 'laptop'
  | 'smartphone'
  | 'tablet'
  | 'ipPhone'
  | 'printer'
  | 'multifunctionPrinter'
  | 'ipCamera'
  | 'nvr'
  | 'pos'
  | 'kitchenDisplay'
  | 'smartTv'
  | 'genericDevice'

/**
 * Drawing of one icon on the 24×24 grid. `glyph` is static SVG content: shapes with the class
 * `deviceIconBody` get the tinted fill, everything else is stroked with the icon colour.
 */
export interface DeviceIconArt {
  tone: DeviceIconTone
  glyph: ReactNode
}

import type { ComponentType } from 'react'

/** Props every device icon accepts (a subset of lucide's, so lucide icons fit too). */
export interface DeviceIconProps {
  className?: string
  /** Width and height; default 24. */
  size?: number | string
  strokeWidth?: number | string
  color?: string
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-label'?: string
}

/** A device icon: 24×24 outline, `currentColor` stroke (lucide style). */
export type DeviceIcon = ComponentType<DeviceIconProps>

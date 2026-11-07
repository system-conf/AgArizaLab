import type { ReactNode } from 'react'
import './deviceIcons.css'
import type { DeviceIconProps, DeviceIconTone } from './deviceIconTypes'

interface IconSvgProps extends DeviceIconProps {
  /** Colour family (CSS variable); absent = the icon inherits the text colour. */
  tone?: DeviceIconTone
  children: ReactNode
}

/**
 * Shared frame of the device icons: 24×24 grid, round strokes in `currentColor`. With a tone the
 * colour comes from `--device-icon-<tone>` (deviceIcons.css, low-priority layer: a text colour
 * class passed in `className` still wins).
 */
export function IconSvg({ size = 24, strokeWidth = 1.75, color = 'currentColor', tone, className, children, ...rest }: IconSvgProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-tone={tone}
      className={className === undefined ? 'deviceIcon' : `deviceIcon ${className}`}
      {...rest}
    >
      {children}
    </svg>
  )
}

import type { ReactNode } from 'react'
import type { DeviceIconProps } from './deviceIconTypes'

interface IconSvgProps extends DeviceIconProps {
  children: ReactNode
}

/** Shared frame of the catalog's own icons: same geometry and stroke as lucide-react icons. */
export function IconSvg({ size = 24, strokeWidth = 2, color = 'currentColor', children, ...rest }: IconSvgProps) {
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
      {...rest}
    >
      {children}
    </svg>
  )
}

// Original icons for the network gear, drawn after the classic network-diagram symbols in the
// lucide grid (24×24, 2px round stroke) so they sit well next to the lucide end-device icons.
import type { DeviceIconProps } from './deviceIconTypes'
import { IconSvg } from './IconSvg'

/** Router: a puck (cylinder) with traffic in both directions. */
export function RouterIcon(props: DeviceIconProps) {
  return (
    <IconSvg {...props}>
      <ellipse cx="12" cy="7" rx="9" ry="3" />
      <path d="M3 7v10c0 1.66 4.03 3 9 3s9-1.34 9-3V7" />
      <path d="M7 11.5h9" />
      <path d="m14 9.75 2 1.75-2 1.75" />
      <path d="M17 15.5H8" />
      <path d="m10 13.75-2 1.75 2 1.75" />
    </IconSvg>
  )
}

/** Layer-2 switch: a flat box with traffic in both directions. */
export function SwitchIcon(props: DeviceIconProps) {
  return (
    <IconSvg {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h11" />
      <path d="m14.5 8 2.5 2-2.5 2" />
      <path d="M18 14H7" />
      <path d="m9.5 12-2.5 2 2.5 2" />
    </IconSvg>
  )
}

/** Layer-3 switch: a switch box carrying a small router puck. */
export function L3SwitchIcon(props: DeviceIconProps) {
  return (
    <IconSvg {...props}>
      <path d="M7 9V6.5c0-1.1 2.24-2 5-2s5 .9 5 2V9" />
      <path d="M7 6.5c0 1.1 2.24 2 5 2s5-.9 5-2" />
      <rect x="2" y="9" width="20" height="11" rx="2" />
      <path d="M6 12.5h11" />
      <path d="m15 11 2 1.5-2 1.5" />
      <path d="M18 16.5H7" />
      <path d="m9 15-2 1.5 2 1.5" />
    </IconSvg>
  )
}

/** Hub: a box that repeats everything both ways (one double-headed arrow). */
export function HubIcon(props: DeviceIconProps) {
  return (
    <IconSvg {...props}>
      <rect x="2" y="7" width="20" height="10" rx="2" />
      <path d="M6 12h12" />
      <path d="m8 10-2 2 2 2" />
      <path d="m16 10 2 2-2 2" />
    </IconSvg>
  )
}

/** Access point: a ceiling puck with radio waves. */
export function AccessPointIcon(props: DeviceIconProps) {
  return (
    <IconSvg {...props}>
      <rect x="3" y="15" width="18" height="5" rx="2.5" />
      <path d="M12 17.5h.01" />
      <path d="M9 11.5a4.2 4.2 0 0 1 6 0" />
      <path d="M6 8.5a8.5 8.5 0 0 1 12 0" />
    </IconSvg>
  )
}

/** Wireless home router: a box with two antennas and radio waves. */
export function WirelessRouterIcon(props: DeviceIconProps) {
  return (
    <IconSvg {...props}>
      <rect x="2" y="13" width="20" height="7" rx="2" />
      <path d="M6 13V8" />
      <path d="M18 13V8" />
      <path d="M6 16.5h.01" />
      <path d="M10 16.5h.01" />
      <path d="M10 9.5a3 3 0 0 1 4 0" />
      <path d="M8.5 7a5.5 5.5 0 0 1 7 0" />
    </IconSvg>
  )
}

/** Internet / ISP: the cloud of network diagrams. */
export function InternetCloudIcon(props: DeviceIconProps) {
  return (
    <IconSvg {...props}>
      <path d="M17.5 19H8a5 5 0 1 1 .9-9.92A6 6 0 0 1 20 11.5a4 4 0 0 1-2.5 7.5Z" />
    </IconSvg>
  )
}

// Fallback icon for a device whose kind has no icon (e.g. a lab saved by a newer version).
import type { DeviceIconArt } from './deviceIconTypes'

export const genericDeviceArt: DeviceIconArt = {
  tone: 'endDevice',
  glyph: (
    <>
      <rect className="deviceIconBody" x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path strokeWidth={1.5} d="M9 10.5h6v4.5H9ZM10.75 15v-1.5M13.25 15v-1.5" />
    </>
  ),
}

// The whole icon set: id → drawing. Colour families: network blue, end devices slate, security
// orange, WAN / cloud violet (see deviceIcons.css).
import type { DeviceIconArt, DeviceIconId } from './deviceIconTypes'
import { endDeviceIconArt } from './endDeviceIconArt'
import { genericDeviceArt } from './genericDeviceArt'
import { networkIconArt } from './networkIconArt'
import { wanIconArt } from './wanIconArt'

export const DEVICE_ICON_ART: Readonly<Record<DeviceIconId, DeviceIconArt>> = {
  ...networkIconArt,
  ...wanIconArt,
  ...endDeviceIconArt,
  genericDevice: genericDeviceArt,
}

export const DEVICE_ICON_IDS = Object.keys(DEVICE_ICON_ART) as readonly DeviceIconId[]

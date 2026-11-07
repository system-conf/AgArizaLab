import type { DeviceKind } from '../../domain'
import { DEVICE_ICON_ART } from './deviceIconArt'
import { deviceIconForModel } from './deviceIconRegistry'
import type { DeviceIconId, DeviceIconProps } from './deviceIconTypes'
import { IconSvg } from './IconSvg'

interface ToneProps {
  /**
   * 'category' (default): colour by device category (network blue, end devices slate, security
   * orange, WAN violet). 'inherit': use the surrounding text colour (e.g. a powered-off device).
   */
  tone?: 'category' | 'inherit'
}

interface DeviceIconGlyphProps extends DeviceIconProps, ToneProps {
  icon: DeviceIconId
}

/** One icon of the set by id. */
export function DeviceIconGlyph({ icon, tone = 'category', ...props }: DeviceIconGlyphProps) {
  const art = DEVICE_ICON_ART[icon]
  return (
    <IconSvg tone={tone === 'category' ? art.tone : undefined} {...props}>
      {art.glyph}
    </IconSvg>
  )
}

interface DeviceKindIconProps extends DeviceIconProps, ToneProps {
  kind: DeviceKind
  /** Catalog model id (Device.modelId): modems, rack server, smart TV… have their own icon. */
  modelId?: string
}

/** Icon of a device: model → kind → fallback (deviceIconForModel). */
export function DeviceKindIcon({ kind, modelId, ...props }: DeviceKindIconProps) {
  return <DeviceIconGlyph icon={deviceIconForModel(kind, modelId)} {...props} />
}

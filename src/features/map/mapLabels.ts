import type { AriaLabelConfig } from '@xyflow/react'

/** Turkish screen-reader labels and tooltips for React Flow's built-in parts. */
export const mapAriaLabels: Partial<AriaLabelConfig> = {
  'node.a11yDescription.default':
    'Cihazı seçmek için Enter veya Boşluk tuşuna basın. Taşımak için ok tuşlarını kullanın.',
  'node.a11yDescription.keyboardDisabled': 'Cihazı seçmek için Enter veya Boşluk tuşuna basın.',
  'node.a11yDescription.ariaLiveMessage': ({ x, y }) => `Cihaz taşındı. Yeni konum: x ${x}, y ${y}.`,
  'edge.a11yDescription.default': 'Cihazlar arasındaki bağlantı.',
  'controls.ariaLabel': 'Harita kontrolleri',
  'controls.zoomIn.ariaLabel': 'Yakınlaştır',
  'controls.zoomOut.ariaLabel': 'Uzaklaştır',
  'controls.fitView.ariaLabel': 'Haritayı ekrana sığdır',
  'controls.interactive.ariaLabel': 'Haritayı kilitle veya aç',
  'minimap.ariaLabel': 'Küçük harita',
  'handle.ariaLabel': 'Bağlantı noktası',
}

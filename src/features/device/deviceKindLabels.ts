import type { DeviceKind } from '../../domain/NetworkTypes'

/** Turkish name of each device kind. */
export const deviceKindLabels: Record<DeviceKind, string> = {
  internet: 'İnternet',
  router: 'Modem / Router',
  switch: 'Switch',
  accessPoint: 'Kablosuz erişim noktası',
  pc: 'Bilgisayar',
  pos: 'Kasa (POS)',
  printer: 'Yazıcı',
  camera: 'IP kamera',
  nvr: 'Kayıt cihazı (NVR)',
  kitchenDisplay: 'Mutfak ekranı',
  phone: 'Telefon',
}

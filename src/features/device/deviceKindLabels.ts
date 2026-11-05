import type { DeviceKind } from '../../domain/NetworkTypes'

/** `device` namespace key of each device kind's name; translate with t() at render time. */
export const deviceKindKeys = {
  internet: 'kinds.internet',
  router: 'kinds.router',
  switch: 'kinds.switch',
  accessPoint: 'kinds.accessPoint',
  pc: 'kinds.pc',
  pos: 'kinds.pos',
  printer: 'kinds.printer',
  camera: 'kinds.camera',
  nvr: 'kinds.nvr',
  kitchenDisplay: 'kinds.kitchenDisplay',
  phone: 'kinds.phone',
} as const satisfies Record<DeviceKind, `kinds.${string}`>

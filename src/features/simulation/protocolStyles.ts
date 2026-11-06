// Colours per protocol (chips, envelopes on the map) and per action (event list, inspector).
import type { SimAction, SimProtocol } from './simulationServices'

export interface ProtocolStyle {
  /** Envelope fill on the map. */
  readonly fill: string
  /** Tailwind classes of the protocol chip. */
  readonly chip: string
}

export const PROTOCOL_STYLES: Readonly<Record<SimProtocol, ProtocolStyle>> = {
  arp: { fill: '#d97706', chip: 'bg-amber-100 text-amber-900 ring-amber-300' },
  icmp: { fill: '#7c3aed', chip: 'bg-violet-100 text-violet-900 ring-violet-300' },
  dhcp: { fill: '#059669', chip: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
  dns: { fill: '#0891b2', chip: 'bg-cyan-100 text-cyan-900 ring-cyan-300' },
  http: { fill: '#e11d48', chip: 'bg-rose-100 text-rose-900 ring-rose-300' },
  tcp: { fill: '#db2777', chip: 'bg-pink-100 text-pink-900 ring-pink-300' },
  udp: { fill: '#0d9488', chip: 'bg-teal-100 text-teal-900 ring-teal-300' },
  ipv4: { fill: '#2563eb', chip: 'bg-blue-100 text-blue-900 ring-blue-300' },
  ethernet: { fill: '#475569', chip: 'bg-slate-100 text-slate-800 ring-slate-300' },
  hdlc: { fill: '#57534e', chip: 'bg-stone-100 text-stone-800 ring-stone-300' },
}

export const NO_PROTOCOL_CHIP = 'bg-white text-slate-600 ring-slate-300'

/** Problem → red, consumed → green, held → amber, moving on → neutral. */
export function actionTone(action: SimAction): string {
  switch (action) {
    case 'dropped':
    case 'timedOut':
      return 'text-red-700'
    case 'delivered':
    case 'replied':
      return 'text-emerald-700'
    case 'buffered':
    case 'filtered':
      return 'text-amber-700'
    case 'created':
    case 'sent':
    case 'forwarded':
    case 'flooded':
      return 'text-slate-800'
  }
}

/** Background of the inspector's decision box. */
export function decisionTone(action: SimAction): string {
  switch (action) {
    case 'dropped':
    case 'timedOut':
      return 'border-red-200 bg-red-50 text-red-900'
    case 'delivered':
    case 'replied':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900'
    case 'buffered':
    case 'filtered':
      return 'border-amber-200 bg-amber-50 text-amber-900'
    case 'created':
    case 'sent':
    case 'forwarded':
    case 'flooded':
      return 'border-sky-200 bg-sky-50 text-sky-900'
  }
}

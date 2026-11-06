import type { Link } from '../../domain'
import { type LatencyModel, SIM_TIMING } from '../contract'

/**
 * Per-hop latency (docs/SIMULATION.md §3.4): only links take time, in whole virtual milliseconds;
 * devices decide instantly. Equal latencies on wired links keep packets that travel side by side in
 * step, so one 'instant' step moves every packet one hop.
 */
export class DefaultLatencyModel implements LatencyModel {
  linkDelayMs(link: Link): number {
    switch (link.cable) {
      case 'wireless':
        return SIM_TIMING.wirelessLinkMs
      case 'serial':
        return SIM_TIMING.serialLinkMs
      default:
        return SIM_TIMING.wiredLinkMs
    }
  }
}

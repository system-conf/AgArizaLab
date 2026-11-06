// S2: the network layer of the packet simulator (docs/SIMULATION.md §7.2).
import type { NetworkLayer } from '../contract'
import { Ipv4NetworkLayer } from './Ipv4NetworkLayer'

export const networkLayer: NetworkLayer = new Ipv4NetworkLayer()

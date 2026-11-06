// Link layer of the packet simulator (S1, docs/SIMULATION.md §7.1): hubs, bridges with VLANs and Wi-Fi,
// NIC / routed-port / sub-interface / SVI endpoints, ARP, duplicate address detection, the cloud's ports.
import type { LinkLayer } from '../contract'
import { DefaultLinkLayer } from './DefaultLinkLayer'

export const linkLayer: LinkLayer = new DefaultLinkLayer()

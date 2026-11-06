// Services layer of the packet simulator (S3, docs/SIMULATION.md §6.3, §7.3).
import type { ServiceLayer } from '../contract'
import { SimServiceLayer } from './SimServiceLayer'

export const serviceLayer: ServiceLayer = new SimServiceLayer()

// Sample lab content (SL2): every "now" and "Phase 3" row of docs/SAMPLE_LABS.md, in catalogue order.
import type { SampleDefinition } from '../contract'
import { basicsSamples } from './basicsSamples'
import { dhcpSamples } from './dhcpSamples'
import { dnsSamples } from './dnsSamples'
import { packetViewSamples } from './packetViewSamples'
import { routingSamples } from './routingSamples'
import { switchingSamples } from './switchingSamples'

export const contentSamples: readonly SampleDefinition[] = [
  ...basicsSamples,
  ...dhcpSamples,
  ...dnsSamples,
  ...switchingSamples,
  ...routingSamples,
  ...packetViewSamples,
]

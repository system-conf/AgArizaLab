// Every sample lab (docs/SAMPLE_LABS.md catalogue). SL2: the first batch lives in src/samples/content
// (one file per category); later packs add their own lists here.
import type { SampleDefinition } from './contract'
import { contentSamples } from './content'

export const sampleDefinitions: readonly SampleDefinition[] = [...contentSamples]

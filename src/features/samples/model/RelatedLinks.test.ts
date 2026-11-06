import { describe, expect, it } from 'vitest'
import type { SampleLink } from '../../../samples'
import { RelatedLinks, type RelatedTitles } from './RelatedLinks'

const titles: RelatedTitles = {
  exercise: (id) => (id === 'posGateway' ? 'POS gateway' : undefined),
  design: (id) => (id === 'smallOffice' ? 'Small office' : undefined),
  sample: (id) => (id === 'twoPcs' ? 'Two PCs' : undefined),
}

describe('RelatedLinks', () => {
  it('turns links into routes with titles, in order', () => {
    const links: SampleLink[] = [
      { kind: 'sample', sampleId: 'twoPcs' },
      { kind: 'exercise', exerciseId: 'posGateway' },
      { kind: 'design', briefId: 'smallOffice' },
    ]
    expect(RelatedLinks.resolve(links, titles)).toEqual([
      { key: 'sample:twoPcs', kind: 'sample', route: { name: 'sample', sampleId: 'twoPcs' }, title: 'Two PCs' },
      { key: 'exercise:posGateway', kind: 'exercise', route: { name: 'exercise', exerciseId: 'posGateway' }, title: 'POS gateway' },
      { key: 'design:smallOffice', kind: 'design', route: { name: 'design', briefId: 'smallOffice' }, title: 'Small office' },
    ])
  })

  it('drops links to missing targets and duplicates', () => {
    const links: SampleLink[] = [
      { kind: 'exercise', exerciseId: 'ghost' },
      { kind: 'sample', sampleId: 'notAvailable' },
      { kind: 'exercise', exerciseId: 'posGateway' },
      { kind: 'exercise', exerciseId: 'posGateway' },
    ]
    expect(RelatedLinks.resolve(links, titles).map((link) => link.key)).toEqual(['exercise:posGateway'])
  })
})

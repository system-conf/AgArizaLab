import { describe, expect, it } from 'vitest'
import { DesignReview } from './DesignReview'
import { editDevice, officeBrief } from './testBriefs'

describe('DesignReview', () => {
  const brief = officeBrief()
  const review = new DesignReview(brief)

  it('reports a solved reference design with full score, quotation and counts', () => {
    const report = review.analyze(brief.reference.state)
    expect(report.solved).toBe(true)
    expect(report.score).toEqual({ earned: 12, possible: 12 })
    expect(report.budget).toBe(1000)
    expect(report.cost).toEqual({
      total: 860,
      devices: [
        { modelId: 'router2Port', kind: 'router', count: 1, unitPrice: 650, subtotal: 650 },
        { modelId: 'switch8', kind: 'switch', count: 1, unitPrice: 180, subtotal: 180 },
      ],
      cables: [{ cable: 'copperStraight', count: 6, unitPrice: 5, subtotal: 30 }],
    })
    expect(report.counts).toEqual({ provided: 5, added: 2, addedByKind: { router: 1, switch: 1 } })
    expect(report.hints).toEqual([{ id: 'presentation' }])
  })

  it('finds the single points of failure of the reference design', () => {
    expect(review.analyze(brief.reference.state).singlePointsOfFailure).toEqual([
      // The router carries internet and DNS, but the office still prints without it.
      {
        deviceId: 'router',
        breaks: ['officeOnline', 'officeDns', 'printerOnline'],
        access: false,
        deviceName: 'router',
        kind: 'router',
        groups: ['Office PCs', 'Printer'],
        explanation: { key: 'design:review.spof.core', params: { device: 'router', groups: 'Office PCs, Printer' } },
      },
      // Every customer device is plugged into the one switch.
      {
        deviceId: 'switch',
        breaks: ['officeOnline', 'officeDns', 'printing', 'printerOnline'],
        access: true,
        deviceName: 'switch',
        kind: 'switch',
        groups: ['Office PCs', 'Printer'],
        explanation: { key: 'design:review.spof.access', params: { device: 'switch', groups: 'Office PCs, Printer' } },
      },
    ])
  })

  it('gives an empty design no points, not even for the limits it trivially meets', () => {
    const report = review.analyze(brief.lab.state)
    expect(report.solved).toBe(false)
    expect(report.score).toEqual({ earned: 0, possible: 12 })
    expect(report.cost.total).toBe(0)
    expect(report.singlePointsOfFailure).toEqual([])
    expect(report.hints.map((hint) => hint.id)).toEqual(['presentation', 'dhcpScope'])
  })

  it('counts met network requirements while a limit fails', () => {
    const pricey = new DesignReview({ ...brief, requirements: brief.requirements.map((requirement) =>
      requirement.condition.type === 'maxCost' ? { ...requirement, condition: { type: 'maxCost', amount: 500 } } : requirement,
    ) })
    const report = pricey.analyze(brief.reference.state)
    expect(report.solved).toBe(false)
    expect(report.score).toEqual({ earned: 11, possible: 12 })
  })

  it('does not count limits while a network requirement fails', () => {
    const noDns = editDevice(brief.reference.state, 'router', (router) => ({ ...router, services: { ...router.services, dns: { enabled: false, forwarders: [], records: [] } } }))
    const report = review.analyze(noDns)
    expect(report.results.find((result) => result.requirement.id === 'officeDns')?.ok).toBe(false)
    // 12 possible − officeDns (1) − budget (1) − oneRouter (1)
    expect(report.score).toEqual({ earned: 9, possible: 12 })
  })
})

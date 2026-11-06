// Every automatic "try this" step of every sample fails on the fresh lab and passes after the documented
// solution (applied in step order, like a learner working through the lesson).
import { describe, expect, it } from 'vitest'
import { StateInvariants } from '../../domain'
import { StepChecker, type SampleDefinition } from '../contract'
import { contentSamples } from './index'
import { MASK_24 } from './sampleKit'
import {
  accessVlan,
  addDnsRecord,
  addPool,
  addRoute,
  addSubInterface,
  addSvi,
  exclude,
  plug,
  power,
  removeRoutes,
  renew,
  route,
  setDns,
  setForwarders,
  setGateway,
  setIpRouting,
  setStatic,
  setVlans,
  simRenew,
  steps,
  trunk,
  type Solution,
} from './testSolutions'

const ANY = '0.0.0.0'

/** Solutions of the automatic steps, keyed by sample id and step id (texts say the same). */
const SOLUTIONS: Readonly<Record<string, Readonly<Record<string, Solution>>>> = {
  basicsTwoPcs: { addressPc2: (state) => setStatic(state, 'pc2', '192.168.1.11') },
  basicsSubnets: {
    fixMask: (state) => setStatic(state, 'pc3', '192.168.10.140'),
    splitSubnets: (state) => setStatic(state, 'pc2', '192.168.20.20'),
  },
  basicsGateway: { setGateway: (state) => setGateway(state, 'pc2', '192.168.2.1') },
  basicsIpConflict: { fixConflict: (state) => setStatic(state, 'pc3', '192.168.1.30') },
  basicsApipa: {
    startServer: steps((state) => power(state, 'dhcp1', true), (state) => renew(state, 'pc1')),
    pingNeighbour: (state) => renew(state, 'pc2'),
  },
  dhcpRouterServer: {
    renewPc1: (state) => renew(state, 'pc1'),
    pc2Online: (state) => renew(state, 'pc2'),
  },
  dhcpPoolsExclusions: {
    excludeStatics: steps(
      (state) => exclude(state, 'r1', { start: '192.168.10.1', end: '192.168.10.99' }),
      (state) => renew(state, 'pc1'),
    ),
    guestPool: steps(
      (state) => addPool(state, 'r1', { id: 'GUEST', network: '192.168.20.0', mask: MASK_24, defaultRouter: '192.168.20.1', dnsServers: [], leases: [] }),
      (state) => renew(state, 'pc3'),
    ),
  },
  dhcpStaticMapping: {
    renewNas: (state) => renew(state, 'nas1'),
    renewPcs: steps(
      (state) => renew(state, 'pc1'),
      (state) => renew(state, 'pc2'),
    ),
  },
  dhcpRelay: {
    renewPc1: (state) => simRenew(state, 'pc1'),
    pc2Ping: (state) => simRenew(state, 'pc2'),
  },
  dhcpConflict: {
    renewPc1: (state) => renew(state, 'pc1'),
    movePrinter: (state) => setStatic(state, 'printer1', '192.168.1.10'),
  },
  dnsLocalRecords: {
    addFilesRecord: (state) => addDnsRecord(state, 'dns1', 'files.office.lan', '192.168.1.30'),
    pc2Dns: (state) => setDns(state, 'pc2', ['192.168.1.5']),
  },
  dnsForwarders: { addForwarder: (state) => setForwarders(state, 'dns1', ['8.8.8.8']) },
  dnsMultiLevel: {
    forwardToHq: (state) => setForwarders(state, 'dnsBr', ['192.168.1.5']),
    hqForwarder: (state) => setForwarders(state, 'dnsHq', ['8.8.8.8']),
  },
  switchingVlansTrunks: {
    makeTrunk: steps(
      (state) => trunk(state, 'sw1', 'Fa0/8'),
      (state) => trunk(state, 'sw2', 'Fa0/8'),
    ),
    createVlan20: (state) => setVlans(state, 'sw2', [10, 20]),
  },
  switchingNativeVlan: { fixNative: (state) => trunk(state, 'sw2', 'Fa0/8', { nativeVlan: 99 }) },
  switchingAllowedVlans: {
    allowVlan20: steps(
      (state) => trunk(state, 'sw1', 'Fa0/8', { allowedVlans: [10, 20] }),
      (state) => trunk(state, 'sw2', 'Fa0/8', { allowedVlans: [10, 20] }),
    ),
  },
  switchingRouterOnAStick: { addSubInterface: (state) => addSubInterface(state, 'r1', 'Gi0/0', 20, '192.168.20.1') },
  switchingSvi: {
    enableRouting: (state) => setIpRouting(state, 'mls1', true),
    addVlan30: steps(
      (state) => setVlans(state, 'mls1', [10, 20, 30]),
      (state) => addSvi(state, 'mls1', 30, '192.168.30.1'),
      (state) => accessVlan(state, 'mls1', 'Gi1/0/3', 30),
    ),
  },
  routingStaticDefault: {
    staticBothWays: steps(
      (state) => addRoute(state, 'r1', route('192.168.2.0', MASK_24, '10.0.0.2')),
      (state) => addRoute(state, 'r2', route('192.168.1.0', MASK_24, '10.0.0.1')),
    ),
    defaultOnR2: (state) => addRoute(state, 'r2', route(ANY, ANY, '10.0.0.1')),
  },
  routingFloatingStatic: { addFloating: (state) => addRoute(state, 'r1', route('192.168.2.0', MASK_24, '10.0.13.2', 5)) },
  routingLoop: {
    fixRoute: steps(
      (state) => removeRoutes(state, 'r2', '192.168.3.0'),
      (state) => addRoute(state, 'r2', route('192.168.3.0', MASK_24, '10.0.23.2')),
    ),
  },
  packetArp: { gatewayArp: (state) => setGateway(state, 'pc1', '192.168.1.1') },
  packetMacLearning: { plugPc4: (state) => plug(state, 'pc4Link') },
  packetTtlTracert: { addReturnRoute: (state) => addRoute(state, 'r3', route(ANY, ANY, '10.0.23.1')) },
}

function autoSteps(sample: SampleDefinition) {
  return sample.steps.filter((step) => (step.checks ?? []).length > 0)
}

describe('sample step solutions', () => {
  it('has a solution for exactly the automatic steps of every sample', () => {
    for (const sample of contentSamples) {
      expect(Object.keys(SOLUTIONS[sample.id] ?? {}), sample.id).toEqual(autoSteps(sample).map((step) => step.id))
    }
  })

  it.each(contentSamples.map((sample) => [sample.id, sample] as const))('%s: automatic steps fail at the start and pass after their solution', (_, sample) => {
    const checker = new StepChecker(sample)
    const start = sample.lab().state
    for (const step of autoSteps(sample)) {
      expect(checker.checkStep(start, step), `${sample.id}.${step.id} at start`).toMatchObject({ kind: 'auto', ok: false })
    }
    let state = start
    for (const step of autoSteps(sample)) {
      const solve = SOLUTIONS[sample.id]?.[step.id]
      if (!solve) throw new Error(`No solution for ${sample.id}.${step.id}`)
      state = solve(state)
      expect(checker.checkStep(state, step), `${sample.id}.${step.id} after its solution`).toMatchObject({ kind: 'auto', ok: true })
    }
    expect(new StateInvariants().violations(state)).toEqual([])
    // Once solved, every automatic step holds together (nothing the learner did undid an earlier step).
    expect(checker.check(state).filter((status) => status.kind === 'auto' && !status.ok)).toEqual([])
  })
})

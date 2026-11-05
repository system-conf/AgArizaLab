// Property test: any sequence of LabEditor calls keeps the lab consistent (StateInvariants clean,
// layout = devices, loadable after serialize). Refusals must leave the document untouched.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CableRules,
  StateInvariants,
  type Annotation,
  type CableType,
  type DeviceKindV2,
  type DeviceV2,
  type L3Settings,
  type LabDocument,
  type LinkV2,
  type Port,
} from '../domain/v2'
import { LabEditor } from './LabEditor'
import { LabSerializer } from './LabSerializer'
import { sampleLab } from './testLabs'

const editor = new LabEditor()
const cableRules = new CableRules()
const invariants = new StateInvariants()
const serializer = new LabSerializer()

let macCounter = 0
function nextMac(): string {
  macCounter += 1
  const hex = macCounter.toString(16).toUpperCase().padStart(4, '0')
  return `02:EE:00:00:${hex.slice(0, 2)}:${hex.slice(2, 4)}`
}

const NO_ADDRESS: L3Settings = { ipv4: { addressing: 'dhcp', address: '', mask: '' } }

function port(id: string, role: Port['role'], medium: Port['medium']): Port {
  const mac = medium === 'serial' || medium === 'console' ? {} : { mac: nextMac() }
  const common = { id, medium, adminUp: true, ...mac }
  switch (role) {
    case 'switched':
      return { ...common, role, l2: { mode: 'access', accessVlan: 1, nativeVlan: 1, allowedVlans: 'all' } }
    case 'routed':
      return { ...common, role, l3: NO_ADDRESS, subInterfaces: [] }
    case 'host':
      return { ...common, role, l3: NO_ADDRESS }
    case 'radio':
    case 'console':
    case 'passive':
      return { ...common, role }
  }
}

const BUILDERS: Readonly<Partial<Record<DeviceKindV2, () => Port[]>>> = {
  pc: () => [port('eth0', 'host', 'copper'), port('wlan0', 'host', 'wireless'), port('RS232', 'console', 'console')],
  laptop: () => [port('wlan0', 'host', 'wireless')],
  switch: () => [port('Fa0/1', 'switched', 'copper'), port('Fa0/2', 'switched', 'copper'), port('Gi0/1', 'switched', 'fiber'), port('Console', 'console', 'console')],
  router: () => [port('Gi0/0', 'routed', 'copper'), port('Se0/0/0', 'routed', 'serial'), port('Console', 'console', 'console')],
  accessPoint: () => [port('Gi0', 'switched', 'copper'), port('Radio0', 'radio', 'wireless')],
  hub: () => [port('Eth0', 'passive', 'copper'), port('Eth1', 'passive', 'copper')],
}
const KINDS = Object.keys(BUILDERS) as DeviceKindV2[]
const CABLES: CableType[] = ['copperStraight', 'copperCross', 'fiber', 'serial', 'console', 'coaxial', 'wireless']

function build(kind: DeviceKindV2, id: string): DeviceV2 {
  const ports = BUILDERS[kind]?.() ?? []
  const base: DeviceV2 = { id, kind, modelId: kind, name: id, powered: true, baseMac: nextMac(), ports }
  return kind === 'accessPoint' ? { ...base, wireless: { ssids: [{ ssid: 'Office', vlan: 1, security: { mode: 'open' } }] } } : base
}

function pick<Item>(items: readonly Item[], index: number): Item | undefined {
  return items.length === 0 ? undefined : items[index % items.length]
}

type Step = (doc: LabDocument) => LabDocument

/** Ports without a cable (radio ports always count as free). */
function freePorts(doc: LabDocument, device: DeviceV2): Port[] {
  const used = new Set(doc.state.links.flatMap((link) => [link.a, link.b]).filter((end) => end.deviceId === device.id).map((end) => end.portId))
  return device.ports.filter((item) => item.role === 'radio' || !used.has(item.id))
}

/** How often interesting outcomes happened, so the test proves it exercised them. */
const seen = { connected: 0, refused: 0, linkDroppedByUpdate: 0, updateRefused: 0, removedWithLinks: 0 }

const index = fc.nat({ max: 50 })
const coordinate = fc.integer({ min: -2000, max: 2000 })

const addStep = fc.record({ kind: fc.constantFrom(...KINDS), x: coordinate, y: coordinate }).map(
  ({ kind, x, y }): Step => (doc) => editor.addDevice(doc, build(kind, editor.nextDeviceId(doc, kind)), { x, y }),
)

const removeStep = fc.array(index, { maxLength: 3 }).map(
  (picks): Step => (doc) => {
    const next = editor.removeDevices(doc, picks.map((i) => pick(doc.state.devices, i)?.id ?? 'ghost'))
    if (next.state.links.length < doc.state.links.length) seen.removedWithLinks += 1
    return next
  },
)

const moveStep = fc.record({ i: index, x: coordinate, y: coordinate }).map(
  ({ i, x, y }): Step => (doc) => editor.moveDevices(doc, [{ id: pick(doc.state.devices, i)?.id ?? 'ghost', to: { x, y } }]),
)

const connectStep = fc
  .record({ a: index, pa: index, b: index, pb: index, cable: fc.constantFrom<CableType | 'auto'>('auto', 'auto', 'auto', ...CABLES), ssid: fc.constantFrom('Office', 'Guest', ' ') })
  .map(
    ({ a, pa, b, pb, cable: tool, ssid }): Step =>
      (doc) => {
        const first = pick(doc.state.devices, a)
        const second = pick(doc.state.devices, a + 1 + b)
        const portA = first && pick(freePorts(doc, first), pa)
        const portB = second && pick(freePorts(doc, second).filter((item) => item.medium === portA?.medium), pb)
        if (!first || !second || !portA || !portB) return doc
        const ends = { id: editor.nextLinkId(doc), a: { deviceId: first.id, portId: portA.id }, b: { deviceId: second.id, portId: portB.id }, connected: true }
        const cable = tool === 'auto' ? (cableRules.autoCable(doc.state, ends.a, ends.b) ?? 'copperStraight') : tool
        const link: LinkV2 =
          cable === 'serial' ? { ...ends, cable, dceEnd: 'a' } : cable === 'wireless' ? { ...ends, cable, ssid } : { ...ends, cable }
        const result = editor.connect(doc, link)
        if (result.ok) {
          seen.connected += 1
          return result.doc
        }
        seen.refused += 1
        expect(result.refusal).toBeTypeOf('string')
        return doc
      },
  )

const linkStep = fc.record({ i: index, remove: fc.boolean(), connected: fc.boolean() }).map(
  ({ i, remove, connected }): Step => (doc) => {
    const id = pick(doc.state.links, i)?.id ?? 'ghost'
    return remove ? editor.disconnect(doc, id) : editor.setLinkConnected(doc, id, connected)
  },
)

const PORT_CHANGES = ['dropPort', 'fiber', 'mdixOff', 'badVlan', 'duplicatePort', 'rename'] as const

const updateStep = fc.record({ i: index, p: index, change: fc.constantFrom(...PORT_CHANGES), name: fc.string() }).map(
  ({ i, p, change, name }): Step =>
    (doc) => {
      const target = pick(doc.state.devices, i)
      const chosen = target && pick(target.ports, p)
      if (!target || !chosen) return doc
      const replacePort = (next: Port): DeviceV2 => ({ ...target, ports: target.ports.map((item) => (item === chosen ? next : item)) })
      switch (change) {
        case 'dropPort': {
          const next = editor.updateDevice(doc, { ...target, ports: target.ports.filter((item) => item !== chosen) })
          if (next.state.links.length < doc.state.links.length) seen.linkDroppedByUpdate += 1
          return next
        }
        case 'fiber':
          return editor.updateDevice(doc, replacePort({ ...chosen, medium: 'fiber' }))
        case 'mdixOff':
          return editor.updateDevice(doc, replacePort({ ...chosen, autoMdix: false, pinout: 'mdi' }))
        case 'badVlan':
          return chosen.role === 'switched'
            ? expectRefused(doc, { ...target, ports: target.ports.map((item) => (item === chosen ? { ...chosen, l2: { ...chosen.l2, accessVlan: 0 } } : item)) })
            : doc
        case 'duplicatePort':
          return expectRefused(doc, { ...target, ports: [...target.ports, { ...chosen, mac: undefined }] })
        case 'rename':
          return editor.renameDevice(doc, target.id, name)
      }
    },
)

function expectRefused(doc: LabDocument, device: DeviceV2): LabDocument {
  const next = editor.updateDevice(doc, device)
  expect(next).toBe(doc)
  seen.updateRefused += 1
  return next
}

const annotationStep = fc.record({ i: index, op: fc.constantFrom('add', 'update', 'remove'), x: coordinate, text: fc.string() }).map(
  ({ i, op, x, text }): Step =>
    (doc) => {
      const existing = pick(doc.annotations, i)
      if (op === 'add') {
        const note: Annotation = { id: editor.nextAnnotationId(doc), type: 'text', color: 'amber', at: { x, y: 0 }, text, size: 'small' }
        return editor.addAnnotation(doc, note)
      }
      if (!existing) return doc
      return op === 'remove' ? editor.removeAnnotation(doc, existing.id) : editor.updateAnnotation(doc, { ...existing, color: 'red' })
    },
)

const step = fc.oneof(addStep, addStep, removeStep, moveStep, connectStep, connectStep, connectStep, linkStep, updateStep, updateStep, annotationStep)

function expectConsistent(doc: LabDocument): void {
  expect(invariants.violations(doc.state)).toEqual([])
  expect(Object.keys(doc.layout.devices).sort()).toEqual(doc.state.devices.map((device) => device.id).sort())
  const reloaded = serializer.parse(serializer.serialize(doc))
  expect(reloaded.ok).toBe(true)
}

describe('LabEditor random edit sequences', () => {
  it('keep every intermediate lab consistent and loadable', () => {
    fc.assert(
      fc.property(fc.constantFrom(true, true, true, false), fc.array(step, { minLength: 1, maxLength: 40 }), (fromSample, steps) => {
        let doc = fromSample ? sampleLab() : editor.removeDevices(sampleLab(), sampleLab().state.devices.map((d) => d.id))
        for (const apply of steps) {
          doc = apply(doc)
          expectConsistent(doc)
        }
      }),
      { numRuns: 200 },
    )
    for (const [outcome, count] of Object.entries(seen)) expect(count, outcome).toBeGreaterThan(0)
  })
})

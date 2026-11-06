import { describe, expect, it } from 'vitest'
import { StateInvariants, type Device, type LabDocument, type Port } from '../domain'
import { makeDevice, routedPort, switchPort, updatePort } from '../domain/testDevices'
import { createEmptyLab } from './createLab'
import { LabEditError, LabEditor } from './LabEditor'
import { sampleLab } from './testLabs'

const editor = new LabEditor()
const invariants = new StateInvariants()

function device(doc: LabDocument, id: string): Device {
  const found = doc.state.devices.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`no device ${id}`)
  return found
}

function withPorts(target: Device, change: (ports: Port[]) => Port[]): Device {
  return { ...target, ports: change(target.ports) }
}

describe('LabEditor devices', () => {
  it('adds a device with its position and refuses duplicate ids or broken devices', () => {
    const doc = createEmptyLab()
    const router = makeDevice('router1', 'router', [routedPort('Gi0/0')])
    const next = editor.addDevice(doc, router, { x: 5, y: 6 })
    expect(next.state.devices).toEqual([router])
    expect(next.layout.devices).toEqual({ router1: { x: 5, y: 6 } })
    expect(doc.state.devices).toEqual([])
    expect(() => editor.addDevice(next, router, { x: 0, y: 0 })).toThrow(LabEditError)
    const twin = { ...makeDevice('router2', 'router', []), ports: router.ports }
    expect(() => editor.addDevice(next, twin, { x: 0, y: 0 })).toThrow(/duplicateMac/)
    expect(() => editor.addDevice(doc, router, { x: Number.NaN, y: 0 })).toThrow(LabEditError)
    expect(() => editor.addDevice(doc, { ...router, kind: 'toaster' } as unknown as Device, { x: 0, y: 0 })).toThrow(/malformed/)
  })

  it('removes devices with their links and layout entries', () => {
    const doc = sampleLab()
    const next = editor.removeDevices(doc, ['sw', 'ghost'])
    expect(next.state.devices.map((d) => d.id)).not.toContain('sw')
    expect(next.state.links.map((link) => link.id)).toEqual(['link3', 'link4'])
    expect(next.layout.devices.sw).toBeUndefined()
    expect(next.annotations).toEqual(doc.annotations)
    expect(editor.removeDevices(doc, ['ghost'])).toBe(doc)
  })

  it('moves devices from a list or a record and skips unknown ids and no-ops', () => {
    const doc = sampleLab()
    const moved = editor.moveDevices(doc, [{ id: 'pc', to: { x: 1, y: 2 } }, { id: 'ghost', to: { x: 3, y: 4 } }])
    expect(moved.layout.devices.pc).toEqual({ x: 1, y: 2 })
    expect(moved.layout.devices.ghost).toBeUndefined()
    expect(editor.moveDevices(moved, { pc: { x: 1, y: 2 } })).toBe(moved)
    expect(editor.moveDevices(doc, { laptop: { x: -7, y: 9 } }).layout.devices.laptop).toEqual({ x: -7, y: 9 })
    expect(() => editor.moveDevices(doc, [{ id: 'pc', to: { x: Infinity, y: 0 } }])).toThrow(LabEditError)
  })

  it('keeps prototype-like device ids as plain layout entries', () => {
    const sample = sampleLab()
    const renamed = (id: string) => (id === 'pc' ? '__proto__' : id === 'laptop' ? 'constructor' : id)
    const doc: LabDocument = {
      ...sample,
      state: { ...sample.state, devices: sample.state.devices.map((candidate) => ({ ...candidate, id: renamed(candidate.id) })) },
      layout: { devices: Object.fromEntries(Object.entries(sample.layout.devices).filter(([id]) => id !== 'pc' && id !== 'laptop')) },
    }
    const moved = editor.moveDevices(doc, [
      { id: '__proto__', to: { x: 1, y: 2 } },
      { id: 'constructor', to: { x: 3, y: 4 } },
    ])
    const layout = moved.layout.devices
    expect(Object.getPrototypeOf(layout)).toBe(Object.prototype)
    expect(Object.hasOwn(layout, '__proto__')).toBe(true)
    expect(Object.getOwnPropertyDescriptor(layout, '__proto__')?.value).toEqual({ x: 1, y: 2 })
    expect(Object.getOwnPropertyDescriptor(layout, 'constructor')?.value).toEqual({ x: 3, y: 4 })
    expect(Object.keys(layout).slice(0, -2)).toEqual(Object.keys(doc.layout.devices))
  })

  it('renames a device (user content, kept verbatim)', () => {
    const doc = sampleLab()
    expect(device(editor.renameDevice(doc, 'pc', '  Kasa PC  '), 'pc').name).toBe('  Kasa PC  ')
    expect(editor.renameDevice(doc, 'ghost', 'x')).toBe(doc)
    expect(editor.renameDevice(doc, 'pc', 'pc')).toBe(doc)
  })

  it('updateDevice drops cables on removed ports', () => {
    const doc = sampleLab()
    const sw = withPorts(device(doc, 'sw'), (ports) => ports.filter((port) => port.id !== 'Fa0/1'))
    const next = editor.updateDevice(doc, sw)
    expect(device(next, 'sw')).toEqual(sw)
    expect(next.state.links.map((link) => link.id)).toEqual(['link2', 'link3', 'link4'])
    expect(editor.deviceUpdateProblems(doc, sw)).toEqual([])
  })

  it('updateDevice refuses changes that would break a cable or the device', () => {
    const doc = sampleLab()
    const fiber = withPorts(device(doc, 'pc'), (ports) =>
      ports.map((port) => (port.id === 'eth0' ? { ...port, medium: 'fiber' } : port)),
    )
    expect(editor.updateDevice(doc, fiber)).toBe(doc)
    expect(editor.deviceUpdateProblems(doc, fiber)).toEqual([{ code: 'invalidLink', linkId: 'link1', reason: 'cableDoesNotFitPort' }])

    const vlan = withPorts(device(doc, 'sw'), (ports) =>
      ports.map((port) => (port.role === 'switched' ? { ...port, l2: { ...port.l2, accessVlan: 5000 } } : port)),
    )
    expect(editor.updateDevice(doc, vlan)).toBe(doc)
    expect(editor.deviceUpdateProblems(doc, vlan).map((problem) => problem.code)).toContain('vlanOutOfRange')
    expect(editor.updateDevice(doc, { ...device(doc, 'pc'), id: 'ghost' })).toBe(doc)
  })

  it('updateDevice refuses auto-MDIX off on both ends with the wrong cable', () => {
    const base = sampleLab()
    const state = updatePort(base.state, 'pc', 'eth0', (port) => ({ ...port, autoMdix: false }))
    const doc = { ...base, state }
    const sw = withPorts(device(doc, 'sw'), (ports) =>
      ports.map((port) => (port.id === 'Fa0/1' ? { ...port, autoMdix: false, pinout: 'mdi' } : port)),
    )
    expect(editor.deviceUpdateProblems(doc, sw)).toEqual([{ code: 'invalidLink', linkId: 'link1', reason: 'crossoverRequired' }])
    const fine = withPorts(device(doc, 'sw'), (ports) => ports.map((port) => (port.id === 'Fa0/1' ? { ...port, autoMdix: false } : port)))
    expect(editor.updateDevice(doc, fine)).not.toBe(doc)
  })
})

describe('LabEditor links', () => {
  it('connects when CableRules agrees and passes refusals through', () => {
    const doc = editor.removeDevices(sampleLab(), [])
    const link = { id: editor.nextLinkId(doc), a: { deviceId: 'sw2', portId: 'Gi0/1' }, b: { deviceId: 'sw', portId: 'Gi0/1' }, connected: true, cable: 'fiber' } as const
    const result = editor.connect(doc, link)
    expect(result.ok && result.doc.state.links.at(-1)).toEqual(link)
    expect(editor.connect(doc, { ...link, cable: 'copperCross' })).toEqual({ ok: false, refusal: 'cableDoesNotFitPort', side: 'a' })
    expect(editor.connect(doc, { ...link, b: { deviceId: 'sw2', portId: 'Fa0/1' } })).toEqual({ ok: false, refusal: 'sameDevice' })
    expect(() => editor.connect(doc, { ...link, id: 'link1' })).toThrow(LabEditError)
  })

  it('disconnects and plugs / unplugs', () => {
    const doc = sampleLab()
    expect(editor.disconnect(doc, 'link1').state.links.map((link) => link.id)).toEqual(['link2', 'link3', 'link4'])
    expect(editor.disconnect(doc, 'ghost')).toBe(doc)
    const unplugged = editor.setLinkConnected(doc, 'link1', false)
    expect(unplugged.state.links[0]?.connected).toBe(false)
    expect(editor.setLinkConnected(unplugged, 'link1', false)).toBe(unplugged)
  })
})

describe('LabEditor annotations, meta and ids', () => {
  it('adds, updates and removes annotations', () => {
    const doc = sampleLab()
    const id = editor.nextAnnotationId(doc)
    expect(id).toBe('annotation2')
    const box = { id, type: 'rectangle', color: 'green', at: { x: 0, y: 0 }, width: 100, height: 50, filled: true } as const
    const added = editor.addAnnotation(doc, box)
    expect(added.annotations).toHaveLength(2)
    expect(() => editor.addAnnotation(added, box)).toThrow(LabEditError)
    expect(() => editor.addAnnotation(doc, { ...box, width: -1 })).toThrow(/malformed/)
    const updated = editor.updateAnnotation(added, { ...box, label: 'Mutfak' })
    expect(updated.annotations[1]).toMatchObject({ label: 'Mutfak' })
    expect(editor.updateAnnotation(doc, { ...box, id: 'ghost' })).toBe(doc)
    expect(editor.removeAnnotation(updated, id).annotations).toEqual(doc.annotations)
    expect(editor.removeAnnotation(doc, 'ghost')).toBe(doc)
  })

  it('edits title, notes and viewport', () => {
    const doc = sampleLab()
    expect(editor.updateMeta(doc, { title: 'Yeni' }).meta).toMatchObject({ title: 'Yeni', createdAt: doc.meta.createdAt })
    expect(editor.setNotes(doc, doc.notes)).toBe(doc)
    expect(editor.setNotes(doc, 'x').notes).toBe('x')
    expect(editor.setViewport(doc, undefined).layout).toEqual({ devices: doc.layout.devices })
    expect(editor.setViewport(doc, { x: 1, y: 2, zoom: 2 }).layout.viewport).toEqual({ x: 1, y: 2, zoom: 2 })
  })

  it('proposes readable camelCase ids', () => {
    let doc = createEmptyLab()
    expect(editor.nextDeviceId(doc, 'router')).toBe('router1')
    doc = editor.addDevice(doc, makeDevice('router1', 'router', []), { x: 0, y: 0 })
    doc = editor.addDevice(doc, makeDevice('router7', 'router', []), { x: 0, y: 0 })
    doc = editor.addDevice(doc, makeDevice('wirelessRouter1', 'wirelessRouter', []), { x: 0, y: 0 })
    expect(editor.nextDeviceId(doc, 'router')).toBe('router8')
    expect(editor.nextDeviceId(doc, 'l3Switch')).toBe('l3Switch1')
    expect(editor.nextDeviceId(doc, 'switch')).toBe('switch1')
    expect(editor.nextLinkId(sampleLab())).toBe('link5')
    expect(invariants.violations(doc.state)).toEqual([])
  })

  it('never mutates its input', () => {
    const doc = sampleLab()
    const snapshot = JSON.stringify(doc)
    editor.removeDevices(doc, ['pc'])
    editor.moveDevices(doc, { pc: { x: 9, y: 9 } })
    editor.updateDevice(doc, withPorts(device(doc, 'sw'), (ports) => ports.slice(1)))
    editor.connect(doc, { id: 'link9', a: { deviceId: 'sw2', portId: 'Fa0/1' }, b: { deviceId: 'pc', portId: 'RS232' }, connected: true, cable: 'console' })
    editor.addDevice(doc, makeDevice('hub1', 'hub', [switchPort('p1')]), { x: 0, y: 0 })
    expect(JSON.stringify(doc)).toBe(snapshot)
  })
})

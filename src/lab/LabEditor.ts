// Pure, immutable edits of a LabDocument (MODEL_V2 "Cross-agent APIs"). Every method returns a new
// document, or the SAME document object when nothing changed or a user edit is refused, so LabHistory
// can skip no-ops. Results always pass zod and StateInvariants:
// - programmer errors (duplicate ids, malformed objects, non-finite positions) throw LabEditError;
// - user edits that would break the lab are refused: `connect` returns the CableRules refusal,
//   `updateDevice` returns the document unchanged (`deviceUpdateProblems` tells why).
// Unknown ids are no-ops. Annotations are free-standing (not attached to devices).
import {
  CableRules,
  StateInvariants,
  type Annotation,
  type CableRefusal,
  type CanvasPoint,
  type DeviceKindV2,
  type DeviceV2,
  type InvariantViolation,
  type LabDocument,
  type LabMeta,
  type LabViewport,
  type LinkSide,
  type LinkV2,
  type NetworkStateV2,
} from '../domain/v2'
import { deviceSchema } from './schemas/deviceSchemas'
import { annotationSchema, linkSchema } from './schemas/labDocumentSchema'

export interface DeviceMove {
  id: string
  /** New top-left position on the canvas. */
  to: CanvasPoint
}

/** A list of moves, or new positions by device id. */
export type DeviceMoves = readonly DeviceMove[] | Readonly<Record<string, CanvasPoint>>

export type LabConnectResult = { ok: true; doc: LabDocument } | { ok: false; refusal: CableRefusal; side?: LinkSide }

export type LabMetaChanges = Partial<Pick<LabMeta, 'title' | 'author' | 'description'>>

/** Misuse of the editor by calling code (never caused by user input that the UI validated). */
export class LabEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LabEditError'
  }
}

function violationKey(violation: InvariantViolation): string {
  return JSON.stringify([violation.code, violation.deviceId, violation.portId, violation.linkId, violation.reason])
}

function touches(link: LinkV2, deviceId: string): boolean {
  return link.a.deviceId === deviceId || link.b.deviceId === deviceId
}

function checkPoint(point: CanvasPoint, what: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new LabEditError(`${what}: position is not finite`)
}

function isMoveList(moves: DeviceMoves): moves is readonly DeviceMove[] {
  return Array.isArray(moves)
}

function nextNumberedId(prefix: string, used: readonly string[]): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`)
  const highest = used.reduce((max, id) => Math.max(max, Number(pattern.exec(id)?.[1] ?? 0)), 0)
  const taken = new Set(used)
  let number = highest + 1
  while (taken.has(`${prefix}${number}`)) number += 1
  return `${prefix}${number}`
}

export class LabEditor {
  private readonly cableRules = new CableRules()
  private readonly invariants = new StateInvariants()

  /** Adds a device (from PortFactory.createDevice) at `position`. */
  addDevice(doc: LabDocument, device: DeviceV2, position: CanvasPoint): LabDocument {
    if (doc.state.devices.some((existing) => existing.id === device.id)) {
      throw new LabEditError(`addDevice: device id ${device.id} is already used`)
    }
    checkPoint(position, `addDevice ${device.id}`)
    this.checkShape(deviceSchema, device, `addDevice ${device.id}`)
    const state = { ...doc.state, devices: [...doc.state.devices, device] }
    const problems = this.newViolations(doc.state, state)
    if (problems.length > 0) throw new LabEditError(`addDevice ${device.id}: ${problems.map((p) => p.code).join(', ')}`)
    return { ...doc, state, layout: { ...doc.layout, devices: { ...doc.layout.devices, [device.id]: { ...position } } } }
  }

  /** Removes devices with their links and layout entries. */
  removeDevices(doc: LabDocument, ids: readonly string[]): LabDocument {
    const removed = new Set(ids.filter((id) => doc.state.devices.some((device) => device.id === id)))
    if (removed.size === 0) return doc
    const devices = doc.state.devices.filter((device) => !removed.has(device.id))
    const links = doc.state.links.filter((link) => !removed.has(link.a.deviceId) && !removed.has(link.b.deviceId))
    const layoutDevices = Object.fromEntries(Object.entries(doc.layout.devices).filter(([id]) => !removed.has(id)))
    return { ...doc, state: { devices, links }, layout: { ...doc.layout, devices: layoutDevices } }
  }

  /** New canvas positions; moves of unknown devices are ignored. */
  moveDevices(doc: LabDocument, moves: DeviceMoves): LabDocument {
    const list: readonly DeviceMove[] = isMoveList(moves)
      ? moves
      : Object.entries(moves).map(([id, to]) => ({ id, to }))
    const known = new Set(doc.state.devices.map((device) => device.id))
    const layoutDevices = { ...doc.layout.devices }
    let changed = false
    for (const move of list) {
      checkPoint(move.to, `moveDevices ${move.id}`)
      if (!known.has(move.id)) continue
      const current = layoutDevices[move.id]
      if (current?.x === move.to.x && current.y === move.to.y) continue
      layoutDevices[move.id] = { x: move.to.x, y: move.to.y }
      changed = true
    }
    return changed ? { ...doc, layout: { ...doc.layout, devices: layoutDevices } } : doc
  }

  /** Adds a cable if CableRules accepts it; otherwise returns its refusal. Ids: nextLinkId. */
  connect(doc: LabDocument, link: LinkV2): LabConnectResult {
    if (doc.state.links.some((existing) => existing.id === link.id)) {
      throw new LabEditError(`connect: link id ${link.id} is already used`)
    }
    this.checkShape(linkSchema, link, `connect ${link.id}`)
    const check = this.cableRules.check(doc.state, link)
    if (!check.ok) return check.side === undefined ? { ok: false, refusal: check.reason } : { ok: false, refusal: check.reason, side: check.side }
    return { ok: true, doc: { ...doc, state: { ...doc.state, links: [...doc.state.links, link] } } }
  }

  /** Removes the cable. */
  disconnect(doc: LabDocument, linkId: string): LabDocument {
    if (!doc.state.links.some((link) => link.id === linkId)) return doc
    return { ...doc, state: { ...doc.state, links: doc.state.links.filter((link) => link.id !== linkId) } }
  }

  /** Plugs / unplugs a cable without removing it (it keeps reserving both ports). */
  setLinkConnected(doc: LabDocument, linkId: string, connected: boolean): LabDocument {
    const link = doc.state.links.find((candidate) => candidate.id === linkId)
    if (!link || link.connected === connected) return doc
    const links = doc.state.links.map((candidate) => (candidate.id === linkId ? { ...candidate, connected } : candidate))
    return { ...doc, state: { ...doc.state, links } }
  }

  renameDevice(doc: LabDocument, id: string, name: string): LabDocument {
    const device = doc.state.devices.find((candidate) => candidate.id === id)
    if (!device || device.name === name) return doc
    return this.withDevice(doc, { ...device, name }, doc.state.links)
  }

  /**
   * Replaces the device with the same id. Cables on ports the new device no longer has are removed
   * with it (like pulling a module). Any other problem — a cable that would no longer fit (medium,
   * wireless role, pinout with auto-MDIX off on both ends), duplicate port ids or MACs, VLANs out of
   * range — refuses the update: the same document is returned. A malformed device throws.
   */
  updateDevice(doc: LabDocument, device: DeviceV2): LabDocument {
    const next = this.planDeviceUpdate(doc, device)
    return next === null || next.problems.length > 0 ? doc : next.doc
  }

  /** Why updateDevice would refuse this device ([] = it would be applied). */
  deviceUpdateProblems(doc: LabDocument, device: DeviceV2): InvariantViolation[] {
    return this.planDeviceUpdate(doc, device)?.problems ?? []
  }

  addAnnotation(doc: LabDocument, annotation: Annotation): LabDocument {
    if (doc.annotations.some((existing) => existing.id === annotation.id)) {
      throw new LabEditError(`addAnnotation: id ${annotation.id} is already used`)
    }
    this.checkShape(annotationSchema, annotation, `addAnnotation ${annotation.id}`)
    return { ...doc, annotations: [...doc.annotations, annotation] }
  }

  /** Replaces the annotation with the same id. */
  updateAnnotation(doc: LabDocument, annotation: Annotation): LabDocument {
    if (!doc.annotations.some((existing) => existing.id === annotation.id)) return doc
    this.checkShape(annotationSchema, annotation, `updateAnnotation ${annotation.id}`)
    return { ...doc, annotations: doc.annotations.map((existing) => (existing.id === annotation.id ? annotation : existing)) }
  }

  removeAnnotation(doc: LabDocument, id: string): LabDocument {
    if (!doc.annotations.some((annotation) => annotation.id === id)) return doc
    return { ...doc, annotations: doc.annotations.filter((annotation) => annotation.id !== id) }
  }

  /** Title / author / description (user content). Timestamps are set when the lab is saved. */
  updateMeta(doc: LabDocument, changes: LabMetaChanges): LabDocument {
    return { ...doc, meta: { ...doc.meta, ...changes } }
  }

  setNotes(doc: LabDocument, notes: string): LabDocument {
    return doc.notes === notes ? doc : { ...doc, notes }
  }

  /** Stores the canvas view; undefined = fit to the devices. */
  setViewport(doc: LabDocument, viewport: LabViewport | undefined): LabDocument {
    if (viewport !== undefined) checkPoint(viewport, 'setViewport')
    const layout = { devices: doc.layout.devices }
    return { ...doc, layout: viewport === undefined ? layout : { ...layout, viewport: { ...viewport } } }
  }

  /** Readable unused id: `router1`, `switch2`, `pc3` (highest number of that kind + 1). */
  nextDeviceId(doc: LabDocument, kind: DeviceKindV2): string {
    return nextNumberedId(kind, doc.state.devices.map((device) => device.id))
  }

  /** `link1`, `link2`, … */
  nextLinkId(doc: LabDocument): string {
    return nextNumberedId('link', doc.state.links.map((link) => link.id))
  }

  /** `annotation1`, `annotation2`, … */
  nextAnnotationId(doc: LabDocument): string {
    return nextNumberedId('annotation', doc.annotations.map((annotation) => annotation.id))
  }

  private planDeviceUpdate(doc: LabDocument, device: DeviceV2): { doc: LabDocument; problems: InvariantViolation[] } | null {
    if (!doc.state.devices.some((existing) => existing.id === device.id)) return null
    this.checkShape(deviceSchema, device, `updateDevice ${device.id}`)
    const portIds = new Set(device.ports.map((port) => port.id))
    const keepsPort = (link: LinkV2): boolean =>
      [link.a, link.b].every((end) => end.deviceId !== device.id || portIds.has(end.portId))
    const links = doc.state.links.filter((link) => !touches(link, device.id) || keepsPort(link))
    const next = this.withDevice(doc, device, links)
    return { doc: next, problems: this.newViolations(doc.state, next.state) }
  }

  private withDevice(doc: LabDocument, device: DeviceV2, links: LinkV2[]): LabDocument {
    const devices = doc.state.devices.map((existing) => (existing.id === device.id ? device : existing))
    return { ...doc, state: { devices, links } }
  }

  private newViolations(before: NetworkStateV2, after: NetworkStateV2): InvariantViolation[] {
    const known = new Set(this.invariants.violations(before).map(violationKey))
    return this.invariants.violations(after).filter((violation) => !known.has(violationKey(violation)))
  }

  private checkShape(schema: { safeParse(value: unknown): { success: boolean } }, value: unknown, what: string): void {
    if (!schema.safeParse(value).success) throw new LabEditError(`${what}: malformed object`)
  }
}

/** Shared instance (the editor is stateless). */
export const labEditor = new LabEditor()

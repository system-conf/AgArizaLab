// Pure updates of the canvas selection (devices, links, annotations), immutable.
import type { LabDocument } from '../../../domain'
import { EMPTY_SELECTION, type WorkspaceSelection } from './canvasTypes'
import { annotationIdOf } from './flowElements'

type Key = keyof WorkspaceSelection

function toggled(ids: readonly string[], id: string, selected: boolean): readonly string[] {
  if (selected) return ids.includes(id) ? ids : [...ids, id]
  return ids.includes(id) ? ids.filter((candidate) => candidate !== id) : ids
}

export class SelectionModel {
  /** A node (device or annotation) was selected or deselected on the canvas. */
  static node(selection: WorkspaceSelection, nodeId: string, selected: boolean): WorkspaceSelection {
    const annotationId = annotationIdOf(nodeId)
    return annotationId === null
      ? SelectionModel.set(selection, 'deviceIds', nodeId, selected)
      : SelectionModel.set(selection, 'annotationIds', annotationId, selected)
  }

  static link(selection: WorkspaceSelection, linkId: string, selected: boolean): WorkspaceSelection {
    return SelectionModel.set(selection, 'linkIds', linkId, selected)
  }

  static all(doc: LabDocument): WorkspaceSelection {
    return {
      deviceIds: doc.state.devices.map((device) => device.id),
      linkIds: doc.state.links.map((link) => link.id),
      annotationIds: doc.annotations.filter((annotation) => annotation.type !== 'line').map((annotation) => annotation.id),
    }
  }

  static only(key: Key, id: string): WorkspaceSelection {
    return { ...EMPTY_SELECTION, [key]: [id] }
  }

  /** Drops ids that no longer exist in the document (after delete, undo, …). */
  static prune(selection: WorkspaceSelection, doc: LabDocument): WorkspaceSelection {
    const devices = new Set(doc.state.devices.map((device) => device.id))
    const links = new Set(doc.state.links.map((link) => link.id))
    const annotations = new Set(doc.annotations.map((annotation) => annotation.id))
    const deviceIds = selection.deviceIds.filter((id) => devices.has(id))
    const linkIds = selection.linkIds.filter((id) => links.has(id))
    const annotationIds = selection.annotationIds.filter((id) => annotations.has(id))
    const unchanged =
      deviceIds.length === selection.deviceIds.length &&
      linkIds.length === selection.linkIds.length &&
      annotationIds.length === selection.annotationIds.length
    return unchanged ? selection : { deviceIds, linkIds, annotationIds }
  }

  static count(selection: WorkspaceSelection): number {
    return selection.deviceIds.length + selection.linkIds.length + selection.annotationIds.length
  }

  static isEmpty(selection: WorkspaceSelection): boolean {
    return SelectionModel.count(selection) === 0
  }

  private static set(selection: WorkspaceSelection, key: Key, id: string, selected: boolean): WorkspaceSelection {
    const next = toggled(selection[key], id, selected)
    return next === selection[key] ? selection : { ...selection, [key]: next }
  }
}

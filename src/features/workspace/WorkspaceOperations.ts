// Multi-step document edits of the workspace, built from LabEditor calls so each is one undo step.
import type { CanvasPoint, LabDocument, TextAnnotation } from '../../domain/v2'
import type { WorkspaceSelection } from './canvas/canvasTypes'
import { annotationIdOf, moveAnnotation } from './canvas/flowElements'
import type { DeviceMove, LabEditor } from './labServices'

/** A node moved on the canvas (device id or annotation node id). */
export interface NodeMove {
  nodeId: string
  to: CanvasPoint
}

export class WorkspaceOperations {
  private readonly editor: LabEditor

  constructor(editor: LabEditor) {
    this.editor = editor
  }

  /** Removes the selected devices (with their cables), cables and annotations. */
  deleteSelection(doc: LabDocument, selection: WorkspaceSelection): LabDocument {
    let next = doc
    const remainingLinks = new Set(next.state.links.map((link) => link.id))
    for (const linkId of selection.linkIds) {
      if (remainingLinks.has(linkId)) next = this.editor.disconnect(next, linkId)
    }
    if (selection.deviceIds.length > 0) next = this.editor.removeDevices(next, selection.deviceIds)
    for (const annotationId of selection.annotationIds) next = this.editor.removeAnnotation(next, annotationId)
    return next
  }

  /** Moves devices and annotations together (drag of a mixed selection, align, nudge). */
  move(doc: LabDocument, moves: readonly NodeMove[]): LabDocument {
    const deviceMoves: DeviceMove[] = []
    let next = doc
    for (const move of moves) {
      const annotationId = annotationIdOf(move.nodeId)
      if (annotationId === null) {
        deviceMoves.push({ id: move.nodeId, to: move.to })
        continue
      }
      const annotation = next.annotations.find((candidate) => candidate.id === annotationId)
      if (annotation) next = this.editor.updateAnnotation(next, moveAnnotation(annotation, move.to))
    }
    return deviceMoves.length > 0 ? this.editor.moveDevices(next, deviceMoves) : next
  }

  /** Adds a text note with the given id (LabEditor.nextAnnotationId) at `at`. */
  addNote(doc: LabDocument, id: string, at: CanvasPoint, text: string): LabDocument {
    const note: TextAnnotation = { id, type: 'text', at, text, size: 'medium', color: 'amber' }
    return this.editor.addAnnotation(doc, note)
  }

  /** Saves a note's text; blank text removes the note. */
  setNoteText(doc: LabDocument, annotationId: string, text: string): LabDocument {
    const annotation = doc.annotations.find((candidate) => candidate.id === annotationId)
    if (!annotation || annotation.type !== 'text') return doc
    if (text.trim() === '') return this.editor.removeAnnotation(doc, annotationId)
    return annotation.text === text ? doc : this.editor.updateAnnotation(doc, { ...annotation, text })
  }
}

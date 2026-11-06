// Lab files on disk: export downloads `<title>.agl.json`, import reads a picked File through the
// LabSerializer (so v1 networks / exercises and older formats are upgraded too).
import type { LabDocument } from '../domain'
import { localizedMessage } from '../i18n/messageKeys'
import { LAB_FILE_EXTENSION } from './labFileTypes'
import { labSerializer, type LabParseResult, type LabSerializer } from './LabSerializer'

export { LAB_FILE_ACCEPT, LAB_FILE_EXTENSION } from './labFileTypes'

const MAX_NAME_LENGTH = 60

/** File name from the title: letters and digits kept (any script), other runs become '_'. */
export function labFileName(doc: LabDocument): string {
  const base = doc.meta.title
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
  return `${base === '' ? 'lab' : base}${LAB_FILE_EXTENSION}`
}

/** Starts a download of the lab as pretty JSON. Browser only. */
export function exportLabFile(doc: LabDocument, serializer: LabSerializer = labSerializer): void {
  const blob = new Blob([serializer.serialize(doc)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = labFileName(doc)
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  // Revoke after the click has been handled; revoking synchronously cancels the download in some browsers.
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Reads and validates a picked file. Never throws: read errors become `lab:import.readFailed`. */
export async function importLabFile(file: Blob, serializer: LabSerializer = labSerializer): Promise<LabParseResult> {
  let text: string
  try {
    text = await file.text()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, errors: [localizedMessage('lab:import.readFailed', { detail })] }
  }
  return serializer.parse(text)
}

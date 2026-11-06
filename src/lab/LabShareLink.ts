// Share links: the whole lab, compressed (lz-string, URL-safe), in the URL hash `#lab=…`. The hash
// never reaches a server; the limit keeps links usable in chat apps and mail.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { LabDocument } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { localizedMessage } from '../i18n/messageKeys'
import { labSerializer, type LabParseResult, type LabSerializer } from './LabSerializer'
import { MAX_LAB_TEXT_SIZE } from './schemas/labLimits'
import { SHARE_HASH_PREFIX } from './shareHashPrefix'

export { SHARE_HASH_PREFIX } from './shareHashPrefix'

/** Longest share hash (characters, prefix included) we hand out. */
export const MAX_SHARE_HASH_LENGTH = 32_000

export type ShareHashResult = { ok: true; hash: string } | { ok: false; errors: LocalizedMessage[] }
export type ShareUrlResult = { ok: true; url: string } | { ok: false; errors: LocalizedMessage[] }

export class LabShareLink {
  private readonly serializer: LabSerializer
  private readonly maxLength: number
  private readonly maxTextSize: number

  constructor(serializer: LabSerializer = labSerializer, maxLength: number = MAX_SHARE_HASH_LENGTH, maxTextSize: number = MAX_LAB_TEXT_SIZE) {
    this.serializer = serializer
    this.maxLength = maxLength
    this.maxTextSize = maxTextSize
  }

  /** `#lab=<compressed document>`, or `lab:share.tooLarge`. */
  encode(doc: LabDocument): ShareHashResult {
    const hash = `${SHARE_HASH_PREFIX}${compressToEncodedURIComponent(this.serializer.serializeCompact(doc))}`
    if (hash.length > this.maxLength) {
      return { ok: false, errors: [localizedMessage('lab:share.tooLarge', { size: hash.length, limit: this.maxLength })] }
    }
    return { ok: true, hash }
  }

  /** Full link: `baseUrl` without its hash + the share hash. */
  url(doc: LabDocument, baseUrl: string): ShareUrlResult {
    const encoded = this.encode(doc)
    if (!encoded.ok) return encoded
    const hashStart = baseUrl.indexOf('#')
    return { ok: true, url: `${hashStart === -1 ? baseUrl : baseUrl.slice(0, hashStart)}${encoded.hash}` }
  }

  /**
   * null when `hash` carries no lab; otherwise the parsed lab or why it cannot be opened. Hashes
   * longer than we hand out are refused before decompressing, and so is decompressed text above
   * `maxTextSize` (MAX_LAB_TEXT_SIZE; a hostile link must not make the tab build a huge string).
   */
  decode(hash: string): LabParseResult | null {
    const normalized = hash.startsWith('#') ? hash : `#${hash}`
    if (!normalized.startsWith(SHARE_HASH_PREFIX)) return null
    if (normalized.length > this.maxLength) {
      return { ok: false, errors: [localizedMessage('lab:share.linkTooLong', { size: normalized.length, limit: this.maxLength })] }
    }
    const json = decompressFromEncodedURIComponent(normalized.slice(SHARE_HASH_PREFIX.length))
    if (json === null || json === '' || json.length > this.maxTextSize) return { ok: false, errors: [localizedMessage('lab:share.corrupt')] }
    return this.serializer.parse(json)
  }
}

export const labShareLink = new LabShareLink()

/** The lab in the current page URL (`#lab=…`), or null. Call once on load. */
export function readSharedLabFromLocation(): LabParseResult | null {
  return labShareLink.decode(window.location.hash)
}

/** Removes `#lab=…` from the address bar after the lab was opened (no reload, no history entry). */
export function clearShareHash(): void {
  if (!window.location.hash.startsWith(SHARE_HASH_PREFIX)) return
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
}

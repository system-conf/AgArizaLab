// A `#lab=…` share hash arriving at the workspace: the one the page was opened with, or one pasted
// into the open tab later (hashchange). Each arrival is decoded once (React StrictMode runs effects
// twice) and the hash is removed from the address bar; the caller opens the lab or reports why not.
import type { LabDocument } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { clearShareHash, labShareLink, type LabShareLink } from './LabShareLink'

export type SharedLabOutcome =
  | { kind: 'none' }
  | { kind: 'opened'; doc: LabDocument }
  | { kind: 'failed'; errors: readonly LocalizedMessage[] }

const NONE: SharedLabOutcome = { kind: 'none' }

export class SharedLabInbox {
  private readonly shareLink: Pick<LabShareLink, 'decode'>
  private readonly clearHash: () => void
  /** The hash handled last; forgotten when the app reports no hash, so the same link can come again. */
  private handled: string | null = null
  private openedAny = false

  constructor(shareLink: Pick<LabShareLink, 'decode'> = labShareLink, clearHash: () => void = clearShareHash) {
    this.shareLink = shareLink
    this.clearHash = clearHash
  }

  /** A shared lab was opened since this inbox was created (the autosave must not replace it). */
  get hasOpened(): boolean {
    return this.openedAny
  }

  /** The app's current share hash (null = none). A new hash is decoded and cleared from the URL. */
  receive(hash: string | null): SharedLabOutcome {
    if (hash === null) {
      this.handled = null
      return NONE
    }
    if (hash === this.handled) return NONE
    this.handled = hash
    const result = this.shareLink.decode(hash)
    this.clearHash()
    if (result?.ok === true) {
      this.openedAny = true
      return { kind: 'opened', doc: result.doc }
    }
    return { kind: 'failed', errors: result?.ok === false ? result.errors : [] }
  }
}

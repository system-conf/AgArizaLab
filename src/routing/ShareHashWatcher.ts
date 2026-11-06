// Watches the address bar for `#lab=…` share hashes: the one the page was opened with and links
// pasted into the open tab later (only the hash changes, so the page does not reload).
import { isShareHash } from '../lab/shareHashPrefix'

/** The part of the browser the watcher needs (location.hash + hashchange); fakeable in tests. */
export interface HashPort {
  hash(): string
  /** Calls `listener` when the hash changes; returns the unsubscribe function. */
  onHashChange(listener: () => void): () => void
}

export class ShareHashWatcher {
  private readonly port: HashPort

  constructor(port: HashPort) {
    this.port = port
  }

  static browser(): ShareHashWatcher {
    return new ShareHashWatcher({
      hash: () => window.location.hash,
      onHashChange: (listener) => {
        window.addEventListener('hashchange', listener)
        return () => window.removeEventListener('hashchange', listener)
      },
    })
  }

  /** The share hash in the URL now, or null. */
  current(): string | null {
    const hash = this.port.hash()
    return isShareHash(hash) ? hash : null
  }

  /** Calls `listener` with every share hash that appears later; other hash changes are ignored. */
  watch(listener: (hash: string) => void): () => void {
    return this.port.onHashChange(() => {
      const hash = this.current()
      if (hash !== null) listener(hash)
    })
  }
}

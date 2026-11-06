// The share-link hash marker without the compression / parsing code (safe for the landing chunk).

export const SHARE_HASH_PREFIX = '#lab='

/** True when `hash` (e.g. `window.location.hash`) carries a shared lab. */
export function isShareHash(hash: string): boolean {
  return hash.startsWith(SHARE_HASH_PREFIX)
}

/** Characters Windows, macOS and Linux file names cannot hold (control characters too). */
const UNSAFE_FILE_CHARACTERS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|'])

/** A file name from the lab title ('' → `fallback`), with the .pcap extension. */
export function pcapFileName(title: string, fallback: string): string {
  const safe = [...title].map((character) => (UNSAFE_FILE_CHARACTERS.has(character) || character.charCodeAt(0) < 32 ? '_' : character))
  const base = safe.join('').trim().slice(0, 80)
  return `${base === '' ? fallback : base}.pcap`
}

/** Hands the bytes to the browser as a download. */
export function downloadPcap(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes)
  const url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/vnd.tcpdump.pcap' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoked after the click has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

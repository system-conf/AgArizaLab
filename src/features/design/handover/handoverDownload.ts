/** Characters Windows, macOS and Linux file names cannot hold (control characters too). */
const UNSAFE_FILE_CHARACTERS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|'])

/** A Markdown file name from the lab title ('' → `fallback`). */
export function handoverFileName(title: string, fallback: string): string {
  const safe = [...title].map((character) => (UNSAFE_FILE_CHARACTERS.has(character) || character.charCodeAt(0) < 32 ? '_' : character))
  const base = safe.join('').trim().slice(0, 80)
  return `${base === '' ? fallback : base}.md`
}

/** Hands the Markdown text to the browser as a download. Browser only. */
export function downloadMarkdown(markdown: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoked after the click has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

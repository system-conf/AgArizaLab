/** Hands plain text to the browser as a download. Browser only. */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoked after the click has started the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

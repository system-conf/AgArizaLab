// TEMPORARY (wave 2): local format checks for the settings forms.
// Wave 3: replace these with the engine's Ipv4 helpers (src/engine/Ipv4.ts) so the
// UI and the engine agree on exactly one definition of a valid address and mask.

const octetPattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

/** True for dotted-quad IPv4 text such as '192.168.1.10'. */
export function isIpv4Format(text: string): boolean {
  const parts = text.split('.')
  return parts.length === 4 && parts.every((part) => octetPattern.test(part))
}

/** True for a contiguous subnet mask such as '255.255.255.0'. */
export function isSubnetMaskFormat(text: string): boolean {
  if (!isIpv4Format(text)) return false
  const bits = text
    .split('.')
    .map((part) => Number(part).toString(2).padStart(8, '0'))
    .join('')
  return /^1+0*$/.test(bits)
}

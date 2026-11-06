// Upper bounds of a lab document. Lab files and share links come from strangers, so every list and
// string the schemas accept is capped; the UI's input fields use the same numbers (maxLength) so a
// lab built in the app always loads again. Far above anything a real lab needs.

export const LAB_LIMITS = {
  devices: 500,
  links: 2000,
  annotations: 500,
  portsPerDevice: 128,
  subInterfacesPerPort: 256,
  /** VLAN databases and allowed-VLAN lists (VLAN ids are 1..4094). */
  vlans: 4094,
  /** Any other list (DNS servers, routes, pools, leases, records, SSIDs, app links …). */
  listItems: 1000,
  /** Device, port, link, annotation and other ids we reference. */
  idLength: 64,
  /** Names, titles, labels, addresses and other one-line values. */
  nameLength: 200,
  /** Descriptions and annotation text. */
  textLength: 2000,
  notesLength: 20_000,
} as const

/** Ids that would collide with Object.prototype members when used as object keys. */
export const RESERVED_IDS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

/** Largest lab file or decompressed share text we read (bytes of a file, characters of text). */
export const MAX_LAB_TEXT_SIZE = 5 * 1024 * 1024

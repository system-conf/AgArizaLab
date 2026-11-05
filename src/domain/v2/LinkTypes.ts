// v2 cables and links (docs/MODEL_V2.md §6). Which cable may join which ports: CableRules.ts.

/** Cables without extra settings. */
export type PlainCableType = 'copperStraight' | 'copperCross' | 'fiber' | 'console' | 'coaxial'

/**
 * Cable stored on a link. 'wireless' is an association between a client NIC and a radio, drawn
 * like a cable. 'auto' is not a cable but a builder tool (CableTool) resolved by CableRules.autoCable.
 */
export type CableType = PlainCableType | 'serial' | 'wireless'

/** What the cable tool of the workspace can pick. */
export type CableTool = CableType | 'auto'

export type LinkSide = 'a' | 'b'

export interface LinkEndV2 {
  deviceId: string
  /** A physical port id of that device (never a sub-interface or SVI). */
  portId: string
}

/** Cable plus the settings only some cables have. */
export type LinkCable =
  | { cable: PlainCableType }
  /** `dceEnd`: the end with the DCE connector, which must provide the clock rate. */
  | { cable: 'serial'; dceEnd: LinkSide }
  /** `ssid`: the network the client joined; it decides the VLAN on the radio side. */
  | { cable: 'wireless'; ssid: string }

interface LinkBase {
  /** camelCase, unique in the lab. */
  id: string
  a: LinkEndV2
  b: LinkEndV2
  /** false = cable unplugged (the link and its port reservations stay). */
  connected: boolean
}

export type LinkV2 = LinkBase & LinkCable

/** A cable the user wants to add, checked by CableRules before it becomes a LinkV2. */
export type CableRequest = { a: LinkEndV2; b: LinkEndV2 } & LinkCable

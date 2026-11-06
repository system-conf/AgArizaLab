// Network documentation export ("handover pack", "Teslim dosyası"; BACKLOG item 7): data of the
// document built by HandoverPack, and the generic page layout (HandoverLayout) the printable page
// and the Markdown export render. Technical values (addresses, port ids, VLAN numbers) and user
// content (device names, lab title) are plain strings; everything else is a LocalizedMessage.
import type { AddressingMode, AddressRange, CableType, DeviceKind } from '../../domain'
import type { LocalizedMessage } from '../../domain/Messages'

/** A cell or value: plain text (technical value, user content) or a message to translate. */
export type HandoverText = string | LocalizedMessage

/** Renders a message in the active language, e.g. `useMessageTranslator()` or `(m) => translateMessage(t, m)`. */
export type MessageTranslator = (message: LocalizedMessage) => string

/** A device, by id and name (names are user content or localized brief names). */
export interface DeviceRef {
  deviceId: string
  deviceName: string
}

/** Several ports of one device, in natural order ('Fa0/2', 'Fa0/10'). */
export interface DevicePorts extends DeviceRef {
  portIds: string[]
}

// ----- Topology summary -----------------------------------------------------------------------

export interface KindTally {
  kind: DeviceKind
  count: number
  label: LocalizedMessage
}

export interface CableTally {
  cable: CableType
  count: number
  label: LocalizedMessage
}

/** A labelled zone of the canvas (rectangle / ellipse annotation) and the devices inside it. */
export interface ZoneSummary {
  annotationId: string
  label: string
  deviceIds: string[]
}

/** Result of the brief, when the pack is built for a design brief. */
export interface BriefSummary {
  passed: number
  total: number
  solved: boolean
  /** Price of the added equipment (price units). */
  cost: number
  budget?: number
}

export interface TopologySummary {
  devices: number
  /** Powered-off devices. */
  devicesOff: number
  links: number
  unpluggedLinks: number
  subnets: number
  vlans: number
  byKind: KindTally[]
  byCable: CableTally[]
  zones: ZoneSummary[]
  brief?: BriefSummary
}

// ----- IP plan ---------------------------------------------------------------------------------

/** An interface that answers on an address. */
export interface AddressHolder extends DeviceRef {
  interfaceId: string
  address: string
  addressing: AddressingMode
}

/** One DHCP pool serving the subnet. */
export interface DhcpScope extends DeviceRef {
  poolId: string
  /** First and last address handed out (the pool range, else every host address of the network). */
  start: string
  end: string
  /** Device-wide exclusions that touch the subnet. */
  excluded: AddressRange[]
  defaultRouter: string
  dnsServers: string[]
}

/** One subnet of the IP plan, sorted by network address. */
export interface SubnetRow {
  /** CIDR, e.g. '192.168.10.0/24'. */
  network: string
  mask: string
  /** VLANs the subnet's interfaces sit in (sub-interfaces, SVIs, access ports, SSIDs); [] = untagged / unknown. */
  vlans: number[]
  /** Router-side interfaces (routed ports, sub-interfaces, SVIs) in the subnet; else the pools' default router. */
  gateways: AddressHolder[]
  dhcp: DhcpScope[]
  /** Every addressed interface in the subnet, gateways included. */
  members: AddressHolder[]
  /** Host addresses the subnet offers (/31, /32: 2 and 1). */
  usable: number
}

// ----- VLANs -----------------------------------------------------------------------------------

export interface VlanRow {
  vlan: number
  /** Names of the VLAN database entries (distinct, first seen first). */
  names: string[]
  /** CIDRs of the subnets in this VLAN (from the IP plan). */
  subnets: string[]
  /** Cabled access ports in the VLAN, per switch. */
  accessPorts: DevicePorts[]
  /** Cabled trunks carrying the VLAN, per switch. */
  trunkPorts: DevicePorts[]
  /** Addressed layer-3 interfaces in the VLAN: router sub-interfaces, SVIs (gateway or management). */
  interfaces: Array<DeviceRef & { interfaceId: string; address: string }>
  /** SSIDs bridged into the VLAN. */
  ssids: Array<DeviceRef & { ssid: string }>
}

// ----- Devices and cabling ---------------------------------------------------------------------

export interface DeviceRow extends DeviceRef {
  kind: DeviceKind
  kindLabel: LocalizedMessage
  modelId: string
  /** Catalog model name (message), or the model id when the model is unknown. */
  model: HandoverText
  /** Address the device is reached on ('a.b.c.d/n'); absent = none. */
  managementIp?: string
  powered: boolean
  /** Label of the zone (annotation) the device sits in. */
  zone?: string
  /** Customer device of the brief's starting lab; absent without a brief. */
  provided?: boolean
  ports: { used: number; total: number }
}

export interface CableEnd extends DeviceRef {
  portId: string
  /** Switchport mode of a switched port ("access, VLAN 10" / "trunk, all VLANs"). */
  mode?: LocalizedMessage
}

/** One cable, oriented from the network side (switch, router) to what is plugged in. */
export interface CableRow {
  linkId: string
  from: CableEnd
  to: CableEnd
  cable: CableType
  cableLabel: LocalizedMessage
  connected: boolean
  /** Wireless association: the SSID. */
  ssid?: string
}

// ----- Configuration ---------------------------------------------------------------------------

/** One configured item of a device: label and value. */
export interface ConfigItem {
  label: LocalizedMessage
  value: HandoverText
}

export interface DeviceConfig extends DeviceRef {
  kind: DeviceKind
  items: ConfigItem[]
}

// ----- Open issues -----------------------------------------------------------------------------

export type LabIssueCode = 'deviceOff' | 'linkUnplugged' | 'notCabled' | 'noAddress' | 'dhcpNoAnswer' | 'duplicateAddress' | 'noGateway'

export type OpenIssue =
  /** A requirement of the brief that is not met (hidden ones included). */
  | { source: 'requirement'; requirementId: string; hidden: boolean; message: LocalizedMessage; qualifier?: LocalizedMessage }
  /** Something unfinished in any lab. `subjectId` = device or link id (the address for duplicates). */
  | { source: 'lab'; code: LabIssueCode; subjectId: string; message: LocalizedMessage }

// ----- Document --------------------------------------------------------------------------------

export interface HandoverMeta {
  /** Lab title (user content); '' = untitled. */
  title: string
  author?: string
  description?: string
  createdAt: string
  updatedAt: string
  /** Brief the lab was built for, when given. */
  briefId?: string
}

/** The handover pack of one lab. Built from the lab with every DHCP client settled (DhcpSettler). */
export interface HandoverDocument {
  meta: HandoverMeta
  summary: TopologySummary
  ipPlan: SubnetRow[]
  vlans: VlanRow[]
  devices: DeviceRow[]
  cabling: CableRow[]
  configs: DeviceConfig[]
  issues: OpenIssue[]
}

// ----- Page layout -----------------------------------------------------------------------------

export type HandoverSectionId = 'summary' | 'ipPlan' | 'vlans' | 'devices' | 'cabling' | 'configs' | 'issues'

/** Texts rendered one after the other, separated by a space (e.g. requirement + "… even when X is down"). */
export type HandoverLine = HandoverText[]

export type HandoverBlock =
  | { type: 'table'; caption?: HandoverText; columns: LocalizedMessage[]; rows: HandoverText[][] }
  /** Label / value pairs (a definition list). */
  | { type: 'facts'; caption?: HandoverText; items: Array<{ label: HandoverText; value: HandoverText }> }
  /** Bullet list. */
  | { type: 'list'; caption?: HandoverText; items: HandoverLine[] }
  | { type: 'paragraph'; text: HandoverText }

export interface HandoverSection {
  id: HandoverSectionId
  title: LocalizedMessage
  /** Empty section: `blocks` holds one paragraph saying so. */
  blocks: HandoverBlock[]
}

/** The printable page: heading, meta facts and the sections in order. */
export interface HandoverPage {
  heading: LocalizedMessage
  /** Lab title, or the untitled message. */
  title: HandoverText
  meta: Array<{ label: LocalizedMessage; value: HandoverText }>
  sections: HandoverSection[]
}

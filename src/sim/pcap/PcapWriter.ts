// Classic libpcap file (link type 1, Ethernet) of the simulation's wire transmissions, for Wireshark
// (docs/BACKLOG.md item 4). Timestamps are virtual time: `startEpochMs` + departAt. Pure: the caller
// passes the start (the UI may use the export moment); the simulator never reads the wall clock.
import type { SimTransmission } from '../contract/SimEvent'
import { ByteWriter } from './ByteWriter'
import { FrameEncoder } from './FrameEncoder'

export const PCAP_MAGIC = 0xa1b2c3d4
export const PCAP_LINKTYPE_ETHERNET = 1
export const PCAP_SNAPLEN = 65_535

export interface PcapOptions {
  /** Wall-clock milliseconds since 1970 that virtual time 0 maps to. Default 0. */
  readonly startEpochMs?: number
  /** Capture only on these links ("Wireshark on one cable"); absent = every link. */
  readonly linkIds?: readonly string[]
}

export interface PcapExport {
  readonly bytes: Uint8Array
  /** Frames written. */
  readonly packets: number
  /** Serial (HDLC) frames left out: a classic pcap file has one link type, and it is Ethernet. */
  readonly skippedSerial: number
}

export class PcapWriter {
  /**
   * Every transmission is one captured frame (as if each cable had its own tap); flood copies on
   * different links appear once per link. Ordered by departure time, then transmission id.
   */
  static write(transmissions: readonly SimTransmission[], options: PcapOptions = {}): PcapExport {
    const start = options.startEpochMs ?? 0
    const links = options.linkIds ? new Set(options.linkIds) : null
    const ordered = transmissions
      .filter((transmission) => links === null || links.has(transmission.linkId))
      .sort((a, b) => a.departAt - b.departAt || a.id - b.id)
    const out = PcapWriter.globalHeader()
    let packets = 0
    let skippedSerial = 0
    for (const transmission of ordered) {
      const frame = transmission.frame
      if (frame.kind !== 'ethernet') {
        skippedSerial += 1
        continue
      }
      PcapWriter.record(out, start + transmission.departAt, FrameEncoder.ethernet(frame))
      packets += 1
    }
    return { bytes: out.toBytes(), packets, skippedSerial }
  }

  /** 24-byte global header, written little-endian (magic reads as D4 C3 B2 A1). */
  private static globalHeader(): ByteWriter {
    return new ByteWriter()
      .u32le(PCAP_MAGIC)
      .u16le(2) // version major
      .u16le(4) // version minor
      .u32le(0) // thiszone
      .u32le(0) // sigfigs
      .u32le(PCAP_SNAPLEN)
      .u32le(PCAP_LINKTYPE_ETHERNET)
  }

  private static record(out: ByteWriter, epochMs: number, frame: Uint8Array): void {
    const micros = Math.max(0, Math.round(epochMs * 1000))
    const captured = frame.subarray(0, PCAP_SNAPLEN)
    out
      .u32le(Math.floor(micros / 1_000_000))
      .u32le(micros % 1_000_000)
      .u32le(captured.length)
      .u32le(frame.length)
      .raw(captured)
  }
}

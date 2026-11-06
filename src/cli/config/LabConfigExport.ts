// Whole-lab config export (BACKLOG 8, C4): one plain-text file with a section per device, in lab order.
// A section is a header of '!' comments naming the device, then DeviceConfigText's lines: running-config
// (with the VLAN database) for CLI devices, a comment summary for the others. `split` reads a file back
// into its sections, so a section can be replayed on its device (paste a config, round-trip tests).
// The text is device output (English, like IOS); the UI only adds the download around it.
import type { Device, NetworkState } from '../../domain'
import type { CliShell } from '../core/CliShell'
import { DeviceConfigText } from './DeviceConfigText'

export interface LabExportInfo {
  /** Lab title as the user named it. */
  readonly title: string
  /** ISO time of the export; absent = no "Exported" line (tests, reproducible files). */
  readonly exportedAt?: string
}

/** One device's part of an export file. */
export interface LabConfigSection {
  readonly deviceId: string
  /** The lines after the section header. */
  readonly lines: readonly string[]
}

const RULE = `!${'='.repeat(71)}`
const SECTION_HEADER = /^! Device (?<name>.*) \(id: (?<id>[^,]+), kind: [^,]+, model: [^)]+\)$/
const FILE_SUFFIX = '-config.txt'
const FALLBACK_FILE_NAME = 'lab'

export class LabConfigExport {
  private readonly devices: DeviceConfigText

  constructor(shell: CliShell) {
    this.devices = new DeviceConfigText(shell)
  }

  /** The export file's lines: title block, then one section per device. */
  lines(network: NetworkState, info: LabExportInfo): string[] {
    const lines = ['! AgArizaLab configuration export', `! Lab: ${info.title}`]
    if (info.exportedAt !== undefined) lines.push(`! Exported: ${info.exportedAt}`)
    lines.push(`! Devices: ${network.devices.length}`)
    for (const device of network.devices) lines.push('', ...LabConfigExport.header(device), ...this.devices.lines(device))
    return lines
  }

  /** The export file's content ('\n' line breaks, final line break). */
  text(network: NetworkState, info: LabExportInfo): string {
    return `${this.lines(network, info).join('\n')}\n`
  }

  /** Section header lines of a device. */
  static header(device: Device): string[] {
    return [RULE, `! Device ${device.name} (id: ${device.id}, kind: ${device.kind}, model: ${device.modelId})`, RULE]
  }

  /** The sections of an export file, in file order. Text before the first header is ignored. */
  static split(text: string): LabConfigSection[] {
    const sections: { deviceId: string; lines: string[] }[] = []
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const id = lines[index] === RULE && lines[index + 2] === RULE ? SECTION_HEADER.exec(lines[index + 1] ?? '')?.groups?.id : undefined
      if (id !== undefined) {
        sections.push({ deviceId: id, lines: [] })
        index += 2
      } else {
        sections.at(-1)?.lines.push(lines[index] ?? '')
      }
    }
    return sections.map((section) => ({ deviceId: section.deviceId, lines: LabConfigExport.trimEnd(section.lines) }))
  }

  /** Download name: the title in lower case, words joined by '-', plus '-config.txt'. */
  static fileName(title: string): string {
    const base = title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ı/g, 'i')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return `${base === '' ? FALLBACK_FILE_NAME : base}${FILE_SUFFIX}`
  }

  private static trimEnd(lines: readonly string[]): string[] {
    let end = lines.length
    while (end > 0 && lines[end - 1] === '') end -= 1
    return lines.slice(0, end)
  }
}

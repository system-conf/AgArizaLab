// Device → IOS running-config text (docs/CLI.md §6). Sections come from the command sets; the interface
// section is built here from every InterfaceConfigContributor.
import type { Device } from '../../domain'
import type { InterfaceConfigContributor, RunningConfigSection } from '../contract'
import { RUNNING_CONFIG_ORDER } from '../contract'
import { DeviceInterfaces } from './DeviceInterfaces'
import { InterfaceNames } from './InterfaceNames'

const COMMENT = '!'

export class RunningConfigGenerator {
  private readonly sections: readonly RunningConfigSection[]

  constructor(sections: readonly RunningConfigSection[], interfaceLines: readonly InterfaceConfigContributor[]) {
    const interfaceSection: RunningConfigSection = {
      id: 'interfaces',
      order: RUNNING_CONFIG_ORDER.interfaces,
      blocks: (device) =>
        DeviceInterfaces.list(device).map((iface) => [
          `interface ${InterfaceNames.longName(iface.id)}`,
          ...interfaceLines.flatMap((contributor) => contributor.lines(device, iface)).map((line) => ` ${line}`),
        ]),
    }
    const all = [...sections, interfaceSection]
    this.sections = all
      .map((section, index) => ({ section, index }))
      .sort((a, b) => a.section.order - b.section.order || a.index - b.index)
      .map(({ section }) => section)
  }

  /** The configuration itself, from the first '!' to 'end' (what startup-config stores). */
  body(device: Device): string[] {
    const lines = [COMMENT]
    for (const section of this.sections) {
      for (const block of section.blocks(device)) {
        if (block.length === 0) continue
        lines.push(...block, COMMENT)
      }
    }
    lines.push('end')
    return lines
  }

  /** `show running-config` output. */
  show(device: Device): string[] {
    const body = this.body(device)
    return ['Building configuration...', '', `Current configuration : ${RunningConfigGenerator.bytes(body)} bytes`, ...body]
  }

  /** Size IOS reports: every line plus its line break. */
  static bytes(lines: readonly string[]): number {
    return lines.reduce((total, line) => total + line.length + 1, 0)
  }
}

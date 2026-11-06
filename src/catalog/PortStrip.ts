// Front-panel ("physical port strip") layout of a model or device: port ids grouped into sections
// and rows, ready to render. Sections follow the order in which their group first appears in the
// model; a section with many ports is split into two rows like a real switch (odd ports on top,
// even ports below).
import type { Device, DeviceModel } from '../domain'
import { isPortGroup, type PortGroup } from './portTemplates'

/** Group of device ports the model does not know (migrated labs, modules): shown last. */
export type PortStripGroup = PortGroup | 'other'

export interface PortStripSection {
  group: PortStripGroup
  /** i18n key of the section label (`catalog:portGroups.<group>.name`). */
  labelKey: string
  /** Port ids, top row first, left to right. */
  rows: readonly (readonly string[])[]
}

export interface PortStripLayout {
  sections: readonly PortStripSection[]
}

/** Sections with at least this many ports use two rows. */
export const TWO_ROW_THRESHOLD = 12

export class PortStrip {
  /** Layout of every port template of the model. */
  static forModel(model: DeviceModel): PortStripLayout {
    return PortStrip.build(model.ports.map((port) => ({ id: port.id, group: PortStrip.groupOf(port.group) })))
  }

  /**
   * Layout of the device's own ports (authoritative): grouped as in its model when the model has the
   * port id, otherwise in the 'other' section. Model ports the device lacks are left out.
   */
  static forDevice(device: Device, model: DeviceModel | undefined): PortStripLayout {
    const groups = new Map((model?.ports ?? []).map((port) => [port.id, PortStrip.groupOf(port.group)]))
    return PortStrip.build(device.ports.map((port) => ({ id: port.id, group: groups.get(port.id) ?? 'other' })))
  }

  private static groupOf(group: string | undefined): PortStripGroup {
    return isPortGroup(group) ? group : 'other'
  }

  private static build(ports: readonly { id: string; group: PortStripGroup }[]): PortStripLayout {
    const byGroup = new Map<PortStripGroup, string[]>()
    for (const port of ports) {
      const ids = byGroup.get(port.group) ?? []
      ids.push(port.id)
      byGroup.set(port.group, ids)
    }
    const ordered = [...byGroup.entries()].sort(([first], [second]) => Number(first === 'other') - Number(second === 'other'))
    return {
      sections: ordered.map(([group, ids]) => ({
        group,
        labelKey: `catalog:portGroups.${group}.name`,
        rows: PortStrip.rowsOf(ids),
      })),
    }
  }

  private static rowsOf(ids: readonly string[]): string[][] {
    if (ids.length < TWO_ROW_THRESHOLD) return [[...ids]]
    return [ids.filter((_, index) => index % 2 === 0), ids.filter((_, index) => index % 2 === 1)]
  }
}

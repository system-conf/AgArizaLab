import type { CableType, DesignExerciseDefinition, DeviceKind, LabDocument } from '../../domain'
import { findDeviceModel } from '../../catalog'
import { networkEngine } from '../../engine'
import { DesignLabels } from '../DesignLabels'
import { DhcpSettler } from '../DhcpSettler'
import { RequirementChecker, type DesignRules, type RequirementCheckerOptions, type RequirementResult } from '../RequirementChecker'
import { CablingTableBuilder } from './CablingTableBuilder'
import { ConfigSummaryBuilder } from './ConfigSummaryBuilder'
import { DeviceListBuilder } from './DeviceListBuilder'
import { HandoverLayout } from './HandoverLayout'
import { HandoverMarkdown } from './HandoverMarkdown'
import type { BriefSummary, CableTally, HandoverDocument, HandoverPage, KindTally, MessageTranslator, OpenIssue, TopologySummary } from './HandoverTypes'
import { IpPlanBuilder } from './IpPlanBuilder'
import { LabIndex } from './LabIndex'
import { LabIssueFinder } from './LabIssueFinder'
import { VlanTableBuilder } from './VlanTableBuilder'
import { ZoneLocator } from './ZoneLocator'

/** What the pack reads from a lab (a LabDocument, or a brief's lab with meta). */
export type HandoverSource = Pick<LabDocument, 'meta' | 'state' | 'layout' | 'annotations'>

/** The brief the lab was built for: open requirements, customer devices, cost. `id` names the brief title. */
export type HandoverBrief = DesignRules & Partial<Pick<DesignExerciseDefinition, 'id' | 'budget'>>

export interface HandoverOptions extends RequirementCheckerOptions {
  brief?: HandoverBrief
}

/**
 * Network documentation export ("handover pack", BACKLOG item 7) of any lab: topology summary, IP
 * plan, VLAN table, device list, cabling, configuration summary and open issues. Pure. The lab is
 * documented as it runs: every DHCP client has asked for an address (DhcpSettler, on a copy).
 */
export class HandoverPack {
  private readonly options: HandoverOptions

  constructor(options: HandoverOptions = {}) {
    this.options = options
  }

  static build(doc: HandoverSource, options: HandoverOptions = {}): HandoverDocument {
    return new HandoverPack(options).build(doc)
  }

  /** The printable page (sections of tables, facts and lists) of a built document. */
  static page(document: HandoverDocument): HandoverPage {
    return new HandoverLayout().page(document)
  }

  /** Markdown text of the page; `t` renders a message (e.g. `useMessageTranslator()`). */
  static toMarkdown(document: HandoverDocument, t: MessageTranslator): string {
    return new HandoverMarkdown(t).write(HandoverPack.page(document))
  }

  build(doc: HandoverSource): HandoverDocument {
    const engine = this.options.engine ?? networkEngine
    const index = new LabIndex(new DhcpSettler(engine).settle(doc.state))
    const brief = this.options.brief
    const checker = brief ? new RequirementChecker(brief, this.options) : undefined
    const results = checker?.check(doc.state) ?? []
    const zones = new ZoneLocator(doc.annotations, doc.layout)
    const ipPlan = new IpPlanBuilder().build(index)
    const vlans = new VlanTableBuilder().build(index, ipPlan)
    const isProvided = checker ? (deviceId: string) => checker.inventory.isProvided(deviceId) : undefined
    const devices = new DeviceListBuilder(this.options.findModel ?? findDeviceModel).build(index, zones, isProvided)
    const summary: TopologySummary = {
      devices: doc.state.devices.length,
      devicesOff: doc.state.devices.filter((device) => !device.powered).length,
      links: doc.state.links.length,
      unpluggedLinks: doc.state.links.filter((link) => !link.connected).length,
      subnets: ipPlan.length,
      vlans: vlans.length,
      byKind: this.byKind(index),
      byCable: this.byCable(index),
      zones: zones.summaries(doc.state.devices.map((device) => device.id)),
      ...(checker && brief ? { brief: this.briefSummary(results, checker.inventory.totalCost(doc.state), brief.budget) } : {}),
    }
    return {
      meta: {
        title: doc.meta.title,
        ...(doc.meta.author ? { author: doc.meta.author } : {}),
        ...(doc.meta.description ? { description: doc.meta.description } : {}),
        createdAt: doc.meta.createdAt,
        updatedAt: doc.meta.updatedAt,
        ...(brief?.id === undefined ? {} : { briefId: brief.id }),
      },
      summary,
      ipPlan,
      vlans,
      devices,
      cabling: new CablingTableBuilder().build(index),
      configs: new ConfigSummaryBuilder().build(index),
      issues: [...this.requirementIssues(results), ...new LabIssueFinder().find(index)],
    }
  }

  private byKind(index: LabIndex): KindTally[] {
    const counts = new Map<DeviceKind, number>()
    for (const device of index.state.devices) counts.set(device.kind, (counts.get(device.kind) ?? 0) + 1)
    return [...counts.entries()]
      .sort(([a], [b]) => DesignLabels.compareKinds(a, b))
      .map(([kind, count]) => ({ kind, count, label: DesignLabels.kind(kind) }))
  }

  private byCable(index: LabIndex): CableTally[] {
    const counts = new Map<CableType, number>()
    for (const link of index.state.links) counts.set(link.cable, (counts.get(link.cable) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([cable, count]) => ({ cable, count, label: DesignLabels.cable(cable) }))
  }

  private briefSummary(results: readonly RequirementResult[], cost: number, budget: number | undefined): BriefSummary {
    const passed = results.filter((result) => result.ok).length
    return { passed, total: results.length, solved: passed === results.length, cost, ...(budget === undefined ? {} : { budget }) }
  }

  private requirementIssues(results: readonly RequirementResult[]): OpenIssue[] {
    return results
      .filter((result) => !result.ok)
      .map((result) => ({
        source: 'requirement',
        requirementId: result.requirement.id,
        hidden: result.requirement.hidden === true,
        message: result.description,
        ...(result.qualifier ? { qualifier: result.qualifier } : {}),
      }))
  }
}

// Collects the command sets: one merged keyword tree per mode, plus the running-config parts.
import type {
  CliCommandSet,
  CliKeywordNode,
  CliModeKind,
  CliNode,
  CliWhen,
  InterfaceConfigContributor,
  RunningConfigSection,
} from '../contract'
import { CLI_MODE_KINDS } from '../contract'

/** Deepest merge of colliding keywords; deeper = a cycle in a tree (programmer error). */
const MAX_MERGE_DEPTH = 32

function bothWhen(outer: CliWhen | undefined, inner: CliWhen | undefined): CliWhen | undefined {
  if (outer === undefined) return inner
  if (inner === undefined) return outer
  return (device) => outer(device) && inner(device)
}

function eitherWhen(a: CliWhen | undefined, b: CliWhen | undefined): CliWhen | undefined {
  if (a === undefined || b === undefined) return undefined
  return (device) => a(device) || b(device)
}

/** The node's children, each also limited by the node's own `when` (kept when merged into a wider node). */
function childrenUnder(node: CliKeywordNode): CliNode[] {
  return (node.children ?? []).map((child) =>
    node.when === undefined ? child : { ...child, when: bothWhen(node.when, child.when) },
  )
}

function pick<Value>(a: Value | undefined, b: Value | undefined, what: string, word: string): Value | undefined {
  if (a !== undefined && b !== undefined) throw new Error(`CLI command '${word}' has two ${what} handlers`)
  return a ?? b
}

function mergeKeywords(a: CliKeywordNode, b: CliKeywordNode, depth: number): CliKeywordNode {
  if (depth > MAX_MERGE_DEPTH) throw new Error(`CLI command tree too deep at '${a.word}'`)
  const run = pick(a.run, b.run, 'run', a.word)
  const runNo = pick(a.runNo, b.runNo, 'runNo', a.word)
  const when = eitherWhen(a.when, b.when)
  return {
    kind: 'keyword',
    word: a.word,
    help: a.help,
    children: mergeNodeLists(childrenUnder(a), childrenUnder(b), depth + 1),
    ...(run === undefined ? {} : { run }),
    ...(runNo === undefined ? {} : { runNo }),
    ...(when === undefined ? {} : { when }),
    ...(a.hidden === true && b.hidden === true ? { hidden: true } : {}),
  }
}

function sameWord(a: CliNode, b: CliNode): boolean {
  return a.kind === 'keyword' && b.kind === 'keyword' && a.word.toLowerCase() === b.word.toLowerCase()
}

function mergeNodeLists(first: readonly CliNode[], second: readonly CliNode[], depth: number): CliNode[] {
  const merged = [...first]
  for (const node of second) {
    const index = merged.findIndex((existing) => sameWord(existing, node))
    const existing = merged[index]
    if (existing === node) continue
    if (existing?.kind === 'keyword' && node.kind === 'keyword') merged[index] = mergeKeywords(existing, node, depth)
    else merged.push(node)
  }
  return merged
}

export class CliRegistry {
  private readonly trees = new Map<CliModeKind, readonly CliKeywordNode[]>()
  private readonly sectionList: readonly RunningConfigSection[]
  private readonly interfaceLineList: readonly InterfaceConfigContributor[]

  constructor(sets: readonly CliCommandSet[]) {
    const ids = new Set<string>()
    for (const set of sets) {
      if (ids.has(set.id)) throw new Error(`CLI command set '${set.id}' registered twice`)
      ids.add(set.id)
    }
    for (const mode of CLI_MODE_KINDS) this.trees.set(mode, this.buildTree(sets, [mode]))
    // The members of an interface range run the interface commands (docs/CLI.md §2).
    this.trees.set('interfaceRange', this.buildTree(sets, ['interface', 'interfaceRange']))
    const byOrder = <Item extends { readonly order: number }>(items: Item[]): Item[] =>
      items.map((item, index) => ({ item, index })).sort((a, b) => a.item.order - b.item.order || a.index - b.index).map(({ item }) => item)
    this.sectionList = byOrder(sets.flatMap((set) => set.configSections ?? []))
    this.interfaceLineList = byOrder(sets.flatMap((set) => set.interfaceLines ?? []))
  }

  /** Top-level commands of a mode (merged over every set), unfiltered by device. */
  roots(mode: CliModeKind): readonly CliKeywordNode[] {
    return this.trees.get(mode) ?? []
  }

  /** Running-config sections, by order. */
  sections(): readonly RunningConfigSection[] {
    return this.sectionList
  }

  /** Interface line contributors, by order. */
  interfaceLines(): readonly InterfaceConfigContributor[] {
    return this.interfaceLineList
  }

  /** Merged tree of every registration for any of `modes` (each registration once). */
  private buildTree(sets: readonly CliCommandSet[], modes: readonly CliModeKind[]): CliKeywordNode[] {
    const nodes = sets.flatMap((set) =>
      set.commands.filter((command) => command.modes.some((mode) => modes.includes(mode))).map((command) => command.node),
    )
    return this.keywordsOnly(mergeNodeLists([], nodes, 0))
  }

  private keywordsOnly(nodes: readonly CliNode[]): CliKeywordNode[] {
    return nodes.filter((node): node is CliKeywordNode => node.kind === 'keyword')
  }
}

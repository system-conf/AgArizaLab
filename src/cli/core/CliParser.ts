// Walks a command line through a mode's tree: abbreviations, parameters, `no` and `do` (docs/CLI.md §3).
import type { Device } from '../../domain'
import type { CliHandler, CliKeywordNode, CliModeKind, CliNode, CliParamNode } from '../contract'
import { CONFIG_MODE_KINDS } from '../contract'
import { CliArgs } from './CliArgs'
import { CliParamMatcher } from './CliParamMatcher'
import type { CliRegistry } from './CliRegistry'
import { type CliToken, CliTokenizer } from './CliTokenizer'

/** Where a walk stands after some tokens. */
export interface WalkState {
  /** Nodes offered next (device filter and `no` filter applied). */
  readonly level: readonly CliNode[]
  /** Last matched node; null before the first command word. */
  readonly node: CliNode | null
  readonly args: CliArgs
  readonly path: readonly string[]
  readonly negated: boolean
  /** Passed `do`: the rest is a privileged EXEC command. */
  readonly viaDo: boolean
  /** Tokens consumed (a `line` parameter consumes the rest). */
  readonly consumed: number
}

export type WalkResult =
  | { readonly kind: 'ok'; readonly state: WalkState }
  | { readonly kind: 'ambiguous'; readonly tokenIndex: number }
  /** `at` = character index of the caret in the line. */
  | { readonly kind: 'invalid'; readonly at: number; readonly tokenIndex: number }
  /** The tokens end inside a parameter that needs more (interface type without number). */
  | { readonly kind: 'incomplete'; readonly param: CliParamNode; readonly state: WalkState }

export type ParseResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'ok'; readonly handler: CliHandler; readonly state: WalkState }
  | { readonly kind: 'incomplete' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'invalid'; readonly at: number; readonly tokenIndex: number }

const NO_HELP = 'Negate a command or set its defaults'
const DO_HELP = 'To run exec commands in config mode'

export class CliParser {
  private readonly registry: CliRegistry
  private readonly noForms = new WeakMap<CliNode, boolean>()
  private readonly synthetic = new WeakSet<CliNode>()

  constructor(registry: CliRegistry) {
    this.registry = registry
  }

  /** Parses a whole line in `mode`. */
  parse(line: string, mode: CliModeKind, device: Device): ParseResult {
    const tokens = CliTokenizer.tokenize(line)
    if (tokens.length === 0) return { kind: 'empty' }
    const walked = this.walk(line, tokens, tokens.length, mode, device)
    if (walked.kind !== 'ok') return walked.kind === 'incomplete' ? { kind: 'incomplete' } : walked
    const { state } = walked
    const handler = this.handlerOf(state)
    return handler === undefined ? { kind: 'incomplete' } : { kind: 'ok', handler, state }
  }

  /** The handler that runs when the line ends at the walk's node. */
  handlerOf(state: WalkState): CliHandler | undefined {
    if (state.node === null || state.node.kind === 'keyword' && this.isSynthetic(state.node)) return undefined
    return state.negated ? state.node.runNo : state.node.run
  }

  /** Walks the first `count` tokens. */
  walk(line: string, tokens: readonly CliToken[], count: number, mode: CliModeKind, device: Device): WalkResult {
    let state: WalkState = {
      level: this.visible(this.rootsOf(mode, device), device, false),
      node: null,
      args: CliArgs.empty,
      path: [],
      negated: false,
      viaDo: false,
      consumed: 0,
    }
    while (state.consumed < count) {
      const index = state.consumed
      const token = tokens[index]
      if (token === undefined) break
      const keyword = this.matchKeyword(state.level, token.text)
      if (keyword === 'ambiguous') return { kind: 'ambiguous', tokenIndex: index }
      if (keyword !== null) {
        state = this.enterKeyword(state, keyword, device)
        continue
      }
      const stepped = this.matchParam(state, line, tokens, device)
      if (stepped.kind !== 'ok') return stepped
      state = stepped.state
    }
    return { kind: 'ok', state }
  }

  /** Nodes of `nodes` that exist on the device (and have a `no` form when negated). */
  visible(nodes: readonly CliNode[], device: Device, negated: boolean): CliNode[] {
    return nodes.filter((node) => (node.when === undefined || node.when(device)) && (!negated || this.hasNoForm(node, new Set())))
  }

  /** True for the parser's own `no` / `do` keywords. */
  isSynthetic(node: CliKeywordNode): boolean {
    return this.synthetic.has(node)
  }

  /** Roots of a mode plus `no` (when any command has a no form) and `do` (config modes). */
  private rootsOf(mode: CliModeKind, device: Device): CliNode[] {
    const roots: CliNode[] = [...this.registry.roots(mode)]
    if (!CONFIG_MODE_KINDS.includes(mode)) return roots
    const negatable = this.visible(roots, device, true)
    if (negatable.length > 0) roots.push(this.syntheticKeyword('no', NO_HELP, negatable))
    roots.push(this.syntheticKeyword('do', DO_HELP, this.registry.roots('privilegedExec')))
    return roots
  }

  private syntheticKeyword(word: string, help: string, children: readonly CliNode[]): CliKeywordNode {
    const node: CliKeywordNode = { kind: 'keyword', word, help, children }
    this.synthetic.add(node)
    return node
  }

  private enterKeyword(state: WalkState, keyword: CliKeywordNode, device: Device): WalkState {
    const consumed = state.consumed + 1
    if (this.isSynthetic(keyword)) {
      const negated = state.negated || keyword.word === 'no'
      const viaDo = state.viaDo || keyword.word === 'do'
      const level = this.visible(keyword.children ?? [], device, negated)
      return { ...state, level, node: keyword, negated, viaDo, consumed }
    }
    const level = this.visible(keyword.children ?? [], device, state.negated)
    return { ...state, level, node: keyword, path: [...state.path, keyword.word], consumed }
  }

  private matchParam(
    state: WalkState,
    line: string,
    tokens: readonly CliToken[],
    device: Device,
  ): { kind: 'ok'; state: WalkState } | Exclude<WalkResult, { kind: 'ok' }> {
    const index = state.consumed
    const token = tokens[index]
    if (token === undefined) throw new Error('CLI parser walked past the end of the line')
    let invalidAt: number | null = null
    for (const node of state.level) {
      if (node.kind !== 'param') continue
      const match = CliParamMatcher.match(node.param, line, tokens, index, device)
      if (match.kind === 'ok') {
        const level = this.visible(node.children ?? [], device, state.negated)
        const args = state.args.with(node.name, match.value)
        return { kind: 'ok', state: { ...state, level, node, args, consumed: index + match.consumed } }
      }
      if (match.kind === 'incomplete') return { kind: 'incomplete', param: node, state }
      if (match.kind === 'invalid') invalidAt ??= match.at
    }
    return { kind: 'invalid', at: invalidAt ?? token.start, tokenIndex: index }
  }

  /** Exact keyword, else the only keyword the token abbreviates; null = none. */
  private matchKeyword(level: readonly CliNode[], text: string): CliKeywordNode | 'ambiguous' | null {
    const lower = text.toLowerCase()
    const keywords = level.filter((node): node is CliKeywordNode => node.kind === 'keyword')
    const exact = keywords.find((node) => node.word.toLowerCase() === lower)
    if (exact !== undefined) return exact
    const matches = keywords.filter((node) => node.word.toLowerCase().startsWith(lower))
    if (matches.length > 1) return 'ambiguous'
    return matches[0] ?? null
  }

  private hasNoForm(node: CliNode, seen: Set<CliNode>): boolean {
    const known = this.noForms.get(node)
    if (known !== undefined) return known
    if (seen.has(node)) return false
    seen.add(node)
    const result = node.runNo !== undefined || (node.children ?? []).some((child) => this.hasNoForm(child, seen))
    this.noForms.set(node, result)
    return result
  }
}

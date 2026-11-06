// Commands that take a list of addresses (`dns-server 8.8.8.8 8.8.4.4`, `ip name-server …`): a chain of
// IPv4 parameters named `<name>1`, `<name>2` … where every link may end the line.
import type { CliContext, CliHandler, CliParamNode } from '../contract'
import { param } from '../core/CliNodes'

interface ChainHandlers {
  readonly run?: CliHandler
  readonly runNo?: CliHandler
}

export class AddressList {
  /** Up to `max` addresses; `help` is the right column of `?` for each of them. */
  static chain(name: string, max: number, help: string, handlers: ChainHandlers, index = 1): CliParamNode {
    return param(`${name}${index}`, { type: 'ipv4' }, help, {
      ...handlers,
      ...(index < max ? { children: [AddressList.chain(name, max, help, handlers, index + 1)] } : {}),
    })
  }

  /** The addresses typed for a chain, in order, without duplicates. */
  static values(ctx: CliContext, name: string, max: number): string[] {
    const values: string[] = []
    for (let index = 1; index <= max && ctx.args.has(`${name}${index}`); index += 1) {
      const value = ctx.args.text(`${name}${index}`)
      if (!values.includes(value)) values.push(value)
    }
    return values
  }
}

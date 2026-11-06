// Placeholder until the STP pack (5.1): every `spanning-tree …` line is accepted (configs written for real
// switches replay without errors) and an app hint says it changes nothing. Pack 5.1 replaces this list.
import { localizedMessage } from '../../i18n/messageKeys'
import type { CliCommandRegistration, CliCommandResult } from '../contract'
import { CliWhens, keyword, param } from '../core/CliNodes'
import { cliMessage } from '../core/CliOutput'

function notSimulated(): CliCommandResult {
  return { lines: [cliMessage(localizedMessage('cli:unsupported.spanningTree'))] }
}

export const spanningTreeCommands: readonly CliCommandRegistration[] = [
  {
    modes: ['globalConfig', 'interface'],
    node: keyword('spanning-tree', 'Spanning Tree Subsystem', {
      when: CliWhens.switchPlatform,
      children: [param('options', { type: 'line' }, 'Spanning tree options', { run: notSimulated, runNo: notSimulated })],
    }),
  },
]

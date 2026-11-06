import type { NetworkState } from '../../domain'
import { labConfigExport, LabConfigExport } from './cliServices'

/** The whole-lab config export: file name and text (loaded on demand with the CLI). */
export function labConfigFile(network: NetworkState, title: string, exportedAt: string): { file: string; text: string } {
  return { file: LabConfigExport.fileName(title), text: labConfigExport.text(network, { title, exportedAt }) }
}

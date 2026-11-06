import type { LocalizedMessage } from '../../domain/Messages'
import type { Device, NetworkState } from '../../domain'
import CliConsoleTab from './CliConsoleTab'
import type { ExerciseLockPolicy } from './cliServices'
import ConfigTab from './ConfigTab'
import type { CliDeviceTab } from './model/CliAccess'

export interface CliDevicePanelProps {
  tab: CliDeviceTab
  labId: string
  device: Device
  network: NetworkState
  policy: ExerciseLockPolicy
  onUpdate: (next: Device) => void
  problems: readonly LocalizedMessage[]
}

/** The body of the CLI feature's device tabs ("CLI", "Config"). */
function CliDevicePanel({ tab, ...props }: CliDevicePanelProps) {
  if (tab === 'config') return <ConfigTab device={props.device} />
  return <CliConsoleTab {...props} />
}

export default CliDevicePanel

import { useState } from 'react'
import { usePreference } from '../../../preferences'
import { defaultDeviceTab } from '../../preferences/model/preferenceWiring'
import type { DeviceTab } from './deviceTabModel'

/**
 * The properties panel's device tab (shared by all devices, like before). PU (Preferences → Terminal / CLI):
 * it starts on CLI when network devices should open there (devices without a CLI fall back to Info), and
 * follows a change of that preference made while the workspace is open.
 */
export function useDeviceTabState(): [DeviceTab, (tab: DeviceTab) => void] {
  const [cliDefault] = usePreference('terminal.cliDefaultForNetworkDevices')
  const [tab, setTab] = useState<DeviceTab>(() => defaultDeviceTab(cliDefault))
  const [appliedDefault, setAppliedDefault] = useState(cliDefault)
  if (appliedDefault !== cliDefault) {
    setAppliedDefault(cliDefault)
    setTab(defaultDeviceTab(cliDefault))
  }
  return [tab, setTab]
}

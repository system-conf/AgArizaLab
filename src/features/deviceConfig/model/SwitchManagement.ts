// Whether a device lets the learner set VLANs at all, from its model's capabilities. An unmanaged
// switch (switching only: no CLI, no routing, e.g. the desktop switch5) has no way to configure it:
// every port stays an access port in VLAN 1 and it has no management interface (SVI).
import type { DeviceModel } from '../../../domain'

export class SwitchManagement {
  /**
   * VLAN database, SVIs and switchport mode / VLANs are configurable. Unknown models (old labs, a
   * model removed from the catalog) stay configurable: the lock only applies to known unmanaged ones.
   */
  static vlansConfigurable(model: DeviceModel | undefined): boolean {
    if (!model) return true
    const capabilities = new Set(model.capabilities)
    const unmanaged = capabilities.has('l2Switching') && !capabilities.has('deviceCli') && !capabilities.has('routing')
    return !unmanaged
  }
}

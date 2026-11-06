// Device configuration UI (owner I2b). Two components:
//
//   <DeviceConfigPanel device state onChange problems? policy? readOnly? />
//     One card per settings area the device has (general, ports, host, app links, VLAN database,
//     SVIs, routing, DHCP, DNS, wireless, internet). Each card keeps a local draft and calls
//     `onChange(nextDevice)` with the whole edited device on Save; the parent applies
//     `LabEditor.updateDevice` and, when it refuses, passes `deviceUpdateProblems` (as messages)
//     back in `problems`. Props are never mutated.
//
//   <DeviceInfoPanel device state policy? />
//     Read-only summary: model, power, ports (medium, link light, neighbour, admin state, VLAN or
//     address), gateway / DNS, VLANs, routing table, services, SSIDs, internet lines.
//
// Locks: both take the exercise's `ExerciseLockPolicy` (src/session, built from the WHOLE
// `ExerciseDefinition.locks`; default `ExerciseLockPolicy.none`); only the entries whose `deviceId`
// is `device.id` apply. The strictest of device → section → port wins:
// 'hidden' = the card (or the port's settings) is not rendered, 'readOnly' = shown but disabled.
// The device name follows the device lock; power the 'power' section; NIC / interface addresses
// the 'ports' section and port locks. `readOnly` turns every editable card read-only.
export { default as DeviceConfigPanel, type DeviceConfigPanelProps } from './DeviceConfigPanel'
export { default as DeviceInfoPanel, type DeviceInfoPanelProps } from './DeviceInfoPanel'
export { ConfigLocks, type ConfigAccess } from './model/ConfigLocks'
export { DeviceSections, LOCK_SECTION_OF, type ConfigSectionId } from './model/DeviceSections'

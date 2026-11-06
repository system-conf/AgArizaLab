// Device CLI in the workspace (Phase 4, docs/CLI.md §4): the "CLI" console tab and the "Config" tab of
// routers and managed switches, and the File menu's whole-lab config export. The CLI itself (shell,
// command sets) loads on demand; CliAccess is light.
export type { CliDevicePanelProps } from './CliDevicePanel'
export { default as CliDevicePanel } from './LazyCliDevicePanel'
export { CliAccess, type CliDeviceTab } from './model/CliAccess'
export { useLabConfigExport } from './useLabConfigExport'

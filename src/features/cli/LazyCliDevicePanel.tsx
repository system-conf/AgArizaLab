import { lazy, Suspense } from 'react'
import type { CliDevicePanelProps } from './CliDevicePanel'

// The device CLI (shell, command sets, console) loads when a CLI or Config tab is first opened.
const CliDevicePanel = lazy(() => import('./CliDevicePanel'))

/** The CLI feature's device tabs, loaded on demand. */
function LazyCliDevicePanel(props: CliDevicePanelProps) {
  return (
    <Suspense fallback={null}>
      <CliDevicePanel {...props} />
    </Suspense>
  )
}

export default LazyCliDevicePanel

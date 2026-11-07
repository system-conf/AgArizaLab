import { lazy, Suspense, useEffect } from 'react'
import { preferencesDialog, usePreferencesDialogOpen } from './preferencesDialogState'

// The dialog (all tabs and controls) loads when it is first opened.
const PreferencesDialog = lazy(() => import('./PreferencesDialog'))

/** Renders the Preferences dialog while it is open; mounted once by the workspace header. */
function PreferencesDialogHost() {
  const open = usePreferencesDialogOpen()
  // Leaving the screen closes it, so the next workspace does not open with the dialog shown.
  useEffect(() => preferencesDialog.hide, [])
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <PreferencesDialog onClose={preferencesDialog.hide} />
    </Suspense>
  )
}

export default PreferencesDialogHost

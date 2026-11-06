import { useState } from 'react'
import AppRoutes from './features/app/AppRoutes'
import { AppRouter, AppRouterContext } from './routing'

/** Root: one History API router for the whole app (`/`, `/lab`, `/exercises`, …). */
function App() {
  const [router] = useState(() => AppRouter.browser())
  return (
    <AppRouterContext.Provider value={router}>
      <AppRoutes />
    </AppRouterContext.Provider>
  )
}

export default App

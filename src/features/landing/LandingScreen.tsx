import { useDocumentMeta } from '../layout/useDocumentMeta'
import SiteHeader from '../layout/SiteHeader'
import HowTheLabWorks from './HowTheLabWorks'
import LandingFooter from './LandingFooter'
import LandingHero from './LandingHero'
import RecentLabsSection from './RecentLabsSection'

/** Start page (`/`): lab-first hero, the user's recent labs, how the lab works, footer. */
function LandingScreen() {
  useDocumentMeta()
  return (
    <div className="min-h-screen bg-page">
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-6 sm:py-10">
        <LandingHero />
        <RecentLabsSection />
        <HowTheLabWorks />
        <LandingFooter />
      </main>
    </div>
  )
}

export default LandingScreen

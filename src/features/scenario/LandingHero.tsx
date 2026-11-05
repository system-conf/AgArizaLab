import { ArrowDown, CodeXml, Network } from 'lucide-react'
import { siteInfo } from '../layout/siteInfo'
import { focusRing } from '../shared/focusRing'
import ProgressBar from './ProgressBar'

interface LandingHeroProps {
  completed: number
  total: number
  /** Id of the scenario list section, target of the "start" link. */
  scenariosAnchorId: string
}

/** Top of the start page: product name, one-line promise, progress and calls to action. */
function LandingHero({ completed, total, scenariosAnchorId }: LandingHeroProps) {
  return (
    <header className="flex flex-col gap-6 rounded-3xl bg-gradient-to-br from-sky-800 to-slate-900 px-5 py-8 text-white shadow-lg sm:px-8 sm:py-10">
      <div className="flex items-center gap-2 text-sm font-medium text-sky-100">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
          <Network className="h-5 w-5" aria-hidden="true" />
        </span>
        {siteInfo.name}
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold leading-tight sm:text-4xl">
          Gerçek küçük işletme ağlarında arıza bul, çöz, öğren
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-sky-100 sm:text-base">
          Restoran, ofis ve mağaza ağlarında gerçekte yaşanan arızalar. Cihazlara tıkla, ping ve ipconfig çalıştır,
          yanlış ayarı bul ve düzelt. Kurulum yok, üyelik yok; tarayıcında hemen başla.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          href={`#${scenariosAnchorId}`}
          className={`flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-50 ${focusRing} focus-visible:outline-white`}
        >
          Senaryolara geç
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </a>
        <a
          href={siteInfo.repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 rounded-lg border border-white/30 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10 ${focusRing} focus-visible:outline-white`}
        >
          <CodeXml className="h-4 w-4" aria-hidden="true" />
          GitHub’da incele
          <span className="sr-only"> (yeni sekmede açılır)</span>
        </a>
      </div>
      <div className="rounded-2xl bg-white p-4 text-slate-800">
        <ProgressBar completed={completed} total={total} />
      </div>
    </header>
  )
}

export default LandingHero

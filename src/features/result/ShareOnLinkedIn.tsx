import { Share2 } from 'lucide-react'
import { linkedInShareUrl } from '../layout/siteInfo'
import { focusRing } from '../shared/focusRing'

/** Card that invites the player to share the site on LinkedIn (opens LinkedIn in a new tab). */
function ShareOnLinkedIn() {
  return (
    <section className="flex flex-col items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <h2 className="font-semibold text-slate-900">Öğrendiğini paylaş</h2>
        <p className="mt-0.5 text-sm text-slate-600">Ağ arızası çözmeyi pratik eden arkadaşlarına da göster.</p>
      </div>
      <a
        href={linkedInShareUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex shrink-0 items-center gap-2 rounded-lg bg-[#0a66c2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004182] ${focusRing}`}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        LinkedIn’de paylaş
        <span className="sr-only"> (yeni sekmede açılır)</span>
      </a>
    </section>
  )
}

export default ShareOnLinkedIn

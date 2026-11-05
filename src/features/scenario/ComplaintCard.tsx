interface ComplaintCardProps {
  from: string
  message: string
}

/** First letters of up to two words, e.g. 'Şube müdürü' → 'ŞM'. */
function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase('tr-TR'))
  return letters.join('') || '?'
}

/** The customer's complaint shown like an incoming message in a messaging app. */
function ComplaintCard({ from, message }: ComplaintCardProps) {
  return (
    <figure className="flex items-end gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-400 text-xs font-semibold text-white shadow-sm"
      >
        {initialsOf(from)}
      </span>
      <div className="relative max-w-2xl rounded-2xl rounded-bl-md bg-white px-4 py-2.5 shadow-sm ring-1 ring-slate-200">
        <figcaption className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-orange-700">{from}</span>
          <span className="text-slate-400">· yeni mesaj</span>
        </figcaption>
        <blockquote className="mt-0.5 text-sm leading-relaxed text-slate-800 sm:text-base">{message}</blockquote>
      </div>
    </figure>
  )
}

export default ComplaintCard

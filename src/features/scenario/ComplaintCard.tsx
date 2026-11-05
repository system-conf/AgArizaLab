import { MessageCircle } from 'lucide-react'

interface ComplaintCardProps {
  from: string
  message: string
}

/** The customer's complaint shown as a chat bubble. */
function ComplaintCard({ from, message }: ComplaintCardProps) {
  return (
    <figure className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="relative max-w-2xl rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
        <figcaption className="text-xs font-medium text-slate-500">{from}</figcaption>
        <blockquote className="mt-0.5 text-slate-800">{message}</blockquote>
      </div>
    </figure>
  )
}

export default ComplaintCard

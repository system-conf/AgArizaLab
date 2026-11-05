export interface Fact {
  label: string
  value: string
  /** Addresses and ids read better in a monospace font. */
  mono?: boolean
}

interface FactListProps {
  facts: Fact[]
}

/** Read-only label/value rows inside a device info card. */
function FactList({ facts }: FactListProps) {
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-slate-500">{fact.label}</dt>
          <dd className={`min-w-0 break-words text-right text-slate-900 ${fact.mono ? 'font-mono' : ''}`}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default FactList

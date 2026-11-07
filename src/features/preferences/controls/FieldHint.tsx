import type { ReactNode } from 'react'

/** Explanation under a preference; the control points at it with aria-describedby. */
function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs leading-relaxed text-fg-subtle">
      {children}
    </p>
  )
}

export default FieldHint

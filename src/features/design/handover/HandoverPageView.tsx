import type { ReactNode } from 'react'
import type { HandoverBlock, HandoverPage, HandoverText } from '../../../design'
import { useMessageTranslator } from '../../../i18n'

interface HandoverPageViewProps {
  page: HandoverPage
  /** Picture of the lab, shown after the heading (the pack itself has none). */
  topology?: ReactNode
}

const cell = 'border border-slate-300 px-2 py-1 align-top'

/** The handover pack as a clean document: heading, meta facts, sections of tables, facts and lists. */
function HandoverPageView({ page, topology }: HandoverPageViewProps) {
  const translate = useMessageTranslator()
  const text = (value: HandoverText) => (typeof value === 'string' ? value : translate(value))

  function block(item: HandoverBlock, key: string) {
    const caption = 'caption' in item && item.caption !== undefined ? text(item.caption) : undefined
    switch (item.type) {
      case 'paragraph':
        return (
          <p key={key} className="text-sm text-slate-700">
            {text(item.text)}
          </p>
        )
      case 'facts':
        return (
          <div key={key} className="break-inside-avoid">
            {caption !== undefined && <h3 className="mb-1 text-sm font-semibold text-slate-900">{caption}</h3>}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
              {item.items.map((fact, index) => (
                <div key={index} className="contents">
                  <dt className="font-medium text-slate-600">{text(fact.label)}</dt>
                  <dd className="text-slate-900">{text(fact.value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )
      case 'list':
        return (
          <div key={key}>
            {caption !== undefined && <h3 className="mb-1 text-sm font-semibold text-slate-900">{caption}</h3>}
            <ul className="list-disc ps-5 text-sm text-slate-800">
              {item.items.map((line, index) => (
                <li key={index}>{line.map(text).join(' ')}</li>
              ))}
            </ul>
          </div>
        )
      case 'table':
        return (
          <div key={key} className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-xs sm:text-sm">
              {caption !== undefined && <caption className="mb-1 text-start text-sm font-semibold text-slate-900">{caption}</caption>}
              <thead className="bg-slate-100">
                <tr>
                  {item.columns.map((column, index) => (
                    <th key={index} scope="col" className={`${cell} text-start font-semibold text-slate-700`}>
                      {translate(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {item.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="break-inside-avoid">
                    {row.map((value, index) => (
                      <td key={index} className={`${cell} text-slate-800`}>
                        {text(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
    }
  }

  return (
    <article className="mx-auto flex max-w-4xl flex-col gap-6 bg-white text-slate-900">
      <header className="flex flex-col gap-2 border-b-2 border-slate-900 pb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{translate(page.heading)}</p>
        <h1 className="text-2xl font-bold">{text(page.title)}</h1>
        {page.meta.length > 0 && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {page.meta.map((fact, index) => (
              <div key={index} className="flex gap-1.5">
                <dt className="font-medium text-slate-600">{translate(fact.label)}:</dt>
                <dd>{text(fact.value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>
      {topology}
      {page.sections.map((section) => (
        <section key={section.id} aria-labelledby={`handover-${section.id}`} className="flex flex-col gap-3">
          <h2 id={`handover-${section.id}`} className="border-b border-slate-300 pb-1 text-lg font-semibold">
            {translate(section.title)}
          </h2>
          {section.blocks.map((item, index) => block(item, `${section.id}-${index}`))}
        </section>
      ))}
    </article>
  )
}

export default HandoverPageView

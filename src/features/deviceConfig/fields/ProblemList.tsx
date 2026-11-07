import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LocalizedMessage } from '../../../domain/Messages'
import { useMessageTranslator } from '../../../i18n'

interface ProblemListProps {
  problems: readonly LocalizedMessage[]
}

/** Why the last change was refused (LabEditor.deviceUpdateProblems, turned into messages by the parent). */
function ProblemList({ problems }: ProblemListProps) {
  const { t } = useTranslation('deviceConfig')
  const translate = useMessageTranslator()
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-900 dark:text-rose-200">
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('panel.problemsTitle')}
      </p>
      <ul className="list-disc ps-6">
        {problems.map((problem, index) => (
          <li key={`${problem.key}-${index}`}>{translate(problem)}</li>
        ))}
      </ul>
    </div>
  )
}

export default ProblemList

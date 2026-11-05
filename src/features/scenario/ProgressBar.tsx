interface ProgressBarProps {
  completed: number
  total: number
}

/** "n/total tamamlandı" with a horizontal bar. */
function ProgressBar({ completed, total }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">İlerlemen</span>
        <span className="text-slate-600">
          {completed}/{total} senaryo tamamlandı
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Tamamlanan senaryolar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={`${total} senaryodan ${completed} tanesi tamamlandı`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-sky-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default ProgressBar

import { CircleCheck, Network } from 'lucide-react'
import { focusRing } from '../shared/focusRing'
import type { ScenarioListItem } from './scenarioListItem'
import { settingLabels } from './settingLabels'

interface ScenarioListProps {
  items: ScenarioListItem[]
  onStart: (scenarioId: string) => void
}

/** Start page: one card per scenario with a tick when it is completed. */
function ScenarioList({ items, onStart }: ScenarioListProps) {
  const sorted = [...items].sort((a, b) => a.order - b.order)
  const completedCount = items.filter((item) => item.completed).length

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="text-center">
        <Network className="mx-auto mb-3 h-10 w-10 text-sky-700" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-slate-900">Ağ Arıza Laboratuvarı</h1>
        <p className="mt-2 text-slate-600">
          Küçük işletme ağlarındaki arızaları bul ve çöz. Tamamlanan: {completedCount}/{items.length}
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {sorted.map((item) => {
          const setting = settingLabels[item.setting]
          const SettingIcon = setting.icon
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onStart(item.id)}
                className={`flex h-full w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-400 hover:shadow ${focusRing}`}
              >
                <span className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <SettingIcon className="h-4 w-4" aria-hidden="true" />
                    {setting.label}
                  </span>
                  <span>Senaryo {item.order}</span>
                </span>
                <span className="font-semibold text-slate-900">{item.title}</span>
                <span className="mt-auto flex items-center gap-1 text-sm">
                  {item.completed ? (
                    <>
                      <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      <span className="text-emerald-700">Tamamlandı</span>
                    </>
                  ) : (
                    <span className="text-sky-700">Başla →</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </main>
  )
}

export default ScenarioList

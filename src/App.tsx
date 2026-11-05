import { Network } from 'lucide-react'

function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-6">
      <div className="max-w-xl text-center">
        <Network className="mx-auto mb-4 h-12 w-12 text-sky-600" aria-hidden="true" />
        <h1 className="text-3xl font-semibold">Ağ Arıza Laboratuvarı</h1>
        <p className="mt-3 text-slate-600">
          Küçük işletme ağlarındaki arızaları bularak ağ sorun giderme becerini geliştir.
        </p>
      </div>
    </main>
  )
}

export default App

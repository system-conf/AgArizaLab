import { MousePointerClick, SquareTerminal, Wrench, type LucideIcon } from 'lucide-react'

interface Step {
  icon: LucideIcon
  title: string
  text: string
}

const steps: Step[] = [
  {
    icon: MousePointerClick,
    title: 'Şikâyeti oku, haritaya bak',
    text: 'İşletmeden gelen mesajı oku. Haritada bir cihaza tıklayıp bilgilerini ve ayarlarını incele.',
  },
  {
    icon: SquareTerminal,
    title: 'Komutlarla arızayı bul',
    text: 'Bilgisayar ve kasalarda ping, ipconfig ve nslookup çalıştır; paketin nerede takıldığını gör.',
  },
  {
    icon: Wrench,
    title: 'Düzelt ve kontrol et',
    text: 'Yanlış ayarı düzelt, "Çözdüm, kontrol et" de. Sonunda ne olduğunu ve mülakatta nasıl anlatacağını öğren.',
  },
]

/** "Nasıl oynanır" section of the start page: three numbered steps. */
function HowToPlay() {
  return (
    <section aria-labelledby="howToPlayTitle" className="flex flex-col gap-4">
      <h2 id="howToPlayTitle" className="text-lg font-semibold text-slate-900">
        Nasıl oynanır?
      </h2>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon
          return (
            <li key={step.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-col">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                  {index + 1}
                </span>
              </span>
              <div>
                <h3 className="font-medium text-slate-900">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.text}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default HowToPlay

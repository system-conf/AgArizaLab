// TEMPORARY (wave 2): shows the UI components with mock data so they can be seen with
// `npm run dev`. Nothing here talks to the engine; wave 3 replaces this file.
import { useState } from 'react'
import type { AppLinkStatus, TerminalLine } from '../../domain/EngineContract'
import type { Device, Link, NetworkState } from '../../domain/NetworkTypes'
import DevicePanel from '../device/DevicePanel'
import AppLayout from '../layout/AppLayout'
import NetworkMap from '../map/NetworkMap'
import ResultScreen from '../result/ResultScreen'
import ComplaintCard from '../scenario/ComplaintCard'
import HintButton from '../scenario/HintButton'
import ScenarioHeader from '../scenario/ScenarioHeader'
import ScenarioList from '../scenario/ScenarioList'
import type { ScenarioListItem } from '../scenario/scenarioListItem'
import SolveFooter from '../scenario/SolveFooter'
import { mockNetworkState } from './mockNetworkState'

type View = 'list' | 'game' | 'result'

const mockItems: ScenarioListItem[] = [
  { id: 'posGateway', order: 1, title: 'Kasa internete çıkmıyor', setting: 'restoran', completed: true },
  { id: 'printerDhcp', order: 2, title: 'Yazıcı kayboldu', setting: 'ofis', completed: false },
  { id: 'cameraSubnet', order: 3, title: 'Kamera 3 görüntü vermiyor', setting: 'magaza', completed: false },
  { id: 'kitchenVlan', order: 4, title: 'Siparişler mutfağa düşmüyor', setting: 'restoran', completed: false },
  { id: 'wrongDns', order: 5, title: 'Siteler açılmıyor', setting: 'ofis', completed: false },
]

const mockHints = [
  'Yazıcıyı kullanan bilgisayarların hangi adrese gittiğine bak.',
  'Yazıcının şu anki IP adresini kontrol et.',
  'Yazıcıya 192.168.1.150 statik adresini ver.',
]

const mockStatuses: AppLinkStatus[] = [
  { appLinkId: 'printer', label: 'Yazıcı', targetIp: '192.168.1.150', ok: false, reason: 'destinationNotInSegment' },
]

function replaceById<T extends { id: string }>(items: T[], next: T): T[] {
  return items.map((item) => (item.id === next.id ? next : item))
}

function DevPreview() {
  const [view, setView] = useState<View>('game')
  const [network, setNetwork] = useState<NetworkState>(mockNetworkState)
  const [selectedId, setSelectedId] = useState<string | null>('muhasebe')
  const [terminal, setTerminal] = useState<Record<string, TerminalLine[]>>({})
  const [notes, setNotes] = useState('')
  const [hintsRevealed, setHintsRevealed] = useState(0)
  const [failedChecks, setFailedChecks] = useState<string[]>([])

  const selected = network.devices.find((device) => device.id === selectedId)

  function runCommand(deviceId: string, line: string) {
    const lines: TerminalLine[] = [
      { kind: 'input', text: line },
      { kind: 'info', text: 'Önizleme: komutlar 3. aşamada motora bağlanacak.' },
    ]
    setTerminal((current) => ({ ...current, [deviceId]: [...(current[deviceId] ?? []), ...lines] }))
  }

  const updateDevice = (next: Device) => setNetwork((s) => ({ ...s, devices: replaceById(s.devices, next) }))
  const updateLink = (next: Link) => setNetwork((s) => ({ ...s, links: replaceById(s.links, next) }))

  const viewSwitcher = (
    <nav aria-label="Önizleme ekranları" className="flex gap-1 bg-slate-800 px-4 py-1 text-xs text-white">
      <span className="mr-2 opacity-70">Önizleme:</span>
      {(['list', 'game', 'result'] as const).map((v) => (
        <button key={v} type="button" onClick={() => setView(v)} className={`rounded px-2 ${view === v ? 'bg-white text-slate-900' : ''}`}>
          {v === 'list' ? 'Liste' : v === 'game' ? 'Oyun' : 'Sonuç'}
        </button>
      ))}
    </nav>
  )

  if (view === 'list') {
    return (
      <>
        {viewSwitcher}
        <ScenarioList items={mockItems} onStart={() => setView('game')} />
      </>
    )
  }

  if (view === 'result') {
    return (
      <>
        {viewSwitcher}
        <ResultScreen
          title="Yazıcı kayboldu"
          explanation={{
            whatHappened: 'Yazıcı DHCP ile yeni bir adres aldı, bilgisayarlar eski adrese gitmeye devam etti.',
            realLife: 'Yazıcı gibi sabit hizmet veren cihazlara statik adres ya da DHCP rezervasyonu verilir.',
            interviewAnswer: 'Önce yazıcının güncel adresini kontrol ederdim. Sonra kalıcı çözüm olarak sabit adres verirdim.',
          }}
          topics={['DHCP', 'Statik IP']}
          elapsedSeconds={312}
          hintsUsed={hintsRevealed}
          totalHints={mockHints.length}
          onNext={() => setView('game')}
          onBackToList={() => setView('list')}
        />
      </>
    )
  }

  return (
    <>
      {viewSwitcher}
      <AppLayout
        header={
          <ScenarioHeader
            title="Yazıcı kayboldu"
            order={2}
            total={5}
            elapsedSeconds={125}
            onBack={() => setView('list')}
            actions={<HintButton hints={mockHints} revealedCount={hintsRevealed} onReveal={() => setHintsRevealed((n) => Math.min(n + 1, mockHints.length))} />}
          />
        }
        complaint={<ComplaintCard from="Ofis müdürü" message="Yazıcı dün çalışıyordu, bugün kimse çıktı alamıyor." />}
        map={<NetworkMap state={network} selectedDeviceId={selectedId} onSelect={setSelectedId} />}
        panel={
          selected ? (
            <DevicePanel
              device={selected}
              state={network}
              appLinkStatuses={selected.id === 'muhasebe' ? mockStatuses : []}
              terminalLines={terminal[selected.id] ?? []}
              onRunCommand={(line) => runCommand(selected.id, line)}
              onUpdateDevice={updateDevice}
              onUpdateLink={updateLink}
            />
          ) : null
        }
        footer={
          <SolveFooter
            notes={notes}
            onNotesChange={setNotes}
            onCheck={() => setFailedChecks(['PC Muhasebe hâlâ yazıcıya ulaşamıyor.', 'PC Satış hâlâ yazıcıya ulaşamıyor.'])}
            failedChecks={failedChecks}
          />
        }
        onClosePanel={() => setSelectedId(null)}
      />
    </>
  )
}

export default DevPreview

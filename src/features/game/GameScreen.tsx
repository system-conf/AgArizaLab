import type { Scenario } from '../../domain/ScenarioTypes'
import { networkEngine } from '../../engine'
import { FailedCheckDescriber } from '../../session/FailedCheckDescriber'
import { useScenarioSession } from '../../session/useScenarioSession'
import DevicePanel from '../device/DevicePanel'
import AppLayout from '../layout/AppLayout'
import NetworkMap from '../map/NetworkMap'
import ComplaintCard from '../scenario/ComplaintCard'
import HintButton from '../scenario/HintButton'
import ScenarioHeader from '../scenario/ScenarioHeader'
import SolveFooter from '../scenario/SolveFooter'

export interface SolvedSummary {
  elapsedSeconds: number
  hintsUsed: number
}

interface GameScreenProps {
  scenario: Scenario
  total: number
  onBack: () => void
  onSolved: (summary: SolvedSummary) => void
}

/** One running scenario: header, complaint, map, device panel and the solve footer. */
function GameScreen({ scenario, total, onBack, onSolved }: GameScreenProps) {
  const controls = useScenarioSession(scenario)
  const { session } = controls
  const selected = session.selectedDevice
  const failedChecks = session.lastCheck ? FailedCheckDescriber.describeFailures(session.state, session.lastCheck) : []

  function handleCheck() {
    const checked = controls.checkSolved()
    if (checked.isSolved) {
      onSolved({ elapsedSeconds: checked.elapsedSeconds(Date.now()), hintsUsed: checked.hintsRevealed })
    }
  }

  return (
    <AppLayout
      header={
        <ScenarioHeader
          title={scenario.title}
          order={scenario.order}
          total={total}
          elapsedSeconds={controls.elapsedSeconds}
          onBack={onBack}
          actions={<HintButton hints={scenario.hints} revealedCount={session.hintsRevealed} onReveal={controls.revealHint} />}
        />
      }
      complaint={<ComplaintCard from={scenario.complaint.from} message={scenario.complaint.message} />}
      map={<NetworkMap state={session.state} selectedDeviceId={session.selectedDeviceId} onSelect={controls.selectDevice} />}
      panel={
        selected ? (
          <DevicePanel
            key={selected.id}
            device={selected}
            state={session.state}
            appLinkStatuses={networkEngine.appLinkStatus(session.state, selected.id)}
            terminalLines={[...session.terminalLines(selected.id)]}
            onRunCommand={(line) => controls.runCommand(selected.id, line)}
            onUpdateDevice={controls.updateDevice}
            onUpdateLink={controls.updateLink}
          />
        ) : null
      }
      footer={
        <SolveFooter notes={session.notes} onNotesChange={controls.setNotes} onCheck={handleCheck} failedChecks={failedChecks} />
      }
      onClosePanel={() => controls.selectDevice(null)}
    />
  )
}

export default GameScreen

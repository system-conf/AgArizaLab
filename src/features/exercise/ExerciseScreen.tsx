import { useRef } from 'react'
import type { Scenario } from '../../domain/ScenarioTypes'
import { networkEngine } from '../../engine'
import { FailedCheckDescriber } from '../../session/FailedCheckDescriber'
import { useScenarioSession } from '../../session/useScenarioSession'
import DevicePanel from '../device/DevicePanel'
import AppLayout from '../layout/AppLayout'
import NetworkMap from '../map/NetworkMap'
import { useFullscreen } from '../map/useFullscreen'
import ComplaintCard from '../scenario/ComplaintCard'
import GuideButton from '../scenario/GuideButton'
import ScenarioHeader from '../scenario/ScenarioHeader'
import SolveFooter from '../scenario/SolveFooter'

export interface SolvedSummary {
  guideStepsUsed: number
}

interface ExerciseScreenProps {
  scenario: Scenario
  total: number
  onBack: () => void
  onSolved: (summary: SolvedSummary) => void
}

/** One open exercise: header, complaint, map, device panel and the verify footer. */
function ExerciseScreen({ scenario, total, onBack, onSolved }: ExerciseScreenProps) {
  const controls = useScenarioSession(scenario)
  // Fullscreen target: the whole exercise area, so the device panel stays usable in fullscreen.
  const exerciseAreaRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(exerciseAreaRef)
  const { session } = controls
  const selected = session.selectedDevice
  const failedChecks = session.lastCheck ? FailedCheckDescriber.describeFailures(session.state, session.lastCheck) : []

  function handleVerify() {
    const checked = controls.checkSolved()
    if (checked.isSolved) {
      onSolved({ guideStepsUsed: checked.hintsRevealed })
    }
  }

  return (
    <div ref={exerciseAreaRef} className="overflow-auto bg-slate-50">
      <AppLayout
        header={
          <ScenarioHeader
            title={scenario.title}
            order={scenario.order}
            total={total}
            onBack={onBack}
            actions={<GuideButton steps={scenario.hints} revealedCount={session.hintsRevealed} onReveal={controls.revealGuideStep} />}
          />
        }
        complaint={<ComplaintCard from={scenario.complaint.from} message={scenario.complaint.message} />}
        map={
          <NetworkMap
            state={session.state}
            selectedDeviceId={session.selectedDeviceId}
            onSelect={controls.selectDevice}
            positionOf={(deviceId) => session.positionOf(deviceId)}
            onMoveDevice={controls.moveDevice}
            canResetLayout={session.hasCustomLayout}
            onResetLayout={controls.resetLayout}
            trace={session.lastTrace}
            fullscreen={fullscreen}
          />
        }
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
          <SolveFooter notes={session.notes} onNotesChange={controls.setNotes} onVerify={handleVerify} failedChecks={failedChecks} />
        }
        onClosePanel={() => controls.selectDevice(null)}
      />
    </div>
  )
}

export default ExerciseScreen

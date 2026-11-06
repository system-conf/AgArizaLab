import { useCallback, useMemo, useState } from 'react'
import type { LocalizedMessage } from '../../domain/Messages'
import type { DeviceV2 } from '../../domain/v2'
import { LabMessages, type ExerciseLockPolicy, type LabDocumentState, type LabEditor } from './labServices'

export interface DeviceEditing {
  /** Applies a settings change (one undo step) unless a lock or LabEditor refuses it. */
  update: (next: DeviceV2) => void
  /** Why the last change of this device was refused; [] when it was applied. */
  problemsOf: (deviceId: string) => readonly LocalizedMessage[]
}

const NO_PROBLEMS: readonly LocalizedMessage[] = []

/** Settings changes from the device panel: lock check, LabEditor validation, refusal messages. */
export function useDeviceEditing(lab: LabDocumentState, editor: LabEditor, policy: ExerciseLockPolicy): DeviceEditing {
  const messages = useMemo(() => new LabMessages(), [])
  const [refused, setRefused] = useState<{ deviceId: string; problems: readonly LocalizedMessage[] } | null>(null)
  const { doc, apply } = lab

  const update = useCallback(
    (next: DeviceV2) => {
      const before = doc.state.devices.find((device) => device.id === next.id)
      if (!before) return
      if (!policy.allowsDeviceUpdate(before, next)) {
        console.warn(`Change of ${next.id} touches settings this exercise locks; ignored.`)
        return
      }
      const violations = editor.deviceUpdateProblems(doc, next)
      if (violations.length > 0) {
        setRefused({ deviceId: next.id, problems: messages.fromViolations(violations) })
        return
      }
      setRefused(null)
      apply((current) => editor.updateDevice(current, next))
    },
    [apply, doc, editor, messages, policy],
  )

  const problemsOf = useCallback(
    (deviceId: string) => (refused?.deviceId === deviceId ? refused.problems : NO_PROBLEMS),
    [refused],
  )

  return { update, problemsOf }
}

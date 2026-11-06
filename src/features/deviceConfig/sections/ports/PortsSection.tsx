import { EthernetPort } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeviceModel, NetworkStateV2 } from '../../../../domain/v2'
import SectionCard from '../../fields/SectionCard'
import type { ConfigLocks } from '../../model/ConfigLocks'
import type { SectionProps } from '../sectionTypes'
import PortEditor from './PortEditor'
import PortStripView from './PortStripView'

interface PortsSectionProps extends SectionProps {
  state: NetworkStateV2
  model: DeviceModel | undefined
  locks: ConfigLocks
}

/** Front panel; clicking a port opens its editor below the strip. */
function PortsSection({ device, state, model, locks, access, saved, onSave }: PortsSectionProps) {
  const { t } = useTranslation('deviceConfig')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = device.ports.find((port) => port.id === selectedId)

  return (
    <SectionCard title={t('sections.ports')} icon={EthernetPort} access={access} saved={saved}>
      <PortStripView
        device={device}
        state={state}
        model={model}
        locks={locks}
        selectedPortId={selected?.id ?? null}
        onSelect={(portId) => setSelectedId((current) => (current === portId ? null : portId))}
      />
      {selected ? (
        <PortEditor
          // A new draft whenever another port is chosen or the saved port changes.
          key={`${device.id}:${JSON.stringify(selected)}`}
          device={device}
          port={selected}
          model={model}
          access={locks.port(selected.id)}
          onSave={onSave}
          onClose={() => setSelectedId(null)}
        />
      ) : (
        <p className="text-sm text-slate-500">{t('ports.selectHint')}</p>
      )}
    </SectionCard>
  )
}

export default PortsSection

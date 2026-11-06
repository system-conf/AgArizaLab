// The simulator's code on the main thread, loaded on demand (`loadSimulationRuntime`): the kernel with its
// layers, the terminal, the configuration effects and the .pcap encoder. Keeping it out of the workspace
// chunk lets the canvas open before the simulator's code is even downloaded.
import type { NetworkState } from '../../domain'
import { createSimulation, SimTerminal } from '../../sim'
import { PcapWriter } from '../../sim/pcap'
import { serviceLayer } from '../../sim/services'
import type { SimulationRuntime } from './simulationServices'

const EMPTY_NETWORK: NetworkState = { devices: [], links: [] }

export const simulationRuntime: SimulationRuntime = {
  createEngine: (network) => createSimulation(network),
  restoreEngine(snapshot) {
    // The kernel's whole state is its snapshot (the layers keep none): a blank engine becomes that engine.
    const engine = createSimulation(EMPTY_NETWORK, { settle: false })
    engine.restore(snapshot)
    return engine
  },
  terminal: {
    run: (engine, deviceId, line) => SimTerminal.run(engine, deviceId, line),
    start: (engine, deviceId, line) => SimTerminal.start(engine, deviceId, line),
    collect: (engine, requestId) => SimTerminal.collect(engine, requestId),
  },
  applyEffects: (state, effects) => effects.reduce((current, effect) => serviceLayer.applyEffect(current, effect), state),
  writePcap: (transmissions, startEpochMs) => PcapWriter.write(transmissions, { startEpochMs }),
}

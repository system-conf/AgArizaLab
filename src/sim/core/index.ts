// Shared simulator core (docs/SIMULATION.md §6, §10): the kernel and its helpers. Owned by K3.
export { DefaultLatencyModel } from './DefaultLatencyModel'
export { DeviceChanges, type ChangePlan } from './DeviceChanges'
export { nullLayers } from './NullLayers'
export { RuntimeTables } from './RuntimeTables'
export { SeededRandom } from './SeededRandom'
export { SimulationKernel } from './SimulationKernel'
export { TaskQueue } from './TaskQueue'

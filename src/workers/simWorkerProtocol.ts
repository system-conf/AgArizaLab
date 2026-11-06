// Messages between the main thread (SimWorkerClient) and the simulator's Web Worker (simWorker.ts).
import type { NetworkState, SolveCondition } from '../domain'
import type { ConditionResult } from '../engine'
import type { CommandJob, CommandJobResult, PreparedSimulation } from './simJobs'

export type SimWorkerRequest =
  | { readonly id: number; readonly kind: 'solve'; readonly state: NetworkState; readonly conditions: readonly SolveCondition[] }
  | ({ readonly id: number; readonly kind: 'command' } & CommandJob)
  | { readonly id: number; readonly kind: 'prepare'; readonly state: NetworkState }

export type SimWorkerResponse =
  | { readonly id: number; readonly kind: 'solve'; readonly results: ConditionResult[] }
  | { readonly id: number; readonly kind: 'command'; readonly result: CommandJobResult }
  | { readonly id: number; readonly kind: 'prepare'; readonly result: PreparedSimulation }
  | { readonly id: number; readonly kind: 'error'; readonly message: string }

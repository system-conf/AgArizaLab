// The simulator's Web Worker (BACKLOG item 6): builds and settles the engines of large labs, verifies
// exercises and runs realtime terminal commands of large labs off the main thread. Loaded by SimWorkerClient through Vite's `new Worker(new URL(...))`.
import { SimJobs } from './simJobs'
import type { SimWorkerRequest, SimWorkerResponse } from './simWorkerProtocol'

/** The part of DedicatedWorkerGlobalScope this worker uses (the app's lib is DOM, not WebWorker). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<SimWorkerRequest>) => void) | null
  postMessage(message: SimWorkerResponse): void
}

const scope = globalThis as unknown as WorkerScope
const jobs = new SimJobs()

function handle(request: SimWorkerRequest): SimWorkerResponse {
  switch (request.kind) {
    case 'solve':
      return { id: request.id, kind: 'solve', results: jobs.solve(request.state, request.conditions) }
    case 'command':
      return { id: request.id, kind: 'command', result: jobs.command(request) }
    case 'prepare':
      return { id: request.id, kind: 'prepare', result: jobs.prepare(request.state) }
  }
}

scope.onmessage = (event) => {
  const request = event.data
  try {
    scope.postMessage(handle(request))
  } catch (error) {
    // A simulator bug must not leave the caller waiting: report it, the client rejects the job.
    console.error('Simulation worker job failed', error)
    scope.postMessage({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}

import { describe, expect, it, vi } from 'vitest'
import type { NetworkState, SolveCondition } from '../domain'
import { largeLab } from './largeLab'
import { SimJobs } from './simJobs'
import { SimWorkerClient, type WorkerPort } from './SimWorkerClient'
import type { SimWorkerRequest, SimWorkerResponse } from './simWorkerProtocol'

const SMALL: NetworkState = { devices: [], links: [] }
const CONDITIONS: SolveCondition[] = []

/** A worker double that answers with the real jobs, asynchronously like a real worker. */
class FakeWorker implements WorkerPort {
  onmessage: ((event: MessageEvent<SimWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly received: SimWorkerRequest[] = []
  private readonly jobs = new SimJobs()

  postMessage(message: SimWorkerRequest): void {
    this.received.push(message)
    const response = this.answer(message)
    queueMicrotask(() => this.onmessage?.(new MessageEvent('message', { data: structuredClone(response) })))
  }

  terminate(): void {}

  private answer(message: SimWorkerRequest): SimWorkerResponse {
    switch (message.kind) {
      case 'solve':
        return { id: message.id, kind: 'solve', results: this.jobs.solve(message.state, message.conditions) }
      case 'command':
        return { id: message.id, kind: 'command', result: this.jobs.command(message) }
      case 'prepare':
        return { id: message.id, kind: 'prepare', result: this.jobs.prepare(message.state) }
    }
  }
}

describe('SimWorkerClient', () => {
  it('keeps small labs on the main thread and sends large ones to the worker', async () => {
    const worker = new FakeWorker()
    const client = new SimWorkerClient({ createWorker: () => worker })
    expect(client.usesWorker(SMALL)).toBe(false)
    await expect(client.solve(SMALL, CONDITIONS)).resolves.toEqual([])
    expect(worker.received).toHaveLength(0)

    const lab = largeLab()
    expect(client.usesWorker(lab)).toBe(true)
    await expect(client.solve(lab, CONDITIONS)).resolves.toEqual([])
    expect(worker.received.map((request) => request.kind)).toEqual(['solve'])
  })

  it('settles large labs in the worker; the snapshot restores into the same engine state', async () => {
    const worker = new FakeWorker()
    const client = new SimWorkerClient({ createWorker: () => worker })
    const lab = largeLab()
    const prepared = await client.prepare(lab)
    expect(worker.received.map((request) => request.kind)).toEqual(['prepare'])
    expect(prepared.settleTruncated).toBe(false)
    expect(prepared.snapshot).toEqual(new SimJobs().prepare(lab).snapshot)
    // Small labs are settled here, without a message.
    await expect(client.prepare(SMALL)).resolves.toMatchObject({ settleTruncated: false })
    expect(worker.received).toHaveLength(1)
  })

  it('runs everything here when the environment has no workers', async () => {
    const client = new SimWorkerClient({ createWorker: () => null })
    expect(client.usesWorker(largeLab())).toBe(false)
    await expect(client.solve(largeLab(), CONDITIONS)).resolves.toEqual([])
  })

  it('falls back to the main thread when the worker fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: WorkerPort = {
      onmessage: null,
      onerror: null,
      postMessage() {
        // Node has no ErrorEvent: an Event with the one field the client reads.
        const failure = Object.assign(new Event('error'), { message: 'cannot load' }) as ErrorEvent
        queueMicrotask(() => broken.onerror?.(failure))
      },
      terminate() {},
    }
    const client = new SimWorkerClient({ createWorker: () => broken })
    await expect(client.solve(largeLab(), CONDITIONS)).resolves.toEqual([])
    expect(client.usesWorker(largeLab())).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

import { describe, expect, it } from 'vitest'
import { MAX_REPLAY_HOPS, RealtimeReplay } from './RealtimeReplay'
import { simEvent, transmission } from './simFixtures'

describe('RealtimeReplay', () => {
  it('replays the first burst hop by hop and leaves out what came after the idle gap', () => {
    const request = transmission({ id: 1, departAt: 10, arriveAt: 11 })
    const forwarded = transmission({ id: 2, departAt: 11, arriveAt: 12, frameId: 'f2' })
    const reply = transmission({ id: 3, departAt: 12, arriveAt: 14, frameId: 'f3' })
    const nextEcho = transmission({ id: 4, departAt: 1014, arriveAt: 1015, frameId: 'f4' })
    const events = [simEvent({ id: 1, time: 10 }), simEvent({ id: 2, time: 1014 })]
    const replay = RealtimeReplay.of([request, forwarded, reply, nextEcho], events)
    expect(replay?.hops).toEqual([
      { from: 10, to: 11 },
      { from: 11, to: 12 },
      { from: 12, to: 14 },
    ])
    expect(replay?.transmissions.map((entry) => entry.id)).toEqual([1, 2, 3])
    expect(replay?.events.map((event) => event.id)).toEqual([1])
  })

  it('is null when nothing went on the wire and caps long runs', () => {
    expect(RealtimeReplay.of([], [])).toBeNull()
    const chain = Array.from({ length: MAX_REPLAY_HOPS + 10 }, (_, index) => transmission({ id: index + 1, departAt: index, arriveAt: index + 1 }))
    expect(RealtimeReplay.of(chain, [])?.hops).toHaveLength(MAX_REPLAY_HOPS)
  })
})

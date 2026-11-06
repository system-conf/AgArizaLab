import { describe, expect, it, vi } from 'vitest'
import { ShareHashWatcher, type HashPort } from './ShareHashWatcher'

class FakeHash implements HashPort {
  value = ''
  private readonly listeners = new Set<() => void>()

  hash(): string {
    return this.value
  }

  onHashChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  change(value: string): void {
    this.value = value
    for (const listener of this.listeners) listener()
  }
}

describe('ShareHashWatcher', () => {
  it('reads the share hash the page was opened with', () => {
    const port = new FakeHash()
    const watcher = new ShareHashWatcher(port)
    expect(watcher.current()).toBeNull()
    port.value = '#section'
    expect(watcher.current()).toBeNull()
    port.value = '#lab=abc'
    expect(watcher.current()).toBe('#lab=abc')
  })

  it('reports share hashes pasted later and ignores other hash changes', () => {
    const port = new FakeHash()
    const listener = vi.fn()
    const stop = new ShareHashWatcher(port).watch(listener)
    port.change('#lab=first')
    port.change('#notes')
    port.change('')
    port.change('#lab=second')
    expect(listener.mock.calls).toEqual([['#lab=first'], ['#lab=second']])
    stop()
    port.change('#lab=third')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

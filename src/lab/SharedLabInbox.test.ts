import { describe, expect, it, vi } from 'vitest'
import { LabShareLink } from './LabShareLink'
import { SharedLabInbox } from './SharedLabInbox'
import { expectLabMessage, sampleLab } from './testLabs'

const shareLink = new LabShareLink()

function hashOf(title: string): string {
  const encoded = shareLink.encode({ ...sampleLab(), meta: { ...sampleLab().meta, title } })
  if (!encoded.ok) throw new Error('expected a hash')
  return encoded.hash
}

describe('SharedLabInbox', () => {
  it('opens a share hash once and clears it from the address bar', () => {
    const clearHash = vi.fn()
    const inbox = new SharedLabInbox(shareLink, clearHash)
    expect(inbox.receive(null)).toEqual({ kind: 'none' })
    expect(inbox.hasOpened).toBe(false)
    const hash = hashOf('Birinci')
    const first = inbox.receive(hash)
    expect(first.kind === 'opened' && first.doc.meta.title).toBe('Birinci')
    expect(clearHash).toHaveBeenCalledTimes(1)
    expect(inbox.hasOpened).toBe(true)
    // StrictMode runs the effect again with the same hash: ignored.
    expect(inbox.receive(hash)).toEqual({ kind: 'none' })
    expect(clearHash).toHaveBeenCalledTimes(1)
  })

  it('opens a different link pasted later, and the same link again after the app forgot it', () => {
    const inbox = new SharedLabInbox(shareLink, () => undefined)
    inbox.receive(hashOf('Birinci'))
    const pasted = hashOf('İkinci')
    const second = inbox.receive(pasted)
    expect(second.kind === 'opened' && second.doc.meta.title).toBe('İkinci')
    expect(inbox.receive(pasted).kind).toBe('none')
    inbox.receive(null)
    expect(inbox.receive(pasted).kind).toBe('opened')
  })

  it('reports damaged links and still clears the hash', () => {
    const clearHash = vi.fn()
    const inbox = new SharedLabInbox(shareLink, clearHash)
    const outcome = inbox.receive('#lab=%%%')
    if (outcome.kind !== 'failed') throw new Error('expected a failure')
    expectLabMessage(outcome.errors[0], 'lab:share.corrupt')
    expect(clearHash).toHaveBeenCalledTimes(1)
    expect(inbox.hasOpened).toBe(false)
  })
})

import { compressToEncodedURIComponent } from 'lz-string'
import { describe, expect, it } from 'vitest'
import { LabShareLink, SHARE_HASH_PREFIX } from './LabShareLink'
import { LabSerializer } from './LabSerializer'
import { expectLabMessage, sampleLab } from './testLabs'

const shareLink = new LabShareLink()

describe('LabShareLink', () => {
  it('round-trips a lab through the URL hash', () => {
    const doc = sampleLab()
    const encoded = shareLink.encode(doc)
    if (!encoded.ok) throw new Error('expected a hash')
    expect(encoded.hash.startsWith(SHARE_HASH_PREFIX)).toBe(true)
    expect(encoded.hash).toMatch(/^#lab=[A-Za-z0-9+\-$]+$/)
    expect(encoded.hash.length).toBeLessThan(new LabSerializer().serializeCompact(doc).length)
    expect(shareLink.decode(encoded.hash)).toMatchObject({ ok: true, doc })
    expect(shareLink.decode(encoded.hash.slice(1))).toMatchObject({ ok: true, doc })
  })

  it('builds a full URL, replacing an existing hash', () => {
    const result = shareLink.url(sampleLab(), 'https://lab.example/app?lang=tr#old')
    if (!result.ok) throw new Error('expected a url')
    expect(result.url.startsWith('https://lab.example/app?lang=tr#lab=')).toBe(true)
  })

  it('refuses labs above the size limit with a lab: message', () => {
    const result = new LabShareLink(new LabSerializer(), 100).encode(sampleLab())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expectLabMessage(result.errors[0], 'lab:share.tooLarge')
    expect(result.errors[0]?.params?.limit).toBe(100)
  })

  it('ignores hashes without a lab and reports damaged ones', () => {
    expect(shareLink.decode('')).toBeNull()
    expect(shareLink.decode('#section2')).toBeNull()
    const damaged = shareLink.decode('#lab=%%%')
    expect(damaged?.ok).toBe(false)
    if (damaged && !damaged.ok) expectLabMessage(damaged.errors[0], 'lab:share.corrupt')
    const notALab = shareLink.decode(`#lab=${compressToEncodedURIComponent('{"x":1}')}`)
    if (notALab && !notALab.ok) expectLabMessage(notALab.errors[0], 'lab:import.notALab')
    else throw new Error('expected an error')
  })
})

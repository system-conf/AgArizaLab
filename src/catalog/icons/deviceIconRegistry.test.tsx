import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DeviceKindV2 } from '../../domain/v2'
import { deviceIconFor, deviceIconRegistry } from './deviceIconRegistry'
import { DeviceKindIcon } from './DeviceKindIcon'

const KINDS = Object.keys(deviceIconRegistry) as DeviceKindV2[]

describe('deviceIconFor', () => {
  it.each(KINDS)('%s renders a 24×24 outline svg', (kind) => {
    const Icon = deviceIconFor(kind)
    const markup = renderToStaticMarkup(<Icon className="h-6 w-6" aria-hidden="true" />)
    expect(markup).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/)
    expect(markup).toContain('class="')
    expect(markup).toContain('aria-hidden="true"')
  })

  it('renders the same markup through DeviceKindIcon', () => {
    const Icon = deviceIconFor('l3Switch')
    expect(renderToStaticMarkup(<DeviceKindIcon kind="l3Switch" className="x" />)).toBe(
      renderToStaticMarkup(<Icon className="x" />),
    )
  })

  it('gives each network-gear kind its own icon', () => {
    const gear: DeviceKindV2[] = ['internet', 'router', 'wirelessRouter', 'switch', 'l3Switch', 'hub', 'accessPoint']
    expect(new Set(gear.map(deviceIconFor)).size).toBe(gear.length)
  })
})

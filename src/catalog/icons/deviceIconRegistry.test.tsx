import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DeviceKind } from '../../domain'
import { findDeviceModel } from '../DeviceCatalog'
import { deviceIconFor, deviceIconForModel, deviceIconRegistry, modelIconOverrides } from './deviceIconRegistry'
import { DeviceKindIcon } from './DeviceKindIcon'

const KINDS = Object.keys(deviceIconRegistry) as DeviceKind[]

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
    const gear: DeviceKind[] = ['internet', 'router', 'wirelessRouter', 'switch', 'l3Switch', 'hub', 'accessPoint']
    expect(new Set(gear.map(deviceIconFor)).size).toBe(gear.length)
  })
})

describe('deviceIconForModel', () => {
  it('uses the kind icon unless the model has its own', () => {
    expect(deviceIconForModel('kitchenDisplay', 'kitchenDisplay')).toBe(deviceIconFor('kitchenDisplay'))
    expect(deviceIconForModel('pc', undefined)).toBe(deviceIconFor('pc'))
    expect(deviceIconForModel('kitchenDisplay', 'smartTv')).not.toBe(deviceIconFor('kitchenDisplay'))
  })

  it('only overrides models that exist in the catalog', () => {
    for (const modelId of Object.keys(modelIconOverrides)) expect(findDeviceModel(modelId), modelId).toBeDefined()
  })
})

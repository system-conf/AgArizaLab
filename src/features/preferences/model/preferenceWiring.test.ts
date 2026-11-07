import { describe, expect, it } from 'vitest'
import { CABLE_TOOLS } from '../../workspace/cable/cableTools'
import {
  defaultDeviceTab,
  deviceLabelLines,
  offeredCableTools,
  portLabelClassName,
  recentHistory,
  terminalFontStyle,
} from './preferenceWiring'
import { parseWholeNumber } from './wholeNumber'

describe('preference wiring', () => {
  it('labels devices by name, model, both or not at all', () => {
    expect(deviceLabelLines('name', 'R1', 'Router 2911')).toEqual(['R1'])
    expect(deviceLabelLines('model', 'R1', 'Router 2911')).toEqual(['Router 2911'])
    expect(deviceLabelLines('both', 'R1', 'Router 2911')).toEqual(['R1', 'Router 2911'])
    expect(deviceLabelLines('both', 'Cloud', 'Cloud')).toEqual(['Cloud'])
    expect(deviceLabelLines('none', 'R1', 'Router 2911')).toEqual([])
  })

  it('draws port labels always, on hover or never', () => {
    expect(portLabelClassName('always')).toBe('')
    expect(portLabelClassName('never')).toBeNull()
    expect(portLabelClassName('hover')).toContain('opacity-0')
    // `\_` keeps React Flow's `__` from turning into spaces in Tailwind's arbitrary variant.
    expect(portLabelClassName('hover')).toContain(String.raw`[.react-flow\_\_edge:hover_&]:opacity-100`)
    expect(portLabelClassName('hover')).toContain(String.raw`[.react-flow\_\_edge.selected_&]:opacity-100`)
  })

  it('offers the automatic cable only when it is turned on', () => {
    expect(offeredCableTools(true)).toBe(CABLE_TOOLS)
    expect(offeredCableTools(false)).toEqual(CABLE_TOOLS.filter((tool) => tool !== 'auto'))
    expect(offeredCableTools(false)[0]).toBe('copperStraight')
  })

  it('opens network devices on the CLI tab when preferred', () => {
    expect(defaultDeviceTab(true)).toBe('cli')
    expect(defaultDeviceTab(false)).toBe('info')
  })

  it('keeps the last entries of a command history', () => {
    const history = ['a', 'b', 'c', 'd']
    expect(recentHistory(history, 2)).toEqual(['c', 'd'])
    expect(recentHistory(history, 10)).toEqual(history)
    expect(recentHistory(history, 0)).toEqual([])
  })

  it('passes the terminal font size as a CSS variable', () => {
    expect(terminalFontStyle(15)).toEqual({ '--terminal-font-size': '15px' })
  })

  it('accepts only whole numbers in range for number fields', () => {
    expect(parseWholeNumber(' 42 ', 1, 256)).toBe(42)
    expect(parseWholeNumber('0', 1, 256)).toBeNull()
    expect(parseWholeNumber('257', 1, 256)).toBeNull()
    expect(parseWholeNumber('4.5', 1, 256)).toBeNull()
    expect(parseWholeNumber('', 1, 256)).toBeNull()
  })
})

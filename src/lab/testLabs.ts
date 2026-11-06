// Test-only lab documents and message checks for the src/lab tests.
import { expect } from 'vitest'
import type { LabDocument, Link } from '../domain'
import type { LocalizedMessage } from '../domain/Messages'
import { cableLab } from '../domain/testDevices'
import en from '../locales/en/lab.json'
import tr from '../locales/tr/lab.json'
import { createLabFromState } from './createLab'

export const FIXED_NOW = new Date('2026-11-06T10:00:00.000Z')

export const sampleLinks: Link[] = [
  { id: 'link1', a: { deviceId: 'pc', portId: 'eth0' }, b: { deviceId: 'sw', portId: 'Fa0/1' }, connected: true, cable: 'copperStraight' },
  { id: 'link2', a: { deviceId: 'router', portId: 'Gi0/0' }, b: { deviceId: 'sw', portId: 'Fa0/2' }, connected: true, cable: 'copperStraight' },
  { id: 'link3', a: { deviceId: 'laptop', portId: 'wlan0' }, b: { deviceId: 'ap', portId: 'Radio0' }, connected: true, cable: 'wireless', ssid: 'Office' },
  { id: 'link4', a: { deviceId: 'router', portId: 'Se0/0/0' }, b: { deviceId: 'router2', portId: 'Se0/0/0' }, connected: false, cable: 'serial', dceEnd: 'a' },
]

/** pc, laptop, sw, sw2, router, router2, ap, cloud (see cableLab) with four links, notes and an annotation. */
export function sampleLab(): LabDocument {
  const state = { ...cableLab(), links: sampleLinks }
  const layout = {
    devices: Object.fromEntries(state.devices.map((device, index) => [device.id, { x: index * 100, y: 50 }])),
    viewport: { x: 0, y: 0, zoom: 1 },
  }
  return {
    ...createLabFromState(state, layout, { title: 'Ofis ağı', now: FIXED_NOW }),
    notes: 'Kontrol edilecek: VLAN 10',
    annotations: [{ id: 'annotation1', type: 'text', color: 'blue', at: { x: 10, y: 10 }, text: 'Mutfak', size: 'medium' }],
  }
}

function lookup(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[key] : undefined), root)
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([^\s,}]+)/g)].map((match) => match[1] ?? '').sort()
}

/** The message is a `lab:` key present in en and tr whose placeholders are exactly its params. */
export function expectLabMessage(message: LocalizedMessage | undefined, key?: string): void {
  expect(message).toBeDefined()
  if (message === undefined) return
  if (key !== undefined) expect(message.key).toBe(key)
  expect(message.key.startsWith('lab:')).toBe(true)
  const path = message.key.slice('lab:'.length)
  for (const locale of [en, tr]) {
    const text = lookup(locale, path)
    expect(typeof text, `${message.key} missing`).toBe('string')
    if (typeof text === 'string') expect(placeholders(text)).toEqual(Object.keys(message.params ?? {}).sort())
  }
}

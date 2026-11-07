// Test and profiling only: the large labs of largeLab.ts as lab documents with a canvas layout, for the
// canvas performance pass (docs/CANVAS_PERFORMANCE.md). 50 / 150 / 300 devices ≈ 2 / 6 / 12 access switches.
import { LAB_SCHEMA_VERSION, type CanvasPoint, type LabDocument } from '../domain'
import { largeLab } from './largeLab'

/** Hosts under one access switch are laid out in rows of this many. */
const HOSTS_PER_ROW = 6
const COLUMN_GAP = 96
const ROW_GAP = 120

/** Access switches for a lab of about `devices` devices (4 + 24 per access switch). */
export function accessSwitchesFor(devices: number): number {
  return Math.max(1, Math.round((devices - 4) / 24))
}

/**
 * A lab document of about `devices` devices: internet, router and core in a column at the top, the
 * access switches in a row, each switch's hosts in a block below it.
 */
export function largeLabDocument(devices: number, now: Date = new Date(0)): LabDocument {
  const switches = accessSwitchesFor(devices)
  const state = largeLab(switches)
  const blockWidth = HOSTS_PER_ROW * COLUMN_GAP + COLUMN_GAP
  const centreX = (switches * blockWidth) / 2
  const positions: Record<string, CanvasPoint> = {
    isp: { x: centreX, y: 0 },
    router: { x: centreX, y: ROW_GAP },
    core: { x: centreX, y: ROW_GAP * 2 },
    server: { x: centreX + COLUMN_GAP * 2, y: ROW_GAP * 2 },
  }
  for (let index = 1; index <= switches; index += 1) {
    const left = (index - 1) * blockWidth
    positions[`acc${index}`] = { x: left + (HOSTS_PER_ROW * COLUMN_GAP) / 2, y: ROW_GAP * 3 }
  }
  for (const device of state.devices) {
    const match = /^h(\d+)x(\d+)$/.exec(device.id)
    if (!match) continue
    const switchIndex = Number(match[1])
    const port = Number(match[2])
    const left = (switchIndex - 1) * blockWidth
    positions[device.id] = {
      x: left + (port % HOSTS_PER_ROW) * COLUMN_GAP,
      y: ROW_GAP * 4 + Math.floor(port / HOSTS_PER_ROW) * ROW_GAP,
    }
  }
  const timestamp = now.toISOString()
  return {
    schemaVersion: LAB_SCHEMA_VERSION,
    meta: { title: `Large lab (${state.devices.length})`, createdAt: timestamp, updatedAt: timestamp },
    state,
    layout: { devices: positions },
    notes: '',
    annotations: [],
  }
}

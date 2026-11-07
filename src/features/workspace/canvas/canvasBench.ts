// Profiling only (docs/CANVAS_PERFORMANCE.md), never imported by the app. In the dev server's console:
//   const bench = await import('/src/features/workspace/canvas/canvasBench.ts')
//   await bench.seedLargeLab(150)   // then reload /lab
//   await bench.dragBench('h2x7')   // frame times while a device is dragged
//   await bench.selectBench(['h1x1', 'h2x2'])
import { saveLabAsNew } from '../../../lab/storage/labStorage'
import { largeLabDocument } from '../../../workers/largeLabDocument'

export interface FrameStats {
  avg: number
  p50: number
  p95: number
  max: number
  /** Frames slower than 20 ms (a visible hitch at 60 Hz). */
  over20: number
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function statsOf(samples: number[]): FrameStats {
  const sorted = [...samples].sort((first, second) => first - second)
  const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
  const total = sorted.reduce((sum, sample) => sum + sample, 0)
  return {
    avg: round(total / Math.max(1, sorted.length)),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(at(1)),
    over20: sorted.filter((sample) => sample > 20).length,
  }
}

function nodeElement(nodeId: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${nodeId}"]`)
  if (!element) throw new Error(`No canvas node ${nodeId}`)
  return element
}

function mouse(type: string, x: number, y: number, buttons: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, button: 0, buttons })
}

/** Saves the generated lab of about `devices` devices as the autosaved lab (reload /lab to open it). */
export async function seedLargeLab(devices: number): Promise<number> {
  const doc = largeLabDocument(devices, new Date())
  await saveLabAsNew(doc)
  return doc.state.devices.length
}

/** Drags `nodeId` by a few px per frame for `steps` frames and returns the frame intervals. */
export async function dragBench(nodeId: string, steps = 90): Promise<FrameStats> {
  const element = nodeElement(nodeId)
  const box = element.getBoundingClientRect()
  let x = box.left + box.width / 2
  let y = box.top + box.height / 2
  element.dispatchEvent(mouse('mousedown', x, y, 1))
  const frames: number[] = []
  let last = await nextFrame()
  for (let step = 0; step < steps; step += 1) {
    x += 3
    y += step % 2 === 0 ? 1 : -1
    window.dispatchEvent(mouse('mousemove', x, y, 1))
    const now = await nextFrame()
    frames.push(now - last)
    last = now
  }
  window.dispatchEvent(mouse('mouseup', x, y, 0))
  await new Promise((resolve) => setTimeout(resolve, 300))
  return statsOf(frames)
}

/** Clicks each node in turn; returns ms from the click until the next frame was painted. */
export async function selectBench(nodeIds: readonly string[]): Promise<number[]> {
  const times: number[] = []
  for (const nodeId of nodeIds) {
    const element = nodeElement(nodeId)
    const box = element.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const start = performance.now()
    element.dispatchEvent(mouse('mousedown', x, y, 1))
    window.dispatchEvent(mouse('mouseup', x, y, 0))
    element.dispatchEvent(mouse('click', x, y, 0))
    await nextFrame()
    await new Promise((resolve) => setTimeout(resolve, 0))
    times.push(round(performance.now() - start))
  }
  return times
}

/** Pans the view by dragging the empty pane for `steps` frames. */
export async function panBench(steps = 90): Promise<FrameStats> {
  const pane = document.querySelector<HTMLElement>('.react-flow__pane')
  if (!pane) throw new Error('No canvas pane')
  const box = pane.getBoundingClientRect()
  let x = box.left + 10
  let y = box.top + 10
  pane.dispatchEvent(mouse('mousedown', x, y, 1))
  const frames: number[] = []
  let last = await nextFrame()
  for (let step = 0; step < steps; step += 1) {
    // Out and back: the lab stays in view.
    const direction = step < steps / 2 ? 1 : -1
    x += 4 * direction
    y += 2 * direction
    window.dispatchEvent(mouse('mousemove', x, y, 1))
    const now = await nextFrame()
    frames.push(now - last)
    last = now
  }
  window.dispatchEvent(mouse('mouseup', x, y, 0))
  return statsOf(frames)
}

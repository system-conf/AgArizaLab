# Canvas performance (BACKLOG item 16, PF)

The lab canvas is React Flow 12, controlled: `WorkspaceCanvas` builds nodes and edges from the lab
document and the selection; drag positions live in canvas state until the drag ends (R2: snap on
release, no simulator work during drags).

## How it was measured

- Labs: `src/workers/largeLabDocument.ts` lays out the `largeLab` generator (internet, router, core,
  N access switches with 23 hosts each). 50 / 150 / 300 requested = **52 / 148 / 292** devices.
- Harness: `src/features/workspace/canvas/canvasBench.ts` (profiling only, never imported by the app).
  In the dev server: `seedLargeLab(n)` saves the lab as the autosaved lab; after a reload
  `dragBench(id)` drags a device 60 frames with synthetic mouse events and returns frame intervals,
  `panBench()` pans the pane out and back, `selectBench(ids)` clicks devices and times click → next frame.
- Runs: headless Chromium (Playwright) at 1280 × 800 against the Vite dev server (development React,
  so absolute numbers are higher than in a production build; the display runs at 60 Hz, 16.7 ms = a
  full-speed frame). React commit time came from a temporary `<Profiler>` around `<ReactFlow>`, node /
  edge render counts from temporary counters in `WorkspaceDeviceNode` / `LinkEdge` (both removed).
- Before = commit 31ddd76 (served from an extracted copy of HEAD), after = this pass.

## Numbers

Frame interval while dragging one device (avg / p95, ms; 60 frames):

| devices | before        | after       |
|--------:|---------------|-------------|
| 52      | 23.3 / 50     | 17.5 / 16.8 |
| 148     | 43.1 / 83     | 18.9 / 33   |
| 292     | 145.8 / 267   | 18.9 / 33   |

React work during the 60-frame drag (Profiler, sum of commits): 148 devices 1335 ms → 239 ms;
292 devices 4409 ms → 258 ms. Cable renders per drag: 706 → 118 (148 devices); 1398 → 118 (292).

Clicking a device (select; ms from click to the next frame, 2nd–4th click):

| devices | before          | after        | canvas React per click, before → after |
|--------:|-----------------|--------------|-----------------------------------------|
| 52      | 131 / 132 / 106 | 62 / 64 / 62 | 39 ms → 3 ms                            |
| 148     | 274 / 142 / 124 | 76 / 82 / 64 | 71 ms → 3 ms                            |
| 292     | 389 / 231 / 191 | 82 / 94 / 91 | 105 ms → 3 ms                           |

Every click re-rendered all cables before (147 / 291 edge renders per selection commit); now only
the cables whose selection changed. What is left of a click (≈60–90 ms in dev mode) is outside the
canvas: the properties panel mounting the device tabs and the rest of `WorkspaceView` re-rendering
(the device palette is not memoised; see open points).

Panning (headless, paint is cheap there): 16.7 ms before and after up to 148 devices; at 292 devices
19.2 → 22.8 ms avg because nodes are mounted / unmounted at the view's edge (see
`onlyRenderVisibleElements` below). Headless paint does not show what promoting the viewport layer
during pans (below) saves on a real GPU; a try in the in-app browser was not reliable (shared tab,
the pan drifted the lab out of view), so that part is unmeasured.

## What changed

1. **Stable handlers** (largest win). `onNodeClick` was a new function each render; React Flow passes
   it down to every node wrapper, so every drag frame re-rendered all node wrappers. All handlers
   given to `<ReactFlow>` are now created once and read the latest props from a ref
   (`WorkspaceCanvas`). `nodeTypes` / `edgeTypes`, fit options and key lists stay module constants.
2. **Stable element objects.** `useCanvasElements` keeps the previous object of every node *and edge*
   that did not change (`reuseUnchanged`, now generic, compares data one level deep incl. the
   `switchEnds` array). A selection change gives new objects only to the elements whose selection
   changed; tests count this on a 292-device lab (`flowElements.test.ts`).
3. **Drag frames do not rebuild nodes.** Drag positions are laid over the built nodes
   (`withDragPositions`): one pass, a new object only for the dragged node.
4. **Cheaper while moving.** While devices are dragged the canvas has `data-moving`: device shadows
   are dropped and the minimap is unmounted (it redraws every node on each frame). While the view
   pans or zooms, the viewport gets `will-change: transform` (set on the element directly, no React
   render), so a pan moves the painted layer; it is removed at the end so text is repainted sharp.
5. **`onlyRenderVisibleElements` from 200 nodes.** Below that it only costs (mount / unmount and
   re-measure during pans); at 292 devices drag frames were ≈10 % cheaper with it, pans ≈10 % dearer
   (headless). With a real GPU and a zoomed-in view of a big lab, fewer DOM nodes pay off.
6. **Packet animation outside React state.** `SimulationMapLayer` renders once per step;
   `usePacketAnimation` runs one requestAnimationFrame loop that writes each packet's transform (and,
   when a dropped frame arrives, its red ✕, colour and label) straight into the elements.
   `PacketPlacement` (pure, tested) computes the places. Before, the layer re-rendered every packet
   on every frame (`useStepProgress`, removed). The packet button's `transition-transform` (which
   eased every frame's move) became `transition-[scale]` (hover only).
7. `WorkspaceDeviceNode` passes `modelId` to `DeviceKindIcon` (follow-up from wave 3.1).

## Follow-ups handled here

- **Exercise map refit.** `WorkspaceCanvas` takes `refitOnResize` (on in exercise mode): a
  ResizeObserver fits the view again when the canvas changes size (the footer grows with the
  failed-check list on a phone), unless the learner panned or zoomed since (`useViewportMotion`).
- **Simulation player creation in the worker.** Already the case for labs of ≥ 30 devices since I3:
  `workspaceEngineBuild` builds and settles the engine in the Web Worker (`SimJobs.prepare`) and the
  player only restores the snapshot. Measured: main thread at mount 0.4 ms, restore 0.2–0.3 ms
  (100 / 196 devices); a CPU profile of opening a 100-device lab shows no simulator frames on the
  main thread; `reconfigure` after an edit costs ≈3 ms. The ≈120–200 ms figure is the main-thread
  `createEngine` (create + settle) that only tests, small labs (< 30 devices, a few ms) and browsers
  without workers use. Moving the stepping player itself into the worker would turn every step,
  inspector read and step back into an async round trip with cloned events for no gain, so it stays
  on the main thread. Determinism is unaffected either way (same engine, same snapshot).

## Canvas / WebGL renderer

Not needed: at 292 devices a drag runs at the display rate (p50 16.7 ms, dev build) and React work
per drag frame is ≈4 ms. Re-evaluate only if labs well beyond 300 devices become a target.

## Open points

- `WorkspaceView` re-renders the whole screen on each selection change; the device palette
  (`palette/DevicePalette`) and the toolbars are not memoised and get new callbacks each render.
  Memoising them (with stable callbacks in `WorkspaceView`) would cut part of the ≈60–90 ms per click.
- Cable port labels use a stroked halo (`paint-order: stroke`), probably the most expensive paint per
  cable. Kept for readability; worth measuring on a real GPU together with dark mode (item 14).
- Measure a production build on a mid-range phone; the numbers above are dev-mode desktop Chromium.

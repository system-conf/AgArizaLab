# Product backlog (approved ideas not yet scheduled in a wave)

## Approved (2026-11-06)
1. **Palette redesign** (small track next to Phase 3, owner `src/features/workspace/palette/**`):
   two levels — category bar (Network devices · End devices · Cables · IoT/Industrial later · Misc) →
   sub-category tabs (Router · Switch · Hub · Wireless · Security · WAN/ISP; PC/Laptop · Server ·
   Printer · Phone/Tablet · Camera/NVR · POS/Display) → model tiles with a hover card (port summary,
   short description, "when to use it"), search, recent + favourites, cables also pickable from the
   palette (toolbar stays as shortcut). Needs `subcategory` + `useCaseKey` in the catalog contract.
2. **More device models**: now — router variants (3–4 GE, modular), more switch models, DSL/cable
   modem, second server type, TV / smart display; with packs — firewall (5.7), WLC + lightweight APs
   (5.6), IP phone + call manager (5.8), cell tower / cellular, industrial switch, PLC, IoT (5.9).
3. **Device artwork (AI-generated, ChatGPT via Commend image requests)**: map icons stay vector SVG;
   generated art for palette hover cards, the device **physical view** (front panel, ports, LEDs),
   sample / design-brief covers, landing and share images. One written style guide + one prompt per
   device for consistency. Scheduled with the physical view.

4. **Wireshark export (.pcap)** — Phase 3 (U3/I3): export the simulation's frames as a libpcap file
   (Ethernet link type), correct byte encoding of every PDU we model; test by re-parsing.
5. **End-to-end tests + CI** — before Phase 3 closes: Playwright smoke suite (landing, lab build +
   cable + ping, one exercise verify, language switch, share link), GitHub Actions running
   build / test / lint / e2e on every push and a Cloudflare preview deploy per branch.
6. **Simulator in a Web Worker** — Phase 3 (I3): the UI never blocks on large labs.
7. **Network documentation export** — with design exercises: one click → PDF / printable page with
   topology picture, IP plan, VLAN table, port-to-device list, device config summary ("handover
   pack"); also the final deliverable of design briefs.
8. **Config export** — Phase 4: IOS-style `running-config` text per device and for the whole lab
   (download); later: paste a config to apply it.
9. **Learning path** — after samples exist: ordered curriculum (basics → switching → routing →
   services → security → wireless → WAN → IPv6 → operations) linking samples, exercises and design
   briefs, with per-step progress (no game mechanics).
10. **Subnetting drills** — small module: generated questions (network, broadcast, host range, host
    count, which subnet), instant feedback, tr + en.
11. **AI mentor (later)** — Socratic hints from the lab state without giving the answer; needs a
    server side (Cloudflare Worker + Claude API) and a cost plan; design separately.
12. **Topic pages** — one public, indexable page per sample topic ("VLAN nedir?") with the lesson
    text and an "open in the lab" button; tr + en; good for search traffic.
13. **Product name** — the name now covers only part of the product (troubleshooting); decide a
    broader name before the public release (owner's decision).

14. **Dark mode** (approved 2026-11-06): design tokens (CSS variables) + Tailwind `dark:`; Light / Dark /
    System; canvas, cables, packet colours, event list, design and sample screens; contrast check (WCAG AA).
15. **Preferences screen** (approved): tabs Appearance (theme, font size, density, high contrast), Map
    (device name / model labels, port labels always / hover / never, link lights, grid + snap, minimap),
    Animation & simulation (on/off, speed, default mode, default event filters), Terminal / CLI (CLI as
    default tab for network devices, font size, history length), Cables (auto cable on/off; cable length
    effects with the physical view), Language, Data (autosave, clear local data, reset progress,
    export / import preferences). Stored locally; later items added with their features.
16. **Canvas performance pass** (reported: React Flow feels laggy): profile first; no simulator
    reconfigure / live checks during drags (run once on release); memoised node and edge components with
    stable objects; packet animation outside React state (requestAnimationFrame + direct SVG);
    `onlyRenderVisibleElements`; cheaper styles (shadows / blur) and minimap off while dragging; measure
    with 50 / 150 / 300-device labs. Only if still slow at 300 devices: evaluate a Canvas/WebGL renderer.
    Schedule: "UI polish" workflow (14 + 15 + 16 + 17 in parallel tracks) after the current CLI/samples workflow.
17. **Icon redesign** (approved): our own SVG icon set in the classic, generic network-diagram symbol
    language (router = cylinder with four arrows, switch = flat box with two-way arrows, L3 switch, hub,
    firewall = brick wall, access point = box with waves, cloud, server tower, PC, laptop, phone, camera…);
    readable at 32 px, distinct silhouettes, colour by category (network blue, end devices slate,
    security orange, WAN/cloud violet), good in light and dark mode. Never copy Cisco / Packet Tracer
    artwork or Cisco's topology icon set (licence covers diagrams, not embedding in another product).
    Realistic artwork stays with item 3 (AI-generated, physical view).

## Follow-ups from wave 3.1 (small, schedule with the next integration wave)
- Canvas node and device info panel should pass `modelId` to `DeviceKindIcon` (smart TV shows the chef-hat icon).
- Default device names per model, not per kind (smart TV → "Smart TV 1", modems → "DSL modem 1").
- `switch5` (unmanaged) has no CLI but its VLANs are editable — capability-based lock in deviceConfig.
- One shared cable-tool list for toolbar and palette (`CanvasToolbar` private `CABLE_TOOLS`).
- Touch: long-press on a palette tile shows the details card.
- MODEL_V2 §7: document `subcategory`, `useCaseKey`, catalog sections.
- Lint after P1 (reported by T1): `react-hooks/static-components` in `catalog/icons/DeviceKindIcon.tsx`,
  `react-refresh/only-export-components` in `palette/CablePalette.tsx` and `palette/PaletteNavigation.tsx`.
- Exercise screen on phones: refit the map when the canvas is resized (failed-check list grows the footer).
- e2e selectors use en locale texts — renaming en labels requires the same change in `e2e/`.
- Design tasks: persist drafts across reloads (IndexedDB like labs); cable prices in the palette's cable view;
  "customer devices are pinned" note visible below 1024 px; brief difficulty as data instead of derived.
- Move simulation player creation (≈200 ms on a 100-device lab) into the worker.
- e2e: add a design-task flow (open brief, add router+switch, checklist turns green, submit, review, handover).

## Proposed (awaiting decision)
—

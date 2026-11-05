# AgArizaLab — v1.1 plan (map and polish)

v1 is live at https://agarizalab.slovveis.workers.dev (`npm run deploy`). Rules of docs/PLAN.md §1 still
apply to every agent (strict TS, no any, no kebab-case, < 500 lines, classes for logic, function
components for UI, Turkish UI text, single plain Bash commands, no commits — the coordinator commits).

Goal: it must stop feeling primitive. A first-time visitor from LinkedIn should feel "this is a real tool".

## Contract additions (already in src/domain/EngineContract.ts)
- `CommandResult.trace?: PacketTrace` — ping route for animation.
- `NetworkEngine.linkLight(state, linkId): 'up' | 'down'` — physical LED only.

## Work split (parallel; each agent owns only its files)

### Agent E2 — engine (owns src/engine/**)
1. `linkLight`: up = link.connected, both ends powered, every switch port on the link exists and is
   enabled. Wireless link: up when SSID matches a network on the AP and both ends powered.
2. `runCommand` ping sets `trace`: success → full path from ReachabilityChecker (source → … →
   destination device id; for internet targets end at the 'internet' device). Failure → path from
   source to the last device the packet reached (atDeviceId when the checker knows it, else [source]).
   ReachabilityChecker may expose a richer internal result; keep public `reach()` unchanged.
3. Tests for both. Do not touch other folders.

### Agent F — map (owns src/features/map/**, src/features/game/GameScreen.tsx, src/session/**)
Replace the hand SVG with React Flow (`@xyflow/react` 12.x, MIT).
1. Zoom in/out (buttons + mouse wheel + pinch), pan by dragging the background, fit-to-view button,
   minimap (hidden on phones), fullscreen button using the Fullscreen API on the game area
   (fallback: hide button when unsupported; Esc exits). Controls have Turkish aria-labels/tooltips.
2. Drag devices to rearrange; positions are stored in the session (`ScenarioSession.moveDevice`,
   immutable, tested) so they survive panel changes; a "Düzeni sıfırla" button restores scenario positions.
   Dragging must not change network behaviour.
3. Custom device node: icon, name, IP (or '—'), small power dot; selected state ring. Links as
   custom edges: straight or smooth-step, port label near switch end, dashed for wireless, a small
   LED at each switch-side end coloured by `networkEngine.linkLight` (green up / grey down).
   Never colour by IP/VLAN/DNS health.
4. Packet animation: after a ping in the terminal, animate a dot along `trace.path` (edge by edge,
   ~350 ms per hop); success → dot returns to source (reply) in green; failure → dot stops at the last
   device and shows a small red ✕ there for ~1.5 s. Respect `prefers-reduced-motion` (skip animation).
   Session keeps `lastTrace`; GameScreen passes it to the map.
5. Map fills available space; on phones panel stays a bottom sheet.

### Agent P — polish (owns src/features/scenario/**, src/features/device/**, src/features/result/**,
src/features/layout/**, src/App.tsx, src/index.css, index.html)
1. Start page: a real landing — short hero ("Gerçek küçük işletme ağlarında arıza bul, çöz, öğren"),
   "Nasıl oynanır" in 3 steps, scenario cards with setting icon, topic tags (from scenario.topics),
   difficulty (1–2 easy: posGateway, wrongDns; 3 medium: printerDhcp, cameraSubnet; kitchenVlan hard —
   add `difficulty` locally in a UI map keyed by scenario id, do not change scenario data), progress bar,
   GitHub link (https://github.com/system-conf/AgArizaLab), footer with MIT + author.
2. Game header: cleaner, timer chip, hint button, back. Complaint card like a messaging app bubble.
3. Device panel: device header with icon and status, Bilgi as clean cards, Ayarlar with grouped fields
   and a short "Kaydedildi" confirmation after saving, switch ports as a visual port strip
   (8 small port squares with VLAN number, click a port to edit it) plus the existing table for editing.
4. Terminal: Windows command prompt look (black, grey text, `C:\>` prompt, Consolas/mono), clear (`cls`
   handled in UI only), click-to-focus.
5. Result screen: success header, sections as cards, "LinkedIn'de paylaş" button that opens
   `https://www.linkedin.com/sharing/share-offsite/?url=<site url>` in a new tab, next scenario.
6. index.html: meta description, Open Graph tags (title, description, url, `og:image` left as TODO
   comment), theme-color, favicon (inline SVG network icon). Visual style: calm, modern, consistent
   spacing, sky/slate palette, good contrast, focus rings, works at 360 px width.
P must not edit map/session/GameScreen; if GameScreen needs a prop change, report it.

### Wave B — verification
Verifier agent (code/rules) + coordinator plays all 5 scenarios in the browser on desktop and phone
widths, then `npm run deploy`.

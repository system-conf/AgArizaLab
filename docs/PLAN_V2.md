# AgArizaLab — v2 plan (from game to network lab)

Product decision (2026-11-06): AgArizaLab is **not a game**. It becomes a browser-based network lab with
a free-form workspace, packet-level simulation and device CLIs. Long-term goal: **feature parity with
Packet Tracer** (tracked in `docs/PARITY.md`), plus troubleshooting exercises as our own strength.
The app is **multilingual**: Turkish and English at launch, more languages addable without code changes.

PLAN.md §1 coding rules stay binding (strict TS, no `any`, < 500 lines per file, classes for logic,
function components for UI, no kebab-case, no commits by agents — the coordinator commits after each wave).
Rules changed by this plan:
- "All user-facing text is Turkish" → **all user-facing text goes through i18n** (§2).
- "NOT a general network simulator" → it now is one.
- Never use Cisco / Packet Tracer names, logos, icons or screenshots. Protocols and the IOS-style
  command syntax are industry standards and may be implemented; device icons are our own SVGs.
- `.pkt` / `.pka` import is out of scope (proprietary, encrypted format).

## 1. Phases at a glance

| Phase | Version | Outcome |
|---|---|---|
| 1 | v1.2 | i18n foundation (tr + en), lab wording, engine bug fixes, `tracert` |
| 2 | v2.0 | Explicit port model, workspace builder, save / load / share, undo / redo |
| 3 | v2.1 | Packet-level simulation, Realtime / Simulation mode, PDU inspector |
| 4 | v2.2 | Device CLIs (switch, router, host), running/startup config |
| 5+ | v2.3 → v3 | Protocol packs and platform features from `docs/PARITY.md`, one pack per agent |

Wave rules:
- A **contract wave** (`.0`) is always one agent, alone. It edits `src/domain/**` and docs only.
- Parallel waves: at most 4 agents, each owning disjoint folders (listed per agent). If an agent needs
  a change outside its folders, it stops and reports it instead of editing.
- Every phase ends with a **verifier wave**: build, tests, lint, 500-line check, i18n key parity,
  manual run on desktop and 360 px width in both languages. Then the coordinator commits and deploys.

## 2. i18n rules (binding from Phase 1 on)

- Library: `i18next` + `react-i18next` + `i18next-browser-languagedetector`. Keys are typed through
  `CustomTypeOptions` so a missing key is a compile error.
- Files: `src/locales/<lng>/<namespace>.json`, namespaces per feature (`common`, `workspace`, `device`,
  `terminal`, `simulation`, `exercises`, `results`, …). Languages are listed once in
  `src/i18n/languages.ts` (code, native name, direction). Non-default languages are lazy-loaded.
- **Adding a language = add a folder + one line in `languages.ts`.** No other code change.
- Fallback language `en`. `tr` and `en` must always be complete: a test fails when any locale is
  missing a key or has an extra key compared to `en`, or when interpolation variables differ.
- Components never contain user-facing literals; ESLint rule (`i18next/no-literal-string` or an
  equivalent custom rule) enforces it in `src/features/**`.
- Engine, simulation and CLI layers **never produce prose for the app UI**. They return codes and
  parameters (`FailureReason`, message ids + values); the UI translates them.
- **Device output stays English in every language** (Windows `ping`/`ipconfig`, IOS-style CLI), as on
  real equipment. App-level help around it (e.g. `help` explanations, hints) is translated.
- Exercise texts (brief, hints, explanation, device display names) live in the `exercises` namespace,
  keyed by exercise id. Exercise data files hold topology and ids only.
- User content (device names, notes, lab titles) is never translated.
- Numbers, durations and dates through `Intl`. Plurals through i18next plural rules.
- Layout ready for RTL: Tailwind logical utilities (`ms-*`, `me-*`, `ps-*`, `start-*`), `dir` set on
  `<html>` from `languages.ts`.
- Language: detected (querystring `?lang=` → localStorage → browser), switchable in the header,
  persisted, `<html lang>` and meta tags updated.

## 3. Phase 1 — v1.2: foundation, lab wording, fixes

### Wave 1.0 — contract + i18n core (agent K1, alone)
Owns `src/domain/**`, `src/i18n/**`, `src/locales/**` (new), `package.json`, `eslint.config.js`, docs.
1. Add i18next stack, `src/i18n/index.ts`, `languages.ts`, typed resources, key-parity test,
   language detector, `LanguageSwitcher` contract (component itself is built in 1.1 by L1).
2. Contract changes: `FailureReason` gains `ipConflict` and `invalidHostAddress`
   (network / broadcast address used as host IP). `CommandResult` unchanged; `tracert` reuses `trace`.
3. Create empty namespaces for every feature folder so 1.1 agents only fill them.

### Wave 1.1 — parallel (4 agents)
- **E1 engine** (`src/engine/**`): IP conflict detection (both hosts fail with `ipConflict`, like
  Windows "duplicate address" → address unusable), reject network / broadcast addresses, parse `ping`
  options (`-n <count>`, `-t` treated as 4 replies, `-l <size>`; unknown option → Windows-style error),
  `tracert <ip|name>` from the trace path with per-hop lines and `* * *` after the drop point,
  `ipconfig /release`. Tests for each.
- **L1 app shell + exercises UI** (`src/features/scenario/**`, `src/features/result/**`,
  `src/features/layout/**`, `src/App.tsx`, `index.html`, `README.md`): lab wording everywhere
  ("Alıştırmalar / Exercises", "Rehber / Guide" instead of hints, "Doğrula / Verify", "Çözüm raporu /
  Solution report", "Sıfırla / Reset"); remove the timer from the UI; landing becomes a lab landing;
  `LanguageSwitcher` in the header; README in English with a Turkish section and the live link.
- **L2 device + map + session strings** (`src/features/device/**`, `src/features/map/**`,
  `src/features/shared/**`, `src/session/**`): move every literal to locale files;
  `FailedCheckDescriber` returns message ids + params instead of sentences; timer state removed from
  `ScenarioSession` (`ProgressStore` keeps completions + guide steps used; migrate stored v1 data).
- **X1 exercise content** (`src/scenarios/**`, `src/locales/*/exercises.json`): move all scenario texts
  to `exercises` namespace in tr (existing text) and en (new, technically reviewed translation).

### Wave 1.2 — verifier (V1)

## 4. Phase 2 — v2.0: port model and workspace builder

### Wave 2.0 — contracts v2 (agent K2, alone) — done
Design: **`docs/MODEL_V2.md`** (binding for every Phase 2 agent). Code: `src/domain/v2/**` next to v1
(v1 untouched until I2 finishes), `src/lab/migrations/**`, namespaces `catalog`, `workspace`, `lab`.
- Explicit ports (`Port` union on `role`: switched / routed / host / radio / console / passive) with
  `l2` switchport settings, `l3` IPv4 settings, dot1Q sub-interfaces; VLAN database + SVIs on
  switches; static routes, DHCP (pools, exclusions, leases) and DNS (forwarders, records) as data;
  typed `never` extension keys for every later pack.
- `DeviceModel` / `PortTemplate` / capabilities (catalog contract); `device.ports` is authoritative.
- `LinkV2` with `CableType` (copper straight / cross, fiber, serial + DCE end, console, coaxial,
  wireless + SSID) and the pure `CableRules` class (typed refusal reasons, auto-MDIX on by default,
  `autoCable` for the "auto" tool); `StateInvariants` for semantic validation; `MacAddress`.
- Internet: cloud device with per-port `IspHandoff.serviceUp`; WAN up = routed port cabled to a
  serving cloud port + a route out of it.
- `LabDocument` (schemaVersion 2, meta, layout, notes, annotations), `ExerciseDefinition` with locks,
  `NetworkEngineV2` (`FailureReasonV2` adds `ttlExpired`).
- `migrateV1ToV2` / `migrateV1Layout` / `migrateV1Exercise`, tested on all five exercises (structure
  and every v1 field). Engine-level equivalence moves to E2 (below).

### Wave 2.1 — parallel (4 agents)
`src/domain/**` and `src/lab/migrations/**` are frozen; contract changes go through the coordinator.
- **E2 engine on v2** (`src/engine/**`): implement `NetworkEngineV2` per MODEL_V2 §13 (ports and
  `adminUp`, VLAN database, native VLAN / allowed VLANs, routed ports + sub-interfaces, SVIs, static
  routes with longest prefix + AD, `ttlExpired` on loops, WAN rule of §5, DNS forwarders, DHCP pool by
  interface subnet, link lights incl. wireless SSID and copper pinouts). Behavioural equivalence:
  every existing engine and scenario test also runs on `migrateV1ToV2(fixture)` with identical
  results (import from `src/lab/migrations`). Keep the v1 engine exported until I2 switches over.
- **B1 workspace canvas** (`src/features/workspace/**`, `workspace` ns): device palette by
  `DeviceModel.category`, drag to add, cable tool (cable type or "auto" → click port on device A →
  port on device B; `CableRules.checkEnd` highlights usable ports, `check` refusals shown via a
  `workspace:cableRefusal.<reason>` message; serial: first click = DCE; wireless: SSID picker), delete,
  multi-select, align/snap, annotations (`LabDocument.annotations`) and notes, keyboard shortcuts.
- **B2 lab core** (`src/lab/**` except migrations, `lab` ns): zod schemas mirroring `src/domain/v2`
  (reserved `never` keys = must be absent), `LabSerializer` (zod → `StateInvariants` → migrations
  chain by `schemaVersion`; errors as `lab:` message codes), `LabHistory` (undo/redo over immutable
  documents), autosave to IndexedDB, export/import `.agl.json`, share link (compressed document in
  the URL hash), recent labs list, `createEmptyLab()`.
- **C1 device catalog + icons** (`src/catalog/**`, `catalog` ns, `src/features/map/deviceIcons.ts`):
  `DeviceModel`s (router 2/4 port, switch 8/24/48 ± PoE, L3 switch, hub, AP, wireless router, PC,
  laptop, server, printer, IP phone, POS, camera, NVR, kitchen display, smartphone, tablet, cloud/ISP);
  must include every id in `V1_MODEL_IDS` with the ports the migration creates (MODEL_V2 §11);
  `PortFactory` (template → default `Port`, MACs via `MacAddress.derive` from a generated base);
  test that every `nameKey` exists; original SVG icons, physical port strip data per model.

### Wave 2.2 — integration (agent I2)
Workspace becomes the home screen; "Exercises" opens an exercise as a locked lab with verify button
(`migrateV1Exercise` until the exercises are rewritten as `ExerciseDefinition` data, honouring
`locks`); device panel shows ports from the device; settings per port / sub-interface / SVI; UI,
session and solve checks switch to `NetworkEngineV2`; translations for `ttlExpired`; rename
`landing:settings.*` to the English setting ids. Then delete v1 types and engine, drop the `V2`
suffixes (MODEL_V2 §1). Then verifier V2.

### Wave 2.3 — cleanup (agent I3) — done
v1 deleted: the v1 engine, UI (old device panel, network map, scenario session) and domain types;
the engine-equivalence suite became plain tests on `officeLab()` / `vlanLab()` (`src/engine/testNetworks.ts`)
with the v1 expectations unchanged. `src/domain/v2` → `src/domain`, `src/engine/v2` → `src/engine`, every
`V2` suffix dropped. Kept for old data: the five exercises in v1 shape (`src/scenarios`, loaded through
`migrateV1Exercise`), `src/lab/migrations` with `v1Types.ts` and `src/lab/schemas/v1Schemas.ts`.

## 5. Phase 3 — v2.1: packet-level simulation

### Wave 3.0 — contracts (agent K3, alone) — done
Design: **`docs/SIMULATION.md`** (binding for every Phase 3 agent). Code: `src/sim/contract/**` (layered
immutable PDUs, `SimEvent` / `SimTransmission` timeline with typed `SimReason` codes and OSI notes,
per-layer `DeviceRuntime` slices, requests / results / `StateEffect`, the `LinkLayer` / `NetworkLayer` /
`ServiceLayer` plug-in contract, `SimulationEngine`, UI view types, `PduLayers`, `DeviceProfiles`,
`SimMessages`) and the shared core `src/sim/core/**`, implemented and tested: `SimulationKernel` (virtual
clock, `(time, seq)` queue, seeded RNG, request records, snapshots / restore, reconfigure with change
plan, configuration effects), `nullLayers`, `RuntimeTables`, determinism guard test. Namespace
`simulation` (actions, protocols, layers, fields, reasons, starter notes).

### Wave 3.1 — parallel (4 agents)
`src/sim/contract/**` (except the owner-extensible `*LayerState.ts` files) and `src/sim/core/**` are
frozen; contract changes go through the coordinator. Behaviour rules: SIMULATION.md §7.
- **S1 layer 2** (`src/sim/l2/**`, `LinkLayerState.ts` additive, `simulation:notes.l1/l2`): exports
  `linkLayer: LinkLayer`. Hub repeater; bridge with MAC learning / lazy aging / flooding / filtering,
  `VlanRules` access / trunk / native / allowed, SSID ↔ VLAN on radios, SVI endpoints, L2 loop guard;
  endpoint NIC filtering and 802.1Q demux to sub-interfaces; ARP request / reply / cache / buffering /
  3 retries / `onUndeliverable`; duplicate-address probes (both NICs lose the address); cloud ports
  (served only toward routed ports, `serviceUp`, proxy ARP for public addresses); HDLC on serial;
  `clearTable` arp / mac; `interfaceReady`; flush rules of SIMULATION.md §5.3.
- **S2 layer 3** (`src/sim/l3/**`, `NetworkLayerState.ts` additive, `simulation:notes.l3`): exports
  `networkLayer: NetworkLayer`. Routing table built from configuration (connected, local, static with
  recursive next hop, AD, longest prefix; host default route); host send checks in the engine's order;
  router forwarding, TTL, ICMP echo / unreachable / time exceeded sourced from the ingress interface,
  the lab rules (silent drop for public destinations without a route, private destinations never to the
  cloud); transport demux, port unreachable / RST; ISP cloud behaviour; ping and tracert clients with
  Windows timing; router-on-a-stick and L3-switch SVI routing.
- **S3 services** (`src/sim/services/**`, `ServiceLayerState.ts` additive, `simulation:notes.services`):
  exports `serviceLayer: ServiceLayer`. DHCP server (pool by interface / `giaddr`, `DhcpPoolAllocator`,
  exclusions), relay (`ip helper-address`), client DORA / release with effects and `applyEffect`
  (DhcpService rules); DNS client (DnsQuery order and outcomes), server with records and forwarders,
  loop drop, the internet's public resolvers; HTTP client and the cloud's web server; `clearTable` dnsCache.
- **U3 simulation UI** (`src/features/simulation/**`, `simulation:ui.*`): Realtime / Simulation toggle,
  event list with protocol filters, play / pause / step forward / step back (snapshot stack) / speed,
  multiple packets on the map from transmissions, PDU inspector (in / out layers, notes, header details
  via `PduLayers.describe`), "simple PDU" tool. Built against fixtures / `nullLayers`, not S1–S3.

### Wave 3.2 — parallel (2 agents)
- **I3 integration** (`src/engine/**`, `src/session/**`, default wiring `createSimulation` in
  `src/sim/index.ts`): terminal commands (ping, tracert, nslookup, ipconfig /renew /release, `arp -a`)
  and the verify checker run on the simulator with the result mapping of SIMULATION.md §10.1; lab
  document ⇄ engine sync (`reconfigure`, DHCP effects); old rule engine kept only as test oracle;
  tests touched by the accepted divergences (§10.3) updated.
- **O3 oracle tests** (`src/sim/oracle/**`): property-based tests (`fast-check`) on random topologies
  with the oracle table of SIMULATION.md §10.2 (reach, resolve, DHCP, app links, terminal text), golden
  tests for all exercises.
Then verifier V3.

## 6. Phase 4 — v2.2: device CLIs

### Wave 4.0 — contracts (agent K4, alone)
CLI framework contract: modes (user EXEC, privileged EXEC, global config, interface, sub-interface,
line, router, VLAN), command tree with abbreviations, `?` help, Tab completion, `do`, `no` forms,
`% Invalid input detected at '^' marker`. Mapping running-config ↔ device state; startup-config and
`reload` semantics; console access via console cable.

### Wave 4.1 — parallel (4 agents)
- **C1 CLI core** (`src/cli/core/**`): parser, completion, history, pager (`--More--`), output model.
- **C2 switch command set** (`src/cli/switch/**`): `vlan`, `name`, `interface range`,
  `switchport mode/access/trunk`, `shutdown`, `show vlan brief`, `show interfaces status`,
  `show mac address-table`, `show running-config`, `copy running-config startup-config`, `hostname`,
  `enable secret`, `line console/vty`, `ip default-gateway`, SVI.
- **C3 router command set** (`src/cli/router/**`): `interface`, `ip address`, `no shutdown`,
  sub-interfaces + `encapsulation dot1Q`, `ip route`, `ip dhcp pool/excluded-address`,
  `ip helper-address`, `show ip interface brief`, `show ip route`, `show arp`, `ping`, `traceroute`.
- **C4 host commands + config views** (`src/cli/host/**`, `src/features/device/config/**`): Windows set
  (`ipconfig` all forms, `ping`, `tracert`, `nslookup`, `arp -a/-d`, `netstat`, `hostname`), a
  "Config" tab showing running/startup config text, GUI ↔ CLI changes stay in sync.
Golden-file tests for every command. Then verifier V4.

## 7. Phase 5+ — protocol packs and platform

Every row of `docs/PARITY.md` that is not done becomes a **pack**. One agent per pack, same template:
1. contract addition (reviewed by the coordinator before work starts),
2. simulator module + tests, 3. CLI commands + golden tests, 4. GUI config section,
5. PDU inspector explanations (tr + en), 6. at least one exercise using it.

Suggested pack order (each line ≈ one wave of up to 4 agents):
1. STP/RSTP/PVST+, EtherChannel (LACP/PAgP), CDP/LLDP, port security
2. ACL (standard / extended / named), NAT/PAT (static, dynamic, overload), SSH/Telnet + AAA local
3. RIPv2, OSPFv2 (single + multi-area), EIGRP, HSRP
4. IPv6 (addressing, SLAAC, DHCPv6, static, OSPFv3), dual stack
5. Server services (HTTP/HTTPS, FTP, TFTP, email SMTP/POP3, Syslog, NTP, AAA RADIUS/TACACS+), desktop
   apps on hosts (web browser, email client, FTP client)
6. Wireless (WPA2-PSK / Enterprise, wireless router, WLC + lightweight AP), DHCP snooping, DAI
7. WAN: serial/PPP/CHAP, GRE, IPsec site-to-site, BGP basics, firewall device (stateful zones)
8. VTP/DTP, QoS basics, VoIP (IP phones + call manager), SNMP, NetFlow
9. Platform: activity editor with grading (our exercise format), multiuser / shared labs
   (Cloudflare Durable Objects + D1), physical workspace view, IoT devices + scripting
Our extras (not in Packet Tracer): random fault injector for exercises, guided troubleshooting
explanations, browser-only with no account, Turkish-first content.

## 8. Tooling additions
`i18next`, `react-i18next`, `i18next-browser-languagedetector`, `zod`, `fast-check`, `idb-keyval`,
`lz-string`. Simulator runs in a Web Worker from Phase 3 on (UI never blocks). React Flow stays for
the canvas. Code-split: workspace, simulation and CLI chunks are lazy-loaded.

## 9. Definition of done per phase
Build, tests and lint green; no file > 500 lines; tr and en complete (parity test); every new feature
has tests; verifier ran the app on desktop and 360 px in both languages; `docs/PARITY.md` updated.

# AgArizaLab — v1 plan

Browser-based, Turkish, open-source **network troubleshooting game**. A small business network
(restaurant / office / shop) is broken; the player clicks devices, reads settings, runs
`ping` / `ipconfig` / `nslookup`, finds the fault, fixes it and presses "Çözdüm, kontrol et".
NOT a general network simulator. No AI in v1 (hand-written hints). No accounts.

Contracts (single source of truth): `src/domain/NetworkTypes.ts`, `src/domain/EngineContract.ts`,
`src/domain/ScenarioTypes.ts`. Do not change them silently; if a change is unavoidable,
stop and report it instead of editing.

## 1. Coding rules (binding for every agent)

- TypeScript `strict: true`, no `any`, no non-null `!` unless provably safe.
- No kebab-case in names we choose (files, folders, ids). Components `PascalCase.tsx`,
  classes `PascalCase.ts`, other modules `camelCase.ts`.
- **No file over 500 lines.** One responsibility per file and function.
- Business logic / engine / services = **classes**. React UI = **function components + hooks**.
- No duplicated code, but no abstraction before real duplication.
- Errors are never swallowed: no empty `catch`. Engine returns typed results (`ok: false, reason`)
  instead of throwing for network outcomes; throw only for programmer errors.
- All user-facing text is **Turkish**; code identifiers and comments are English.
- Terminal command output imitates **Windows (English)** output, since that is what the player
  will see at work and in interviews.
- Bash: single plain commands only; no `cd … &&`, no `$(…)`, no heredoc. Use `npm --prefix <dir>`.
- Do not commit; the coordinator commits after each wave. Touch only the files of your task.

## 2. Stack

Vite 8 + React 19 + TypeScript 6.0 (strict; 7.x not yet supported by typescript-eslint) + Tailwind CSS 4 (`@tailwindcss/vite`) + Vitest 5
+ lucide-react (icons). Map = hand-written SVG (no React Flow: fixed small maps).
State = React hooks + an immutable `ScenarioSession` class. Progress = localStorage (try/catch,
failures logged with `console.warn`, app works without it). Hosting later: Cloudflare Pages.

## 3. Folder structure

```
docs/PLAN.md
src/
  domain/        NetworkTypes.ts, EngineContract.ts, ScenarioTypes.ts   (contracts)
  engine/        Ipv4.ts, SegmentFinder.ts, ReachabilityChecker.ts, DnsResolver.ts,
                 DhcpService.ts, AppLinkChecker.ts, CommandRunner.ts, CommandFormatter.ts,
                 SolveChecker.ts, internetHosts.ts, DefaultNetworkEngine.ts, index.ts
                 + *.test.ts next to each class
  scenarios/     posGateway.ts, printerDhcp.ts, cameraSubnet.ts, kitchenVlan.ts, wrongDns.ts,
                 index.ts, scenarios.test.ts
  session/       ScenarioSession.ts (+ test), ProgressStore.ts, useScenarioSession.ts
  features/
    map/         NetworkMap.tsx, DeviceNode.tsx, LinkLine.tsx, deviceIcons.ts
    device/      DevicePanel.tsx, InfoTab.tsx, SettingsTab.tsx, TerminalTab.tsx
    scenario/    ScenarioHeader.tsx, ComplaintCard.tsx, HintButton.tsx, ScenarioList.tsx
    result/      ResultScreen.tsx
  App.tsx, main.tsx, index.css
```

## 4. Engine rules (the "brain")

Engine is pure and stateless; implements `NetworkEngine`. Exported instance from
`src/engine/index.ts`: `export const networkEngine: NetworkEngine`.

### 4.1 Layer 2 segment (SegmentFinder)
A segment = set of (deviceId, vlan) that can talk at layer 2.
- A link counts only if `connected` and both devices `powered`.
- Host wired port `eth0` plugged into a switch **access** port → host is in that port's VLAN.
  Disabled switch port → link dead.
- Switch **trunk** port, router `lan`, AP `uplink` carry every VLAN.
- Wireless link: client `wlan0` ↔ AP `radio`; VLAN = the AP `wirelessNetworks` entry whose
  `ssid` equals `link.ssid`.
- Host directly on router `lan` (no switch) → VLAN 1.
- Router is in a VLAN's segment if it has a `routerInterfaces` entry for that VLAN.
- Traverse switches/APs with BFS keeping the VLAN; never leak between VLANs at layer 2.

### 4.2 reach(from, toIp) — checks in this order, first failure wins
1. `from` powered → else `powerOff`.
2. `from` has `host`, link on eth0/wlan0 exists and is connected → else `cableDisconnected`;
   switch port enabled → else `portDisabled`.
3. `host.ip` non-empty and valid, mask valid → else `noIpAddress` / `invalidConfig`.
4. `toIp` inside `from`'s subnet (by `from`'s mask):
   - a powered device with that IP (host ip or router interface ip) is in the same segment
     → ok; else `destinationNotInSegment`.
5. Otherwise gateway needed: gateway empty → `gatewayNotSet`; gateway not in own subnet
   → `gatewayOutsideSubnet`; no router interface with that IP in the segment → `gatewayUnreachable`.
6. At the router:
   - `toIp` inside one of its interface subnets → find a host with that IP in that VLAN's
     segment → ok, else `destinationNotInSegment` (atDeviceId = router). Inter-VLAN routing is
     allowed (no ACLs in v1). The destination host must also have a gateway that is that router
     interface (reply path); else `gatewayUnreachable` (atDeviceId = destination).
   - `toIp` public (not 10/8, 172.16/12, 192.168/16, 127/8) → `wanUp` true → ok, else `wanDown`.
   - other private address → `noRouteToDestination`.
- `path` = device ids along the way (for display only).

### 4.3 resolve(from, name)
- `host.dns` empty → `dnsNotSet`. Try each server in order:
  - server is a public DNS in `internetHosts.publicDnsServers` (8.8.8.8, 1.1.1.1, 9.9.9.9)
    → needs `reach(from, server)` ok;
  - server is a router interface IP with `dnsForwarding` → needs reach ok and router `wanUp`;
  - anything else: if reach fails → try next; if a host answers but is not a DNS → `dnsNoAnswer`.
- First server that works: known name in `internetHosts.names` → ok with ip; else `nameNotFound`.
- All failed → `dnsUnreachable` (or the last specific reason).
- `internetHosts.names`: google.com, odeme.ornekbanka.com.tr, siparis.ornekyemek.com,
  bulut.ornekyedek.com (fictional Turkish-looking names, plain map name → public IP).

### 4.4 appLinkStatus(deviceId)
For each AppLink: `reach(device, targetIp)` ok AND the device at targetIp has kind
`targetKind` and is powered → ok; reach ok but kind differs → `wrongDeviceAtAddress`.

### 4.5 renewDhcp(deviceId)
Host must be `mode: 'dhcp'` (static → `invalidConfig`). Find the router in the host's segment
with a `dhcpPools` entry for that VLAN → else `dhcpNoServer`. Reuse the existing lease for the
host MAC, otherwise first free IP in range not used by any device → else `dhcpPoolExhausted`.
Returns new state with host ip/mask/gateway/dns from the pool and the lease recorded.

### 4.6 runCommand — Windows-style output
- `ipconfig`, `ipconfig /all` (adds MAC, DHCP Enabled, DNS Servers), `ipconfig /renew`
  (calls renewDhcp, returns `nextState`), `ping <ip|name>` (name → resolve first; 4 replies
  "Reply from X: bytes=32 time=Nms TTL=128" or 4x "Request timed out." / "Reply from
  <gw>: Destination host unreachable." for routing failures, plus statistics),
  `nslookup <name>` ("Server: … Address: …" / "*** … can't find …: Non-existent domain" /
  "DNS request timed out."), `help` (Turkish list), unknown → Turkish error line.
- Deterministic output (no Math.random) so tests are stable. Formatting lives in
  CommandFormatter, logic in CommandRunner.

### 4.7 SolveChecker
`check(state, conditions): { condition, ok }[]` using the engine.

## 5. Scenarios (data only, Turkish texts)

All use 255.255.255.0. Router name 'Modem / Router', switch 'Switch'. MACs unique,
format `AA:BB:CC:DD:EE:FF`. Positions on a 1000x600 map: internet top, router below, switch
in the middle, end devices along the bottom. Every scenario has an `internet` device linked
to router `wan`. Unbroken devices must work (tests check it).

| id | Setting | Complaint (from) | Topology | Fault | solvedWhen |
|---|---|---|---|---|---|
| posGateway | restoran | Şube müdürü: "Yeni şubede kasa internete çıkmıyor, kartla ödeme alamıyoruz." | Router LAN 192.168.10.1 VLAN1, DHCP .100–.200, dnsForwarding, wanUp. Switch Fa0/1–8 access VLAN1. Kasa (pos) static .20, Mutfak ekranı dhcp .101, Müdür PC dhcp .102 | Kasa gateway **192.168.1.1** (old branch). dns 8.8.8.8 | internet(kasa), resolves(kasa, odeme.ornekbanka.com.tr) |
| printerDhcp | ofis | Ofis müdürü: "Yazıcı dün çalışıyordu, bugün kimse çıktı alamıyor." | Router 192.168.1.1, DHCP .100–.200. PC Muhasebe dhcp .101, PC Satış dhcp .102, both AppLink 'Yazıcı' → 192.168.1.150 (printer). Yazıcı dhcp, current ip **.153** (lease for its MAC = .153) | Printer got a new DHCP address; PCs still point to .150 | appLinksOk(muhasebe), appLinksOk(satis) — solvable by setting the printer static .150 (best practice) or by changing both PCs' AppLink |
| cameraSubnet | magaza | Mağaza sorumlusu: "Kayıt cihazında 3 numaralı kameradan görüntü yok." | Router 192.168.1.1. PoE switch. NVR static .50 with AppLinks Kamera 1 .61, Kamera 2 .62, Kamera 3 .63 (camera). Kamera 1 .61, Kamera 2 .62 static | Kamera 3 reset to factory: static **192.168.0.64**, gw 192.168.0.1 | appLinksOk(nvr) |
| kitchenVlan | restoran | Mutfak şefi: "Kasadan girilen siparişler mutfak ekranına düşmüyor." | Router VLAN10 192.168.10.1 (İşletme), VLAN20 192.168.20.1 (Misafir), DHCP for both. Switch Fa0/1 trunk→router, Fa0/2 VLAN10 Kasa static 192.168.10.20 (AppLink 'Mutfak ekranı' → .30), Fa0/3 Mutfak ekranı static 192.168.10.30, Fa0/4 trunk→AP. AP SSIDs 'Isletme'→10, 'Misafir'→20. Misafir telefonu wireless on 'Misafir' dhcp | Switch **Fa0/3 is access VLAN 20** | appLinksOk(kasa), internet(misafirTelefonu) |
| wrongDns | ofis | Muhasebe: "İnternet var diyorlar ama bilgisayarımda hiçbir site açılmıyor." | Router 192.168.1.1 dnsForwarding, wanUp. PC Muhasebe static .20 gw .1. PC Satış dhcp .101 works | Muhasebe DNS **192.168.1.254** (removed old modem) | resolves(muhasebe, google.com), internet(muhasebe) |

Each scenario: 3 hints (direction → location → exact answer) and explanation
(whatHappened / realLife / interviewAnswer), topics. Technical accuracy matters more than style.

## 6. UI

Desktop: header (title, scenario n/5, timer, Hint), complaint card (chat bubble), left = SVG map,
right = device panel with tabs **Bilgi** (power, links/port/VLAN, AppLink statuses with
green/red), **Ayarlar** (edit host mode/ip/mask/gateway/dns, switch ports vlan/mode/enabled,
cable plugged toggle, AppLink target IPs, power), **Terminal** (dark, command input, history).
Footer: "Not defterim" textarea + "Çözdüm, kontrol et". Wrong answer → show which conditions fail
in plain Turkish (do not reveal the fault). Correct → ResultScreen: whatHappened, realLife,
interviewAnswer, time, hints used, next scenario. ScenarioList start page with 5 cards and
completed ticks. Phone (<768px): map on top, device panel as bottom sheet. Light theme, calm colors.
Do not show the fault on the map (no red cable on the broken link).

## 7. Work waves (agents)

| Wave | Agent | Task | Depends on |
|---|---|---|---|
| 1 | A | Scaffold: Vite react-ts, strict tsconfig, Tailwind 4, Vitest, ESLint, lucide-react, `npm run build/test/lint` scripts, README (Turkish, short), MIT LICENSE (Süleyman Talha Duman), .gitignore. Keep `src/domain` and `docs`. Placeholder App. | — |
| 2 | B | Engine (§4) + unit tests for every rule and failure reason | A |
| 2 | C | Scenarios (§5) + `scenarios.test.ts` (shape checks; behaviour checks run in wave 3) | A |
| 2 | D | UI components (§6) against contracts, with a small local mock state; no engine import yet | A |
| 3 | E | Integration: ScenarioSession + hook + ProgressStore, wire UI to engine and scenarios, solve check, result screen, phone layout; scenario behaviour tests (initially unsolved, broken symptom present, scripted fix solves it, other devices fine) | B, C, D |
| 4 | V | Verifier: build, tests, lint, 500-line check, rule check, play all 5 in browser | E |

Definition of done (v1): all 5 scenarios playable end to end on desktop and phone, tests green,
build green, no file > 500 lines.

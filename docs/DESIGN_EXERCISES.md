# Design exercises ("Tasarım görevleri")

Status: proposal (2026-11-06), requested by the product owner. Track runs next to Phase 3.

Troubleshooting exercises teach steps 5 and 7 of a real network project (test, support). Design
exercises teach steps 1–4: understand a customer brief, design the network, build it, prove it works —
the way a system integrator delivers a factory, school or hotel network.

## 1. What the learner sees
- A **customer brief** (story + requirement list), e.g. *"Factory: 2 buildings 200 m apart, office
  with 40 people, production hall with 12 machines (OT), 8 cameras, guest Wi-Fi. Cameras must be
  viewable from the office, guests must not reach any internal device, production must keep working
  if the office switch fails."*
- A **starting lab**: the customer's end devices are already placed and locked (PCs, machines, cameras,
  printers, the ISP cloud), optionally building zones as canvas annotations. The learner adds the
  infrastructure: switches, routers, APs, cabling, VLANs, addressing, DHCP, routes.
- A **live requirement checklist** next to the canvas: every requirement turns green as soon as the
  lab satisfies it (re-evaluated after each change, debounced). Hidden requirements are allowed for
  "acceptance test" style grading.
- Optional **budget**: each catalog model has a price; the brief sets a limit → the learner also
  practises the quotation step ("teklif").
- At the end: a **design review report** — which requirements passed, cost, device count, single
  points of failure, a reference design with explanation (tr + en), and "how to present this
  design to the customer / in an interview".

## 2. Requirement types (new solve conditions)
Groups are sets of device ids (tags in the exercise data, e.g. `office`, `camera`, `guest`, `ot`).
- `reachable(fromGroup, toGroup)` / `notReachable(fromGroup, toGroup)` (isolation)
- `internet(group)`, `resolves(group, name)`
- `dhcpServes(group)` — every member gets an address by DHCP
- `separateSubnets(groupA, groupB)` / `sameVlan(group)`
- `survivesFailure(linkOrDeviceId, requirement)` — re-run a requirement with that link/device down
- `maxCost(amount)`, `maxDevices(kind, n)`, `uses(capability)` (e.g. a firewall must exist)
- `addressPlan(group, prefix)` — members' addresses inside a given network
All evaluated by the engine on a copy of the lab (pure), each with a LocalizedMessage description
that states the requirement, never the solution.

## 3. Engine dependencies
- Works with today's engine: reachability, VLANs, routing, DHCP, DNS, internet, isolation when
  networks are not routed together.
- Isolation between VLANs that share a router needs ACLs (pack 5.2) — until then such briefs use a
  separate guest router / wireless router.
- L2 redundancy needs STP (pack 5.1); L3 redundancy (two routes) works now.

## 4. First briefs (tr + en)
1. **Küçük ofis** — 6 PCs, a printer, internet; DHCP for PCs, static printer address.
2. **Restoran** — POS + kitchen display + guest Wi-Fi; guests isolated from POS.
3. **Okul laboratuvarı** — 3 classrooms in separate VLANs, a teacher PC that reaches all, one router.
4. **Fabrika** — 2 buildings linked by fiber, office / production (OT) / camera / guest networks,
   cameras viewable from the office, budget limit; (after 5.1/5.2: survives a switch failure,
   OT isolated by ACL).
5. **Otel** — per-floor access switches, guest Wi-Fi per floor, reception and camera networks.

## 5. Work split (when scheduled)
- **D0 contract (alone):** requirement types, groups/tags in `ExerciseDefinition`, pricing in the
  catalog contract, `RequirementChecker` interface, brief text layout in the `exercises` namespace.
- **D1 checker** (`src/design/**`): requirement evaluation incl. failure simulation, design-review
  analysis (single points of failure, cost).
- **D2 UI** (`src/features/design/**`): brief panel, live checklist, budget meter, review report.
- **D3 content** (`src/scenarios/design/**`, `exercises` ns): the five briefs above with reference
  designs, tested: starting lab fails every requirement, reference design passes all.

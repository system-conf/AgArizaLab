# Design exercises ("Tasarım görevleri")

Status: approved (2026-11-06); contract fixed by D0 (§6). Track runs next to Phase 3.

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

## 5. Work split
- **D0 contract (done, 2026-11-06):** types in `src/domain/ExerciseTypes.ts`, the `src/design/**` core
  (checker, review, prices, validator), the `design` namespace with the requirement texts, §6.
- **D1 checker** (`src/design/**`; `design:requirements.*`, `design:failures.*`, `design:review.*`):
  refinements of the evaluation (DHCP settle speed-up together with the engine owner, isolation with
  ACLs after pack 5.2, L2 redundancy after STP 5.1, more failure scopes if briefs need them), more
  review analysis (address-plan table, unused ports), and later the **network documentation export**
  (BACKLOG item 7: topology picture, IP plan, VLAN table, port-to-device list, device summary — the
  final deliverable of a brief) as a pure `DesignDocumentation` builder plus the D2 screen.
- **D2 UI** (`src/features/design/**`; `design:ui.*`, `design:settings.*`): brief list and brief
  panel, live checklist (debounced `RequirementChecker.check`, hidden requirements left out, `measure`
  as "3 / 5"), budget meter (`DesignInventory.totalCost` / `cost`), palette filter
  (`CatalogFilterPolicy`), review report (`DesignReview.analyze`), localizer (`DesignExercise` from the
  definition + `design:briefs.<id>.*`), opening a brief as a lab (customer devices + zone
  annotations), enforcing `placement` locks (§6.7).
- **D3 content** (`src/scenarios/design/**`; `design:briefs.*`): the five briefs of §4 with reference
  designs and texts (tr + en). Tests per brief: `new DesignBriefValidator().issues(brief)` is empty; on
  `brief.lab.state` every requirement fails except the limits (`maxCost`, `maxDevices`); on
  `brief.reference.state` every requirement passes (so the reference cost is within the budget).
  Template: `src/design/testBriefs.ts` (`officeBrief()`).

## 6. Contract (D0)

### 6.1 Brief data — `DesignExerciseDefinition` (`src/domain/ExerciseTypes.ts`)
| Field | Meaning |
|---|---|
| `id`, `order` | camelCase id = key under `design:briefs`; list order |
| `setting` | `DesignSetting` = `restaurant · office · shop · school · factory · hotel` (card icon, `design:settings.<setting>`) |
| `lab: DesignLab` | starting lab `{ state, layout, annotations }`: the customer's devices, optional building zones as annotations |
| `locks: ExerciseLock[]` | never `topology` (the learner builds it); every customer device gets the new `{ scope: 'placement', deviceId }` lock (cannot be deleted; may be moved, cabled, configured); section locks as the story needs (e.g. `power` readOnly) |
| `groups: DeviceGroup[]` | `{ id, name, deviceIds }`: members are device ids of the starting lab; `name` is a placeholder (= id) |
| `requirements: DesignRequirement[]` | `{ id, condition: DesignCondition, hidden?, weight? }` (§6.2) |
| `budget?` | price units for the budget meter; graded by a `maxCost` requirement with the same amount |
| `allowedModels?: CatalogFilter` | `{ categories?, modelIds? }`: a model is offered when its category or its id is listed; absent = whole catalog |
| `reference: DesignLab` | a design meeting every requirement; contains every starting device with the same id |
| `reviewHints: ReviewHint[]` | `{ id, requirementId? }`: shown in the review always, or only when that requirement failed |

`DesignExercise` = definition + `texts: DesignBriefTexts` (`title`, `customer { from, message }`,
`reference { explanation, presentation, interviewAnswer }`, `topics`) with device, group and zone
names filled in — localized the same way as `Exercise` (MODEL_V2 §10).

### 6.2 Requirements — `DesignCondition`
Exact union (field names fixed):

| `type` | Fields | Holds when |
|---|---|---|
| `reachable` | `fromGroup, toGroup` | every member of `fromGroup` pings the first address of every member of `toGroup` (self-pairs skipped) |
| `notReachable` | `fromGroup, toGroup` | no such pair works **and** every member of both groups is in service (has an address and reaches its default gateway or another member of its own group): an unplugged network is not "isolated" |
| `internet` | `group` | every member reaches 8.8.8.8 |
| `resolves` | `group, name` | every member resolves `name` with its DNS settings |
| `dhcpServes` | `group` | every member has a NIC in DHCP mode and a DHCP server answers it |
| `separateSubnets` | `groupA, groupB` | every member of both has an address and no connected subnet of A overlaps one of B |
| `sameVlan` | `group` | all members are in one layer-2 broadcast domain (engine `SegmentFinder`) |
| `addressPlan` | `group, prefix` | every member has an address and all its addresses lie in `prefix` (CIDR `a.b.c.d/n`) |
| `survivesFailure` | `failure: FailureTarget, requirement: NetworkCondition` | `requirement` holds with everything up and in every failure case |
| `uses` | `capability: DeviceCapability` | a powered device whose catalog model has the capability has a link up |
| `maxCost` | `amount` | price of the **added** devices and cables ≤ `amount` |
| `maxDevices` | `kind?, count` | number of **added** devices of `kind` (absent = any kind) ≤ `count` |

`NetworkCondition` = the first eight; `LimitCondition` = `maxCost | maxDevices`.
`FailureTarget` refines `survivesFailure(linkOrDeviceId, …)` of §2, because the learner's devices do
not exist when the brief is written:
- `{ scope: 'device', deviceId }` / `{ scope: 'link', linkId }`: an element of the starting lab (e.g.
  the ISP cloud = internet outage). A device fails by losing power, a link by being unplugged.
- `{ scope: 'anyDevice', kinds }`: each powered device of those kinds, one at a time, except the
  members of the inner requirement's groups and the devices directly linked to them (their access
  switch / AP — a single-homed device always depends on it).
- `{ scope: 'anyLink' }`: each plugged link, one at a time, except links ending on such a member.

`hidden: true` = not in the live checklist; graded and shown in the review. `weight` (default 1) =
share of the score. A deleted group member makes every requirement on its group fail.

### 6.3 Evaluation rules (`RequirementChecker`)
- Pure: evaluates on copies, never mutates the lab. One instance per brief (texts are built once).
- **DHCP settle:** before evaluating, every powered end device with a DHCP NIC requests an address on
  a copy (`DhcpSettler`, device order); a client without an answer loses its old address. The checker
  grades the designed network, not whether the learner has run `ipconfig /renew`.
- Under a failure, leases are kept (clients keep their addresses, as in reality); `dhcpServes` asks
  again, so a dead DHCP server is noticed.
- Limits hold for an empty design; the review scores them only when every other requirement holds.
  "The start fails every requirement" therefore means: every requirement except the limits.
- Speed: ~140 ms per `check` on a 101-device lab with 14 requirements, two thirds of it DHCP settle
  (`RequirementChecker.perf.test.ts`, regression bound 600 ms). D2 debounces (≥ 300 ms) and checks once
  per settled change; a Web Worker can follow with BACKLOG item 6.

### 6.4 Prices
`src/design/prices.ts`: `PriceList { models: Record<modelId, number>, kinds: Record<DeviceKind, number>,
cables: Record<CableType, number> }` and `DEFAULT_PRICE_LIST` in neutral **price units**
(`design:units.price` = "{{amount}} units" / "birim"), with realistic proportions (router2Port 650,
switch8 180, switch24Poe 800, accessPoint 220, copper patch cable 5, fiber 40, wireless 0).
`PriceCatalog` looks up `models[modelId]`, else `kinds[kind]`, so new catalog models get a price without
editing this file; src/catalog stays price-free. Only devices and links whose id is not in the starting
lab are priced (the customer already owns the rest).

### 6.5 Texts (`design` namespace, tr + en)
| Keys | Owner | Content |
|---|---|---|
| `units.*`, `requirements.*`, `failures.*` | D0 → D1 | checker messages (`requirements.maxDevices.<kind>`, `requirements.uses.<capability>`, fallback `.other` for kinds / capabilities added later) |
| `review.*` | D1 | report texts produced by pure code |
| `ui.*`, `settings.<setting>` | D2 | screens |
| `briefs.<briefId>.*` | D3 | `title`, `customer.from`, `customer.message`, `groups.<groupId>`, `devices.<deviceId>`, `zones.<annotationId>`, `reviewHints.<hintId>`, `reference.explanation`, `reference.presentation`, `reference.interviewAnswer`, `topics[]` |

Requirement messages state the requirement with group names, never the solution. A `survivesFailure`
result carries the inner requirement as `description` and the failure as `qualifier` ("… even when X
is down"); device names there come from the (localized) starting lab. Everyone edits only their own
subtree of `design.json`, in tr and en together; re-read the file right before editing.

### 6.6 Fixed cross-agent API (`src/design/index.ts`; code against these names)
- `new RequirementChecker(rules: DesignRules, options?: { engine?, prices?: PriceCatalog, findModel? })`
  with `DesignRules = Pick<DesignExerciseDefinition, 'groups' | 'requirements'> & { lab: { state } }`.
  `check(state): RequirementResult[]` — every requirement incl. hidden, in brief order;
  `RequirementResult { requirement, ok, description: LocalizedMessage, qualifier?, measure?: { unit:
  'members' | 'pairs' | 'cost' | 'devices', value, limit }, brokenBy? }`. Lower level (D1):
  `prepare(state)`, `evaluate(prepared, condition)`, `evaluateNetwork(settled, condition)`,
  `result(requirement, outcome)`, `inventory: DesignInventory`, `groups: GroupMembers`.
- `new DesignReview(brief: DesignReviewBrief, options?)` → `analyze(state): DesignReviewReport {
  results, solved, score: { earned, possible }, cost: CostSummary, budget?, counts: DeviceCounts,
  singlePointsOfFailure: { deviceId, breaks: requirementId[], access }[], hints: ReviewHint[] }`;
  static `DesignReview.score(results)`. A single point of failure is an infrastructure device (not a
  group member, not the cloud) whose power-off breaks a met `reachable` / `internet` / `resolves`
  requirement; `access` = it is directly linked to an affected member.
- `new DesignInventory(startingState, prices?)` → `addedDevices(state)`, `addedLinks(state)`,
  `cost(state): CostSummary { total, devices: { modelId, kind, count, unitPrice, subtotal }[], cables:
  { cable, count, unitPrice, subtotal }[] }`, `totalCost(state)`, `counts(state): { provided, added,
  addedByKind }`.
- `PriceCatalog.default` / `new PriceCatalog(list)` → `priceOfModel(modelId, kind)`,
  `priceOfDevice(device)`, `priceOfLink(link)`; `DEFAULT_PRICE_LIST`, `PriceList`.
- `new CatalogFilterPolicy(brief.allowedModels)` / `CatalogFilterPolicy.everything` → `allows(model)`.
- `new DesignBriefValidator(findModel?)` → `issues(brief): { code: BriefIssueCode, subject }[]`.
- Helpers: `Cidr`, `DhcpSettler`, `FailureScenarios`, `GroupMembers`, `NetworkConditionEvaluator`,
  `conditionGroups`, `RequirementDescriber`.

### 6.7 Open questions
1. **`placement` lock enforcement** belongs in `src/session/ExerciseLockPolicy.allowedDeletion` (shared
   code, not owned by the design track): who changes it — D2 or the session owner?
2. **One `design.json`, three writers** (D1/D2/D3). If parallel edits conflict, move `briefs` into a
   `designBriefs` namespace owned by D3.
3. **DHCP settle cost**: an engine-side batch renew would remove most of the ~90 ms on 100 devices.
4. **`uses(capability)`** checks equipment (catalog capability), not configuration; service behaviour
   is graded by the network requirements. Enough for "a firewall must exist" once pack 5.7 adds it.


### Coordinator decisions (2026-11-06, after D0)
1. The `placement` lock is enforced by D2 in `src/session/ExerciseLockPolicy.ts` (D2 owns that file for its wave).
2. Brief texts move to a separate namespace `designBriefs` owned by D3; `design` keeps `units`, `requirements`, `failures` (D0/D1), `review.*` (D1), `ui.*` + `settings.*` (D2).
3. Engine batch DHCP renew: later optimisation, only if live checking feels slow in the UI.
4. `uses(capability)` = equipment present; configuration checks are expressed with network requirements.

### Requirement types to add later (gaps found while writing the first briefs)
- `staticAddress(group)` — address configured statically (today approximated with `addressPlan` /32).
- `deviceInZone(kind, zoneId, min)` — e.g. "an access switch / AP on every floor".
- `linkMedium(zoneA, zoneB, medium)` / cable length — "fiber between the buildings" (with the physical view).
- `noInternet(group)` — e.g. OT must not reach the internet.
- `poweredByPoe(group)` — with a PoE budget model.
- ACL-based isolation (pack 5.2), STP-based switch redundancy (5.1), gateway redundancy HSRP/VRRP (5.3),
  NAT-aware guest routers (5.2). Texts currently live in `designBriefs:<id>.*` (not `design:briefs.*`).

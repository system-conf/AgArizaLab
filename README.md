# Octetlab — a network lab in your browser

[Türkçe](README.tr.md) · **Live:** https://octetlab.slovveis.workers.dev

Octetlab is an open-source network lab that runs entirely in the browser: build a network, cable
it, configure it from a GUI or an IOS-style command line, and watch every packet move in
simulation mode. No installation, no account, works on desktop and tablet. Available in
**English** and **Turkish**, ready for more languages.

## What you can do

- **Build networks** — drag routers, switches (L2 / L3, PoE), hubs, access points, wireless
  routers, modems, servers, PCs, laptops, phones, printers, cameras, NVRs and more onto the map
  (37 device models), connect them with the right cable and see link lights come up.
- **Configure** — ports, VLANs, trunks, SVIs, router-on-a-stick, static and floating routes, DHCP
  (pools, exclusions, relay), DNS, Wi-Fi SSIDs; from the settings panel or from the **device CLI**
  (`enable`, `conf t`, `interface`, `switchport`, `ip address`, `show vlan brief`,
  `show ip route`, `show running-config`, `?` help, Tab completion, `--More--` paging).
- **Test** — a Windows-style terminal on end devices (`ping`, `ipconfig`, `nslookup`,
  `tracert`, `arp -a`).
- **Simulation mode** — a deterministic packet-level simulator: step through ARP, DHCP, DNS, ICMP
  and VLAN tagging event by event, inspect each PDU layer by layer, filter by protocol, and export
  the capture as a `.pcap` file for Wireshark.
- **Sample labs** — 24 short lessons (basics, DHCP, DNS, switching, routing, packet view), each a
  ready lab with "try this" steps that are checked automatically and "break it" ideas.
- **Troubleshooting exercises** — real-world faults in small business networks (a restaurant, an
  office, a shop): find the wrong setting, fix it, verify; a report explains what happened.
- **Design tasks** — a customer brief (small office, restaurant, school, factory, hotel) with
  requirements, a budget and a live checklist; submit for a review and get a handover pack
  (topology, IP plan, VLAN table, port list).
- **Your files** — labs autosave in the browser, export / import as `.agl.json`, share as a link,
  export every device's configuration as text.
- **Preferences** — light / dark / system theme, map labels, grid and snap, animation speed,
  terminal and CLI options.

Octetlab is a learning lab, not a game: no points, no lives, just networks that behave like real
ones. The roadmap (dynamic routing, STP, ACL / NAT, IPv6, wireless security, WAN, servers and more)
is in [docs/PLAN_V2.md](docs/PLAN_V2.md) and [docs/PARITY.md](docs/PARITY.md).

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # development server
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run build      # type-check and production build
npm run deploy     # build and deploy to Cloudflare Workers (static assets)
```

## Testing

- **Unit tests:** `npm test` (Vitest, `src/**/*.test.ts`), including golden CLI transcripts and
  an oracle that compares the simulator with the rule engine on generated labs.
- **End-to-end tests:** `npm run test:e2e` (Playwright, `e2e/`). It builds the app and serves it
  with `vite preview` on port 4199, then runs a smoke suite in Chromium (desktop) and at a
  360 × 740 phone size (tests tagged `@mobile`). First time: `npx playwright install chromium`.
  `npm run test:e2e:ui` opens Playwright's UI mode. Variables: `E2E_SKIP_BUILD=1` serves the
  existing `dist/`; `E2E_BASE_URL=<url>` tests a running app instead (e.g. a preview deploy).
  Selectors use English accessible names (`?lang=en`); renaming a label in `src/locales/en`
  may need the same change in `e2e/`.
- **CI** (`.github/workflows/ci.yml`, every push and pull request): lint, e2e type-check, unit
  tests, build, Playwright; the Playwright report is uploaded as an artifact when a step fails.
- **Preview deploys** (`.github/workflows/preview.yml`, optional): every pushed branch is uploaded
  as a Cloudflare Workers preview version; production is not changed. It runs only if the
  repository has the `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit) and `CLOUDFLARE_ACCOUNT_ID`
  Actions secrets, and is skipped otherwise.

## Add a language

1. Copy `src/locales/en/` to `src/locales/<code>/` and translate every value (keep the keys and
   `{{placeholders}}` unchanged).
2. Add one line to `src/i18n/languages.ts`: `{ code, nativeName, dir }`.

That is all; `npm test` checks that every key and placeholder matches English. Details and the
rules for UI code are in [docs/I18N.md](docs/I18N.md). Device output (Windows `ping`, IOS
`show` commands, …) stays in English in every language, as on real equipment.

## Documentation

| Document | Contents |
|---|---|
| [docs/PLAN_V2.md](docs/PLAN_V2.md) | Roadmap, phases and code rules |
| [docs/PARITY.md](docs/PARITY.md) | Feature checklist against desktop network simulators |
| [docs/MODEL_V2.md](docs/MODEL_V2.md) | Lab model: devices, ports, cables, locks |
| [docs/SIMULATION.md](docs/SIMULATION.md) | Packet-level simulator design |
| [docs/CLI.md](docs/CLI.md) | Device command line |
| [docs/SAMPLE_LABS.md](docs/SAMPLE_LABS.md) | Sample lab library |
| [docs/DESIGN_EXERCISES.md](docs/DESIGN_EXERCISES.md) | Design tasks |
| [docs/PREFERENCES.md](docs/PREFERENCES.md) | Preferences and theme tokens |
| [docs/I18N.md](docs/I18N.md) | Translations |

## Trademarks

Cisco, IOS and Packet Tracer are trademarks of Cisco Systems, Inc. Octetlab is an independent
project, not affiliated with or endorsed by Cisco. The command line follows the widely taught IOS
syntax for learning purposes; all icons, artwork and lab content are original.

## License

MIT — see [LICENSE](LICENSE).

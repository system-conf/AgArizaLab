# AgArizaLab — Network Troubleshooting Lab

A browser-based, open-source **network lab**. Build your own network in the workspace: drag routers,
switches, access points and computers onto the canvas, connect them with the right cable, configure
ports, VLANs, routes, DHCP and DNS, and test with `ping`, `ipconfig`, `nslookup` and `tracert`.
Labs are saved in your browser automatically and can be exported as `.agl.json` files or shared as
a link.

**Exercises** add real-world faults from small business networks (a restaurant, an office, a
shop): find the wrong setting, fix it and verify. A solution report then explains what happened,
how it shows up in real life and how to describe it in a job interview — and opens the repaired
network in the lab if you want to keep experimenting.

No installation, no account. Available in **English** and **Turkish**.

**Live:** https://agarizalab.slovveis.workers.dev — `/lab` opens the workspace, `/exercises` the
exercises.

Coming next: packet-level simulation and device command lines (see [docs/PLAN_V2.md](docs/PLAN_V2.md)).

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # development server
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run build      # type-check and production build
```

## Testing

- **Unit tests:** `npm test` (Vitest, `src/**/*.test.ts`).
- **End-to-end tests:** `npm run test:e2e` (Playwright, `e2e/`). It builds the app and serves it
  with `vite preview` on port 4199, then runs a smoke suite in Chromium (desktop) and at a
  360 × 740 phone size (tests tagged `@mobile`): landing in both languages, building and cabling a
  lab and pinging, undo / redo, export / import, share link, one exercise from fault to report,
  redirects, and no console errors. First time: `npx playwright install chromium`.
  `npm run test:e2e:ui` opens Playwright's UI mode. Variables: `E2E_SKIP_BUILD=1` serves the
  existing `dist/`; `E2E_BASE_URL=<url>` tests a running app instead (e.g. a preview deploy).
  Selectors use English accessible names (`?lang=en`); renaming a label in `src/locales/en`
  may need the same change in `e2e/`.
- **CI** (`.github/workflows/ci.yml`, every push and pull request): lint, e2e type-check, unit
  tests, build, Playwright; the Playwright report is uploaded as an artifact when a step fails.
- **Preview deploys** (`.github/workflows/preview.yml`, optional): every pushed branch is uploaded
  as a Cloudflare Workers preview version (`wrangler versions upload --preview-alias <branch>`);
  production is not changed. It runs only if the repository has these Actions secrets, and is
  skipped otherwise:
  - `CLOUDFLARE_API_TOKEN` — API token with the *Workers Scripts: Edit* permission.
  - `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account id (needed if the token can see several
    accounts).

## Add a language

1. Copy `src/locales/en/` to `src/locales/<code>/` and translate every value (keep the keys and
   `{{placeholders}}` unchanged).
2. Add one line to `src/i18n/languages.ts`: `{ code, nativeName, dir }`.

That is all; `npm test` checks that every key and placeholder matches English. Details and the
rules for UI code are in [docs/I18N.md](docs/I18N.md). Device output (Windows `ping`, `ipconfig`,
…) stays in English in every language, as on real equipment.

## Türkçe

**Ağ Arıza Laboratuvarı**, tarayıcıda çalışan, açık kaynaklı bir **ağ laboratuvarıdır**. Çalışma
alanında kendi ağını kurarsın: router, switch, erişim noktası ve bilgisayarları tuvale sürükler, doğru
kabloyla bağlar, port, VLAN, rota, DHCP ve DNS ayarlarını yapar, `ping`, `ipconfig`, `nslookup` ve
`tracert` ile test edersin. Lablar tarayıcında otomatik kaydedilir; `.agl.json` dosyası olarak dışa
aktarılabilir ya da bağlantıyla paylaşılabilir. Alıştırmalarda bir restoranın, ofisin ya da mağazanın
ağında gerçek hayattan bir arıza vardır: yanlış ayarı bulup düzeltir ve doğrularsın; çözüm raporu ne
olduğunu ve mülakatta nasıl anlatacağını açıklar.

Kurulum ve üyelik gerekmez. Canlı sürüm: https://agarizalab.slovveis.workers.dev

Yerelde çalıştırmak için `npm install` ve ardından `npm run dev`. Yeni bir dil eklemek için
[docs/I18N.md](docs/I18N.md) dosyasına bak.

## License

MIT — see [LICENSE](LICENSE).

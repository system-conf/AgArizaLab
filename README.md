# AgArizaLab — Network Troubleshooting Lab

A browser-based, open-source **network lab** for practising troubleshooting. Each exercise is a
small business network (a restaurant, an office, a shop) with a real-world fault: you inspect the
devices, read their settings, run `ping`, `ipconfig` and `nslookup`, find the wrong setting, fix
it and verify. A solution report then explains what happened, how it shows up in real life and how
to describe it in a job interview.

No installation, no account. Available in **English** and **Turkish**.

**Live:** https://agarizalab.slovveis.workers.dev

Coming next: a free-form workspace to build your own networks, packet-level simulation and device
command lines (see [docs/PLAN_V2.md](docs/PLAN_V2.md)).

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # development server
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run build      # type-check and production build
```

## Add a language

1. Copy `src/locales/en/` to `src/locales/<code>/` and translate every value (keep the keys and
   `{{placeholders}}` unchanged).
2. Add one line to `src/i18n/languages.ts`: `{ code, nativeName, dir }`.

That is all; `npm test` checks that every key and placeholder matches English. Details and the
rules for UI code are in [docs/I18N.md](docs/I18N.md). Device output (Windows `ping`, `ipconfig`,
…) stays in English in every language, as on real equipment.

## Türkçe

**Ağ Arıza Laboratuvarı**, tarayıcıda çalışan, açık kaynaklı bir **ağ laboratuvarıdır**. Her
alıştırmada bir restoranın, ofisin ya da mağazanın küçük ağında gerçek hayattan bir arıza vardır:
cihazları incelersin, ayarlarını okursun, `ping`, `ipconfig` ve `nslookup` çalıştırırsın, yanlış
ayarı bulup düzeltir ve doğrularsın. Çözüm raporu ne olduğunu, gerçek hayatta nasıl göründüğünü ve
mülakatta nasıl anlatacağını açıklar.

Kurulum ve üyelik gerekmez. Canlı sürüm: https://agarizalab.slovveis.workers.dev

Yerelde çalıştırmak için `npm install` ve ardından `npm run dev`. Yeni bir dil eklemek için
[docs/I18N.md](docs/I18N.md) dosyasına bakın.

## License

MIT — see [LICENSE](LICENSE).

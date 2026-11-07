# Octetlab — tarayıcında ağ laboratuvarı

[English](README.md) · **Canlı:** https://octetlab.slovveis.workers.dev

Octetlab, tamamen tarayıcıda çalışan açık kaynaklı bir ağ laboratuvarı. Ağını kurarsın, kablolarını
takarsın, ayarlarını arayüzden ya da IOS tarzı komut satırından yaparsın ve simülasyon modunda her
paketin nereye gittiğini adım adım izlersin. Kurulum ve üyelik gerekmez; bilgisayarda ve tablette
çalışır. **Türkçe** ve **İngilizce**, yeni dillere hazır.

## Neler yapabilirsin

- **Ağ kur:** Router, switch (L2 / L3, PoE), hub, erişim noktası, kablosuz router, modem, sunucu,
  PC, dizüstü, telefon, yazıcı, kamera, NVR ve daha fazlasını (37 cihaz modeli) haritaya sürükle,
  doğru kabloyla bağla, port ışıklarının yandığını gör.
- **Yapılandır:** Port, VLAN, trunk, SVI, router-on-a-stick, statik ve yedek (floating) rota,
  DHCP (havuz, hariç tutma, relay), DNS, Wi-Fi SSID'leri. Ayar panelinden ya da **cihaz CLI'ından**
  (`enable`, `conf t`, `interface`, `switchport`, `ip address`, `show vlan brief`,
  `show ip route`, `show running-config`, `?` yardımı, Tab tamamlama, `--More--` sayfalama).
- **Test et:** Uç cihazlarda Windows tarzı terminal (`ping`, `ipconfig`, `nslookup`, `tracert`,
  `arp -a`).
- **Simülasyon modu:** Belirlenimci, paket düzeyinde simülatör. ARP, DHCP, DNS, ICMP ve VLAN
  etiketlemeyi olay olay izle, her paketi katman katman incele, protokole göre filtrele ve kaydı
  Wireshark için `.pcap` olarak dışa aktar.
- **Örnek lablar:** 24 kısa ders (temeller, DHCP, DNS, switching, routing, paket görünümü). Her biri
  hazır bir lab, otomatik kontrol edilen "bunu dene" adımları ve "boz bakalım" fikirleriyle gelir.
- **Arıza alıştırmaları:** Küçük işletme ağlarında (restoran, ofis, mağaza) gerçek hayattan arızalar.
  Yanlış ayarı bul, düzelt, doğrula; rapor ne olduğunu anlatır.
- **Tasarım görevleri:** Bir müşteri talebi (küçük ofis, restoran, okul, fabrika, otel), gereksinimler,
  bütçe ve canlı kontrol listesi. Teslim et, değerlendirmeni al, teslim dosyasını
  (topoloji, IP planı, VLAN tablosu, port listesi) indir.
- **Dosyaların:** Lablar tarayıcında otomatik kaydedilir; `.agl.json` olarak dışa / içe aktarılır,
  bağlantıyla paylaşılır, tüm cihazların config'leri metin olarak indirilir.
- **Tercihler:** Açık / koyu / sistem teması, harita etiketleri, ızgara ve yapıştırma, animasyon hızı,
  terminal ve CLI seçenekleri.

Octetlab bir oyun değil, öğrenme laboratuvarı: puan yok, can yok; gerçek ağlar gibi davranan ağlar
var. Yol haritası (dinamik routing, STP, ACL / NAT, IPv6, kablosuz güvenlik, WAN, sunucular ve
fazlası) [docs/PLAN_V2.md](docs/PLAN_V2.md) ve [docs/PARITY.md](docs/PARITY.md) dosyalarında.

## Yerelde çalıştır

Node.js 22 veya üstü gerekir.

```bash
npm install
npm run dev        # geliştirme sunucusu
npm test           # birim testleri (Vitest)
npm run lint       # ESLint
npm run build      # tip kontrolü ve üretim derlemesi
npm run deploy     # derleyip Cloudflare Workers'a yayınla
```

Uçtan uca testler: `npm run test:e2e` (Playwright; ilk sefer `npx playwright install chromium`).
Ayrıntılar İngilizce [README.md](README.md) dosyasında.

## Yeni dil ekle

1. `src/locales/en/` klasörünü `src/locales/<kod>/` olarak kopyala ve tüm değerleri çevir
   (anahtarları ve `{{yer tutucuları}}` değiştirme).
2. `src/i18n/languages.ts` dosyasına bir satır ekle: `{ code, nativeName, dir }`.

Hepsi bu; `npm test` her anahtarın ve yer tutucunun İngilizceyle eşleştiğini kontrol eder.
Ayrıntılar [docs/I18N.md](docs/I18N.md) dosyasında. Cihaz çıktıları (Windows `ping`, IOS `show`
komutları…) gerçek cihazlarda olduğu gibi her dilde İngilizce kalır.

## Markalar

Cisco, IOS ve Packet Tracer, Cisco Systems, Inc.'in markalarıdır. Octetlab bağımsız bir projedir;
Cisco ile bağlantısı yoktur ve Cisco tarafından onaylanmamıştır. Komut satırı, öğrenme amacıyla
yaygın olarak öğretilen IOS sözdizimini izler; tüm ikonlar, görseller ve lab içerikleri özgündür.

## Lisans

MIT — bkz. [LICENSE](LICENSE).

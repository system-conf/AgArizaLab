# Sample lab library ("Örnek lablar")

Status: approved by the product owner (2026-11-06). Our own original sample labs that cover the same
topics a learner finds in other network simulators — never copied or converted from their files.

Every sample is a **mini lesson**, not just a topology:
- a ready, working lab (`LabDocument`) built with our catalog,
- a short explanation of the topic (tr + en, `samples` namespace): what it is, why it exists, where
  it is used in real networks,
- 3–5 guided **"try this"** steps (e.g. "ping PC2 from PC1 in Simulation mode and watch the ARP
  request"), each with an optional automatic check (reuses solve conditions / design requirements),
- "break it" ideas (what happens if you change X) and links to related exercises.

UI: a **Samples** section next to Exercises, grouped by category, searchable, each card shows topic,
level and required feature; "Open" loads it as a free lab (unlocked) with the lesson panel beside it.

## Catalogue (delivered together with the feature/pack that makes it possible)
| Category | Samples | Needs |
|---|---|---|
| Basics | two PCs and a switch; subnets and masks; default gateway; IP conflict; APIPA | now |
| DHCP | router as DHCP server; pools + exclusions; reservation-style static mapping; relay (`ip helper-address`); DHCP conflict | now / Phase 3 (relay) |
| DNS | local DNS server records; forwarders; multi-level DNS | now / Phase 3 |
| Switching | VLANs and trunks; native VLAN mismatch; allowed VLANs; inter-VLAN routing (router-on-a-stick, SVI) | now |
| Routing | static and default routes; floating static route; routing loop | now |
| Packet view | ARP step by step; MAC learning; TTL and tracert | Phase 3 |
| Device CLI | first switch config; router basic config; `show` commands tour | Phase 4 |
| STP / EtherChannel / CDP-LLDP / port security | loops and blocking; LACP bundle; neighbour discovery; sticky MAC | pack 5.1 |
| ACL / NAT / SSH-AAA | standard and extended ACL; static NAT, PAT; SSH login | pack 5.2 |
| Dynamic routing / HSRP | RIPv2; OSPF single and multi-area; EIGRP; gateway redundancy | pack 5.3 |
| IPv6 | addressing; SLAAC; stateless and stateful DHCPv6; OSPFv3; dual stack | pack 5.4 |
| Servers and apps | web (HTTP/HTTPS), FTP/TFTP, e-mail, NTP, Syslog | pack 5.5 |
| Wireless | home router; guest Wi-Fi; WPA2-PSK; WLC with lightweight APs | pack 5.6 |
| WAN / security | serial + PPP; GRE; IPsec site-to-site; firewall zones; PPPoE | pack 5.7 |
| Operations | QoS basics; SNMP; NetFlow; SPAN; VoIP | pack 5.8 |
| Industrial / IoT | OT network segmentation; industrial ring; IoT devices and gateway | pack 5.9 |

## Work split (first batch, after Phase 3 integration)
- **SL0 contract (alone):** `SampleDefinition` (lab, category, level, required features, lesson steps
  with optional checks), `samples` namespace layout, catalogue routing (`/samples`, `/samples/<id>`).
- **SL1 UI** (`src/features/samples/**`): list, search, lesson panel next to the workspace.
- **SL2 content** (`src/samples/**`, `samples` ns): every "now" + "Phase 3" row above, tested: each
  sample loads, passes `StateInvariants`, its checks are false before and true after the guided steps.
- Later packs add their own rows (each pack's definition of done includes its samples).

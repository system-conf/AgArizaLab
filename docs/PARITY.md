# Feature parity checklist (Packet Tracer → Octetlab)

Goal: nothing a learner can do in Packet Tracer should be impossible here. This list was drafted from
general knowledge of Packet Tracer and **must be verified against the current Packet Tracer release**
by a research agent before Phase 5 (features differ between versions). Functionality only — never copy
names, icons or UI of the original.

Status: ✅ done · 🟡 partial · ⬜ not started · Phase = PLAN_V2 phase/pack that delivers it.

## Workspace
| Feature | Status | Phase |
|---|---|---|
| Logical workspace: add / move / delete devices, cable tool | ✅ | 2 |
| Device catalog by category, device models with port layouts | ✅ 25 models | 2 |
| Cable types (copper straight/cross, fiber, serial DCE/DTE, console, coaxial, phone, auto) | 🟡 all but phone; serial clocking in 5.7 | 2 / 5.7 |
| Link and port status lights | ✅ | — |
| Notes, labels, shapes on canvas | 🟡 text notes; shapes drawn but no create tool | 2 |
| Save / open lab files, recent files | ✅ autosave, .agl.json, share link | 2 |
| Undo / redo | ✅ | 2 |
| Physical workspace (buildings, racks, cable lengths, wireless range) | ⬜ | 5.9 |
| Device physical view (modules, power switch) | ⬜ | 5.9 |
| Multiuser (connect labs across instances) | ⬜ | 5.9 |

## Simulation
| Feature | Status | Phase |
|---|---|---|
| Realtime mode | 🟡 rule-based | 3 |
| Simulation mode: event list, filters, step, speed | ⬜ | 3 |
| PDU inspector with OSI layers, inbound / outbound | ⬜ | 3 |
| Simple PDU and complex PDU tools | ⬜ | 3 |
| Packet animation on the map | 🟡 ping only | 3 |

## Hosts and servers
| Feature | Status | Phase |
|---|---|---|
| IP configuration GUI (static / DHCP) | ✅ | — |
| Command prompt: ipconfig, ping, nslookup | ✅ | — |
| tracert, arp, netstat, ipconfig /release | 🟡 tracert, /release done | 1 / 4 |
| Desktop apps: web browser, email, FTP client, terminal (console), text editor | ⬜ | 5.5 |
| Server services: DHCP, DNS, HTTP/HTTPS, FTP, TFTP, email, Syslog, NTP, AAA | 🟡 DHCP/DNS on router | 3 / 5.5 |
| Laptops, tablets, smartphones, IP phones, printers | ✅ | 2 |

## Switching
| Feature | Status | Phase |
|---|---|---|
| VLANs, access / trunk, native VLAN, allowed VLANs | ✅ | 2 |
| MAC address table | ⬜ | 3 |
| STP / RSTP / PVST+ | ⬜ | 5.1 |
| EtherChannel (LACP / PAgP) | ⬜ | 5.1 |
| VTP, DTP | ⬜ | 5.8 |
| CDP / LLDP | ⬜ | 5.1 |
| Port security, DHCP snooping, DAI | ⬜ | 5.1 / 5.6 |
| Layer 3 switch, SVI | ✅ | 2 |

## Routing and services on network devices
| Feature | Status | Phase |
|---|---|---|
| Router-on-a-stick inter-VLAN routing | ✅ sub-interfaces | 2 |
| Static and default routes | ✅ longest prefix + AD | 2 |
| RIPv2, OSPFv2, EIGRP, BGP basics | ⬜ | 5.3 / 5.7 |
| HSRP | ⬜ | 5.3 |
| NAT / PAT | ⬜ | 5.2 |
| ACL standard / extended / named | ⬜ | 5.2 |
| DHCP server / relay on router | 🟡 server, pools, exclusions; relay later | 2 / 3 |
| SSH / Telnet, AAA, enable secret, line config | ⬜ | 4 / 5.2 |
| IPv6 (SLAAC, DHCPv6, OSPFv3) | ⬜ | 5.4 |
| WAN: serial, PPP / CHAP, GRE, IPsec VPN | ⬜ | 5.7 |
| Firewall device, zone-based firewall | ⬜ | 5.7 |
| QoS, SNMP, NetFlow, VoIP | ⬜ | 5.8 |

## Wireless
| Feature | Status | Phase |
|---|---|---|
| Access point with SSIDs mapped to VLANs | 🟡 | — |
| WPA2-PSK / Enterprise authentication | ⬜ | 5.6 |
| Wireless router (home router) | ✅ | 2 |
| WLC + lightweight APs | ⬜ | 5.6 |

## Device CLI
| Feature | Status | Phase |
|---|---|---|
| IOS-style modes, abbreviations, `?`, Tab completion | ⬜ | 4 |
| running / startup config, reload | ⬜ | 4 |
| show commands (interfaces, vlan, mac, ip route, arp, running-config) | ⬜ | 4 |

## Education
| Feature | Status | Phase |
|---|---|---|
| Activities with goals and automatic grading | 🟡 5 fixed exercises | 5.9 |
| Activity editor for instructors | ⬜ | 5.9 |
| Locked fields / hidden settings in activities | ✅ topology / device / section / port locks | 2 |
| Multiple languages | ✅ tr + en, i18n | 1 |
| IoT devices and scripting (Python / JS) | ⬜ | 5.9 |

## Our extras (not in Packet Tracer)
| Feature | Status | Phase |
|---|---|---|
| Runs in the browser, no install, no account | ✅ | — |
| Real-life small-business troubleshooting exercises with explanations | ✅ | — |
| Random fault injector for endless exercises | ⬜ | 5.9 |
| Turkish-first content | ✅ | — |

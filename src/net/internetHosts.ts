// Fictional internet used by the engine: public DNS servers and the names they know.

export interface InternetHosts {
  /** Public resolvers that answer when the internet is reachable. */
  publicDnsServers: readonly string[]
  /** Reverse names shown on the nslookup "Server:" line. */
  dnsServerNames: Readonly<Record<string, string>>
  /** Known host names (lower case) → public IPv4 address. */
  names: Readonly<Record<string, string>>
}

export const internetHosts: InternetHosts = {
  publicDnsServers: ['8.8.8.8', '1.1.1.1', '9.9.9.9'],
  dnsServerNames: {
    '8.8.8.8': 'dns.google',
    '1.1.1.1': 'one.one.one.one',
    '9.9.9.9': 'dns9.quad9.net',
  },
  names: {
    'google.com': '142.250.187.206',
    'odeme.ornekbanka.com.tr': '203.0.113.10',
    'siparis.ornekyemek.com': '203.0.113.20',
    'bulut.ornekyedek.com': '203.0.113.30',
  },
}

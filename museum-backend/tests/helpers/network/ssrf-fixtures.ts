export interface SsrfTestCase {
  id: string;
  category: SsrfCategory;
  url: string;
  dnsResolvesTo?: string;
  description: string;
}

export type SsrfCategory =
  | 'ipv4-loopback'
  | 'ipv4-private'
  | 'ipv4-link-local'
  | 'ipv6-loopback'
  | 'ipv6-private'
  | 'ipv6-mapped'
  | 'dns-rebind'
  | 'scheme-abuse'
  | 'userinfo'
  | 'encoded-ipv4';

export const buildSsrfUrls = (): SsrfTestCase[] => [
  {
    id: '01-ipv4-loopback-127001',
    category: 'ipv4-loopback',
    url: 'https://127.0.0.1/x.jpg',
    description: 'IPv4 loopback canonical',
  },
  {
    id: '02-ipv4-loopback-edge',
    category: 'ipv4-loopback',
    url: 'https://127.0.0.255/x.jpg',
    description: 'IPv4 loopback edge of /8 range',
  },

  {
    id: '03-ipv4-private-10',
    category: 'ipv4-private',
    url: 'https://10.0.0.1/x.jpg',
    description: 'IPv4 RFC1918 10.0.0.0/8',
  },
  {
    id: '04-ipv4-private-172',
    category: 'ipv4-private',
    url: 'https://172.16.0.1/x.jpg',
    description: 'IPv4 RFC1918 172.16.0.0/12',
  },
  {
    id: '05-ipv4-private-192',
    category: 'ipv4-private',
    url: 'https://192.168.1.1/x.jpg',
    description: 'IPv4 RFC1918 192.168.0.0/16',
  },

  {
    id: '06-aws-imds-169254',
    category: 'ipv4-link-local',
    url: 'https://169.254.169.254/latest/meta-data/',
    description: 'AWS IMDSv1 endpoint — must NEVER reach the network',
  },

  {
    id: '07-ipv6-loopback',
    category: 'ipv6-loopback',
    url: 'https://[::1]/x.jpg',
    description: 'IPv6 loopback ::1',
  },
  {
    id: '08-ipv6-ula-fc00',
    category: 'ipv6-private',
    url: 'https://[fc00::1]/x.jpg',
    description: 'IPv6 unique-local fc00::/7',
  },
  {
    id: '09-ipv6-link-local-fe80',
    category: 'ipv6-private',
    url: 'https://[fe80::1]/x.jpg',
    description: 'IPv6 link-local fe80::/10',
  },
  {
    id: '10-ipv6-mapped-loopback',
    category: 'ipv6-mapped',
    url: 'https://[::ffff:127.0.0.1]/x.jpg',
    description: 'IPv6-mapped IPv4 loopback ::ffff:127.0.0.1',
  },
  {
    id: '11-ipv6-mapped-private',
    category: 'ipv6-mapped',
    url: 'https://[::ffff:10.0.0.1]/x.jpg',
    description: 'IPv6-mapped IPv4 private ::ffff:10.0.0.1',
  },

  {
    id: '12-dns-rebind-public-to-private',
    category: 'dns-rebind',
    url: 'http://evil-rebind.example/x.jpg',
    dnsResolvesTo: '127.0.0.1',
    description:
      'Hostname looks public but DNS resolves to loopback — defence MUST honour resolver result',
  },

  {
    id: '13-scheme-file',
    category: 'scheme-abuse',
    url: 'file:///etc/passwd',
    description: 'file:// reads local FS',
  },
  {
    id: '14-scheme-gopher',
    category: 'scheme-abuse',
    url: 'gopher://internal.corp/_GET%20/secret',
    description: 'gopher:// classic SSRF pivot',
  },
  {
    id: '15-scheme-data',
    category: 'scheme-abuse',
    url: 'data:text/html,<script>alert(1)</script>',
    description: 'data: URI — XSS pivot if pulled into HTML context',
  },
  {
    id: '16-scheme-javascript',
    category: 'scheme-abuse',
    url: 'javascript:alert(1)',
    description: 'javascript: URI',
  },

  {
    id: '17-userinfo-with-private',
    category: 'userinfo',
    url: 'https://user:pass@127.0.0.1/x.jpg',
    description: 'userinfo prefix must not bypass private-host check',
  },

  {
    id: '18-ipv4-decimal',
    category: 'encoded-ipv4',
    url: 'https://2130706433/x.jpg',
    description: 'Decimal-encoded IPv4 = 127.0.0.1',
  },
  {
    id: '19-ipv4-octal',
    category: 'encoded-ipv4',
    url: 'https://0177.0.0.1/x.jpg',
    description: 'Octal-encoded leading-zero = 127.0.0.1',
  },
  {
    id: '20-ipv4-hex',
    category: 'encoded-ipv4',
    url: 'https://0x7f.0.0.1/x.jpg',
    description: 'Hex-encoded first octet = 127.0.0.1',
  },
  {
    id: '21-ipv4-percent-encoded',
    category: 'encoded-ipv4',
    url: 'https://127%2E0%2E0%2E1/x.jpg',
    description: 'Percent-encoded dots in host position',
  },
  {
    id: '22-ipv4-leading-zeros',
    category: 'encoded-ipv4',
    url: 'https://127.000.0.001/x.jpg',
    description: 'Leading-zero padding canonicalises to 127.0.0.1',
  },
];

interface LookupResolved {
  address: string;
  family: 4 | 6;
}

const DEFAULT_PUBLIC_IP = '203.0.113.10';

const dnsMappings = new Map<string, string>();

export const mockDnsResolveTo = (hostname: string, address: string): void => {
  dnsMappings.set(hostname.toLowerCase(), address);
};

export const clearSsrfDnsMappings = (): void => {
  dnsMappings.clear();
};

export const resolveSsrfDns = (hostname: string): Promise<LookupResolved> => {
  const mapped = dnsMappings.get(hostname.toLowerCase());
  const address = mapped ?? DEFAULT_PUBLIC_IP;
  const family: 4 | 6 = address.includes(':') ? 6 : 4;
  return Promise.resolve({ address, family });
};

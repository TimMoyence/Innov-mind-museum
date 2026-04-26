/**
 * SSRF test fixtures and shared helpers.
 *
 * Centralises the matrix of malicious URLs (loopback, private ranges, IPv6,
 * cloud-metadata, scheme abuse, alternate IP encodings) so every SSRF surface
 * test asserts against the same vocabulary. Add a new case here once and every
 * surface picks it up via the shared `describe.each` consumers.
 *
 * Each case has:
 *   - `id`              — short stable identifier (used in test names)
 *   - `category`        — grouping label (loopback / private / ipv6 / scheme / encoded …)
 *   - `url`             — the candidate URL to feed surfaces with
 *   - `dnsResolvesTo?`  — when set, the helper installs a `dns.lookup` mock so
 *                         the scraper's DNS-rebinding defence is exercised
 *                         (the *resolved* IP must drive the rejection, not the
 *                         hostname literal).
 *   - `description`     — human-readable rationale for the case
 *
 * Note: `url` strings include hosts that don't actually resolve (e.g.
 * `evil.example`). Tests must NEVER let real network traffic out — always
 * stub `global.fetch` and `dns.lookup` first, then call the surface under
 * test, then assert the stub was *not* invoked.
 */

/** A single SSRF test case; consumers use it via `describe.each` / `it.each`. */
export interface SsrfTestCase {
  id: string;
  category: SsrfCategory;
  url: string;
  /** When set, mock `dns.lookup(hostname)` so it returns this IP. */
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

/**
 * Returns the canonical 22-case SSRF test matrix.
 *
 * Cases align 1:1 with the W1.T2 spec from the security remediation plan
 * (`/team-reports/2026-04-26-security-remediation-plan.md` § W1.T2).
 *
 * Note: cases 1-11 are written as `https://` so they exercise the
 * `image-input` validator (HTTPS-only policy). Cases 13-16 deliberately use
 * non-`https` schemes — the validator must reject them by scheme alone.
 * @returns The full ordered SSRF test matrix.
 */
export const buildSsrfUrls = (): SsrfTestCase[] => [
  // ── IPv4 loopback (127.0.0.0/8) ───────────────────────────────────
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

  // ── IPv4 RFC1918 ──────────────────────────────────────────────────
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

  // ── IPv4 link-local + cloud metadata ──────────────────────────────
  {
    id: '06-aws-imds-169254',
    category: 'ipv4-link-local',
    url: 'https://169.254.169.254/latest/meta-data/',
    description: 'AWS IMDSv1 endpoint — must NEVER reach the network',
  },

  // ── IPv6 ──────────────────────────────────────────────────────────
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

  // ── DNS rebinding (TOCTOU class) ─────────────────────────────────
  {
    id: '12-dns-rebind-public-to-private',
    category: 'dns-rebind',
    url: 'http://evil-rebind.example/x.jpg',
    dnsResolvesTo: '127.0.0.1',
    description:
      'Hostname looks public but DNS resolves to loopback — defence MUST honour resolver result',
  },

  // ── Scheme abuse ─────────────────────────────────────────────────
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

  // ── Userinfo + private host ──────────────────────────────────────
  {
    id: '17-userinfo-with-private',
    category: 'userinfo',
    url: 'https://user:pass@127.0.0.1/x.jpg',
    description: 'userinfo prefix must not bypass private-host check',
  },

  // ── Alternate IPv4 encodings (canonicalisation bypass class) ─────
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

// ─────────────────────────────────────────────────────────────────────
// DNS mock state — populated by a configurable resolver shared with
// `jest.mock('node:dns/promises', …)` at the top of the consuming test
// file. The factory there reads from this state so individual cases can
// pin a hostname → IP mapping without re-mocking the module.
// ─────────────────────────────────────────────────────────────────────

interface LookupResolved {
  address: string;
  family: 4 | 6;
}

/**
 * Default IP returned by the mock resolver for unmapped hostnames. Picked
 * from the TEST-NET-3 documentation range (RFC 5737, 203.0.113.0/24) so it's
 * obviously synthetic and never collides with real internet ranges.
 */
const DEFAULT_PUBLIC_IP = '203.0.113.10';

/** Internal lookup map driven by `mockDnsResolveTo`. */
const dnsMappings = new Map<string, string>();

/**
 * Forces `dns.lookup(hostname)` to resolve to `address` for subsequent
 * lookups. Consumers MUST also install the shared dns mock at the top of
 * their test file:
 *
 * ```ts
 * jest.mock('node:dns/promises', () => ({
 *   lookup: (hostname: string) => resolveSsrfDns(hostname),
 * }));
 * ```
 *
 * Reset between tests with `clearSsrfDnsMappings()`.
 * @param hostname Hostname (case-insensitive) to pin to a specific IP.
 * @param address  IPv4 or IPv6 address the mock resolver returns for `hostname`.
 */
export const mockDnsResolveTo = (hostname: string, address: string): void => {
  dnsMappings.set(hostname.toLowerCase(), address);
};

/** Clears all `mockDnsResolveTo` entries — call from `afterEach`. */
export const clearSsrfDnsMappings = (): void => {
  dnsMappings.clear();
};

/**
 * Mock implementation of `dns.lookup` driven by `dnsMappings`.
 * Wire it into `jest.mock('node:dns/promises', …)` at the top of a test file.
 * @param hostname Hostname being resolved.
 * @returns A `{ address, family }` shape matching `dns.LookupAddress`.
 */
export const resolveSsrfDns = (hostname: string): Promise<LookupResolved> => {
  const mapped = dnsMappings.get(hostname.toLowerCase());
  const address = mapped ?? DEFAULT_PUBLIC_IP;
  const family: 4 | 6 = address.includes(':') ? 6 : 4;
  return Promise.resolve({ address, family });
};

// ─────────────────────────────────────────────────────────────────────
// Outbound-fetch trip-wire — ensures defences reject *before* any fetch.
// Consumers wire this themselves with `jest.fn` + `global.fetch =` so the
// helper stays free of jest-globals at module load. The matrix test in
// `tests/integration/security/ssrf-matrix.test.ts` is the canonical example.
// ─────────────────────────────────────────────────────────────────────

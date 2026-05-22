/**
 * Wave C5 / T-C55 — `TelemetryPort` domain interface for funnel events.
 *
 * Hexagonal: this is the only contract the rest of the codebase depends on.
 * The default in-process adapter (PlausibleAdapter) MUST be replaceable in
 * tests via {@link setTelemetryPort} (composition root in `./index.ts`).
 *
 * Lib-docs reference : `lib-docs/plausible/PATTERNS.md` §3.2 (hexagonal
 * `TelemetryPort` + adapter shape) — `name`/`url`/`domain` required ;
 * `userAgent`/`clientIp` optional at port level (the adapter falls back to
 * sane defaults when caller is server-internal — e.g. middleware emit).
 *
 * Anti-pattern (PATTERNS.md §5 anti-pattern #1) : `props` MUST NOT carry PII
 * (email, userId, phone, full name). The PlausibleAdapter strips a baseline
 * canary list defensively — callers SHOULD still respect the contract.
 */

export interface TelemetryEvent {
  /** `pageview` for standard pageviews; anything else = custom event. */
  name: string;
  /** Page / screen URL — max 2 000 chars. `app://...` synthetic IDs for mobile. */
  url: string;
  /** Registered domain (web) or app name (mobile). */
  domain: string;
  /** Visitor User-Agent — required for daily-hash visitor identification. */
  userAgent?: string;
  /** Real visitor IP — required for the Plausible bot filter (PATTERNS.md §7). */
  clientIp?: string;
  /** Optional referrer for source attribution. */
  referrer?: string;
  /** ≤30 keys, NO PII (PATTERNS.md §5 anti-pattern #1). */
  props?: Record<string, string | number | boolean>;
}

export interface TelemetryPort {
  /** Fire-and-forget — adapter MUST swallow errors (analytics never blocks UX). */
  emit(event: TelemetryEvent): Promise<void>;
}

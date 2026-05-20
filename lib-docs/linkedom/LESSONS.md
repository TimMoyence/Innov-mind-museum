# Lessons — linkedom + @mozilla/readability

Initial audit 2026-05-18 : **PASS_WITH_FINDINGS** (single integration site `museum-backend/src/modules/knowledge-extraction/adapters/secondary/scraper/html-scraper.ts`).
Mid-cycle (2026-05-18 → 2026-05-20) : TD-LINK-01 **closed** (clone-before-parse landed).
Refresh audit 2026-05-20 : **TD-LINK-02 + TD-LINK-03 + TD-33 still open** ; no new gaps.

## ✅ CLOSED 2026-05-19 — TD-LINK-01 MEDIUM : Readability mutates document, fallback paid 2× parse

- Original gap : `html-scraper.ts:314-315` did `new Readability(document).parse()` without cloning, then the fallback branch re-called `parseHTML(html)` → 2× parse cost.
- **Fix shipped** : `html-scraper.ts:315-321` clones once via `document.cloneNode(true)` before passing to Readability. Fallback path still re-parses (rationale documented inline — Readability has already mutated the original document by then, and the fallback wants a clean DOM for its own `querySelectorAll('script, style, nav, footer, header')` removals).
- Note : the fallback re-parse could be eliminated by cloning a SECOND time before Readability touches the doc, but the current pattern is cheap-enough on the non-article path (estimated <5 % of inbound URLs hit the fallback).

## ⚠️ TD-LINK-02 MEDIUM : `response.text()` unbounded → OOM risk

- `html-scraper.ts:299` reads the full HTTP body without a byte cap. `maxContentBytes` (51200) caps OUTPUT but NOT INPUT. A malicious server can stream 10 GB → `parseHTML` allocates linearly → OOM.
- **Fix** : check `Content-Length` header pre-`text()` and reject `> N × maxContentBytes`, OR stream-read via `response.body.getReader()` with a hard 5-10 MB byte cap.
- **Status (2026-05-20)** : still open.

## ⚠️ TD-LINK-03 LOW : `isProbablyReaderable` gate missing

- `parse()` is called unconditionally → wastes ~30-40 % CPU on non-article aggregator pages.
- **Fix** : add `isProbablyReaderable(document, { minContentLength: 140, minScore: 20 })` gate before `new Readability(...).parse()`. If false, skip directly to the fallback `querySelectorAll(...)` body-text path.
- **Status (2026-05-20)** : still open.

## ✅ F3 LOW_BY_DESIGN : DOMPurify not used but risk NEUTRALIZED

- The pipeline consumes `article.textContent` (plain text) **only**. `article.content` (HTML) is **never** persisted, rendered, nor injected into LLM prompts.
- The script-injection vector PATTERNS.md warns about is structurally closed by the textContent-only contract.
- **But** : if future code persists or renders `article.content`, DOMPurify becomes mandatory AT THAT BOUNDARY.
- **Action** : document the textContent-only contract in `scraper.port.ts` ADR rationale (still TODO — low priority).

## ⚠️ Residual risk

- Prompt-injection via natural-language payload embedded in scraped text is still possible (out of linkedom/readability scope). Chat guardrails (ADR-015 / ADR-047) apply only to chat input, NOT to the content-classifier path. If the LLM-summarized output of scraping ever feeds back into a user-visible UI, that's a separate threat model.

## ⚠️ TD-33 : Defuddle migration

- `@mozilla/readability` is in maintenance mode (290+ open issues, 17+ PRs, no public releases since 0.6.0 / 2025-03-03). The planned migration target is `defuddle@0.18.1` (2026-04-22).
- Migration path documented in detail in `PATTERNS.md` §6 — field mapping table, plain-text extraction strategy (re-parse cleaned HTML through linkedom), security boundary (still no built-in sanitizer, same DOMPurify recommendation applies if `result.content` HTML ever crosses a render/prompt boundary).
- Behavioral risk : Defuddle is "more forgiving" — may retain nav/sidebar text that Readability strips. Re-baseline the `maxContentBytes` LLM-context cap during migration.
- **Status (2026-05-20)** : still open ; no implementation work started.

## 🆕 2026-05-20 refresh — no new gaps

- linkedom `0.18.12` is the latest on npm (2025-08-21) ; no new release since the 2026-05-18 snapshot.
- @mozilla/readability `0.6.0` is the latest on npm (2025-03-03) ; no new release since the 2026-05-18 snapshot.
- No security advisories in the 2024-2026 window for either lib.
- Defuddle reached `0.18.1` (2026-04-22) ; Node form `Defuddle(document, url, options)` async, returns a `Promise`. Reuses linkedom as the DOM impl.

## ✅ Positives (audit 2026-05-18, still holds 2026-05-20)

- Zero live collections — `querySelectorAll(...)` only.
- `null`-from-parse handled (fallback branch + outer `scrape()` returns `ScrapedPage | null`, never throws).
- SSRF hardening exemplary :
  - IPv4-mapped IPv6 normalized in BOTH wire shapes (decimal `::ffff:127.0.0.1` + WHATWG hex `::ffff:7f00:1`).
  - 169.254.0.0/16 (AWS/Azure/GCP IMDS at 169.254.169.254) covered.
  - Cloud-provider metadata hostnames (`metadata.google.internal`, `metadata.goog`, `metadata.azure.com`, `metadata.packet.net`, `instance-data`) hard-blocked at the hostname layer before DNS lookup.
  - Manual redirect loop (`fetchWithSafeRedirects`) re-validates EVERY Location header → closes DNS-rebinding + scheme-downgrade bypasses.
  - Allowed-protocol set (`http:`, `https:`) + allowed-content-type set (`text/html`, `application/xhtml+xml`).
- `content-type` mismatch is INFO log (`scraper_skip_non_html`), not WARN — correct severity.
- All four SSRF block branches drain the response body (`drainResponseBody`) → keep-alive TCP can be reused.

# Lessons — linkedom + @mozilla/readability

Audit 2026-05-18 : **PASS_WITH_FINDINGS** (single integration site `html-scraper.ts`).

## ⚠️ F1 MEDIUM : Readability mutates document — works via re-parse mais doubles CPU
- `html-scraper.ts:314-315` ne clone pas avant `new Readability(document).parse()`. Fallback branch re-call parseHTML(html) line 321 → 2x parse cost.
- **Fix TD-LINK-01** : `new Readability(document.cloneNode(true) as Document).parse()` ; reuse original document fallback.

## ⚠️ F6 MEDIUM : `response.text()` unbounded → OOM risk
- `html-scraper.ts:299` reads full body sans cap. `maxContentBytes` (51200) cap OUTPUT mais NOT INPUT. Malicious server peut stream 10GB+ → parseHTML allocate linéairement → OOM.
- **Fix TD-LINK-02** : check Content-Length header avant text() + reject >Nx maxContentBytes, OR stream-read avec hard byte cap 5-10MB via `response.body.getReader()`.

## ⚠️ F2 LOW : `isProbablyReaderable` gate missing
- `parse()` called unconditionally → wastes CPU sur ~30-40% non-article pages.
- **Fix TD-LINK-03** : add gate pre-parse.

## ✅ F3 LOW_BY_DESIGN : DOMPurify pas utilisé mais risque NEUTRALISÉ
- Pipeline consume `article.textContent` (plain text) ONLY — `article.content` (HTML) jamais utilisé. Script-injection vector PATTERNS.md warns about est structurally closed.
- **Mais** : si futur code persist/display `article.content`, DOMPurify obligatoire AT THAT BOUNDARY.
- **Action** : document textContent-only contract dans `scraper.port.ts` ADR rationale.

## ⚠️ Residual risk
- Prompt-injection via natural-language payload dans scraped text reste possible (out of linkedom/readability scope ; chat guardrails ADR-015 apply only to chat NOT content-classifier).

## ✅ Positives
- Zero live collections (querySelectorAll only) ✅
- null-from-parse handled (fallback branch + scrape() returns ScrapedPage|null) ✅
- SSRF hardening + redirect re-validation + content-type allowlist exemplary

# L22 — I-CMP4 / I-CMP5 / I-CMP6 (a11y & compliance)

READ-ONLY fresh-context audit. Branch `dev` @ HEAD `1fb32f5ba`. Re-derived from code, no trust in prior markers.

---

## I-CMP4 — Mobile status/priority badge contrast — VERDICT: **NOT FIXED** (roadmap caveat is FALSE)

**Roadmap (`docs/ROADMAP_PRODUCT.md:259`)** marks `✅ I-CMP4` with text "white-on-amber/green 2.15-2.28:1 (mobile tickets). Web admin OK." and line 71 caveat: *"contraste mobile non reproductible depuis les tokens (caveat conservé)."*

**Verified — caveat is wrong, the failure IS fully reproducible from the tokens.**

Source: `museum-frontend/shared/ui/tokens.semantic.ts:128-137`
```
statusBadge: {
  textColor: '#FFFFFF',          // L129
  open:          '#3B82F6',      // L130
  inProgress:    '#F59E0B',      // L131
  resolved:      '#22C55E',      // L132
  closed:        '#6B7280',      // L133
  priorityLow:   '#6B7280',      // L134
  priorityMedium:'#F59E0B',      // L135
  priorityHigh:  '#EF4444',      // L136
}
```

Computed WCAG 2.1 contrast (white `#FFFFFF` foreground on each background):

| token | bg | ratio | verdict |
|---|---|---|---|
| open | #3B82F6 | **3.68:1** | < 4.5:1 (fails normal text) |
| inProgress | #F59E0B | **2.15:1** | FAIL — below even 3:1 |
| resolved | #22C55E | **2.28:1** | FAIL — below even 3:1 |
| closed / priorityLow | #6B7280 | 4.83:1 | PASS |
| priorityMedium | #F59E0B | **2.15:1** | FAIL — below even 3:1 |
| priorityHigh | #EF4444 | **3.76:1** | < 4.5:1 (fails normal text) |

Roadmap's "2.15-2.28:1" figure matches my recompute **exactly** for amber/green.

**No large-text exemption.** Badge text is rendered at `semantic.badge.fontSizeSmall = 11` (`tokens.semantic.ts:52`), weight `'700'`:
- `museum-frontend/app/(stack)/ticket-detail.tsx:304-308` (`badgeText.color = BADGE_TEXT_COLOR`, `fontSize = semantic.badge.fontSizeSmall`)
- `museum-frontend/features/support/ui/TicketsListView.tsx:280-284` (same)

WCAG "large text" = ≥18.66px bold / ≥24px regular. At 11px bold these are **normal text** → require 4.5:1. The 3:1 UI-component allowance also doesn't rescue them: 2.15/2.28:1 is below 3:1 too.

**Rendering path confirmed live (not dead tokens):** `priorityColor()`/`statusColor()` in `museum-frontend/features/support/ui/ticketHelpers.ts:7-29` map to these tokens; `BADGE_TEXT_COLOR` (= `#FFFFFF`) is applied as `badgeText.color` on `View backgroundColor = priorityColor(...)` at `ticket-detail.tsx:189` and `TicketsListView.tsx:83`.

**Divergence:** roadmap `✅` + "non reproductible" caveat is FALSE. The white-on-amber (2.15:1) and white-on-green (2.28:1) failures are deterministic from the tokens and reachable on the live ticket-detail and tickets-list screens. **I-CMP4 should be ❌ / open.** EAA WCAG 1.4.3 defect on B2C mobile surface.

---

## I-CMP5 — Web skip-link + `<main id>` + `.app`→`.com` — VERDICT: **(a) DONE / well-tested ; (b) NOT DONE (regression live)**

Roadmap (`:260`) marks `✅ I-CMP5` "(DONE 2026-05-25 full-audit, #298 — skip-link réel layout.tsx:32-41 + `<main id>` + `.app`→`.com` EN/FR)".

### (a) Skip-link + `<main id>` — TRUE / DONE

`museum-web/src/app/[locale]/layout.tsx:32-41`:
- `<a href="#main" className="sr-only ... focus:not-sr-only focus:absolute ...">` is the **first focusable element** in the locale layout (precedes `<Header>` at L38).
- Copy from i18n dict `{dict.a11y.skipToContent}` (L36) — key exists: `src/lib/i18n.ts:20`, `src/dictionaries/en.json:3` ("Skip to main content"), `src/dictionaries/fr.json:3` ("Aller au contenu principal").
- `<main id="main" tabIndex={-1}>` at L39 — target anchor present.

**Real CI coverage** (roadmap noted axe can't catch a missing skip-link — confirmed, so a behavioral test is required and exists):
- `museum-web/e2e/a11y/public-skip-link.a11y.spec.ts` — Playwright, dual-locale `/en` + `/fr`: presses `Tab`, asserts `:focus` has role `link` + `href="#main"` + non-empty accessible name, presses `Enter`, asserts `main#main` visible. Genuine behavioral assertion, not presence-only.
- 23 a11y e2e specs total under `e2e/a11y/*.spec.ts` (matches roadmap "23 specs"). `accessibility-audit.test.tsx` (component-level) covers Header/Footer/Button landmarks.

Verdict (a): **DONE, correctly tested.**

### (b) `.app`→`.com` — FALSE / NOT DONE (live regression on the accessibility statement)

The accessibility statement is served live at `museum-web/src/app/[locale]/accessibility/page.tsx` → `getAccessibilityContent()` from `src/lib/accessibility-content.ts`. That file STILL contains `musaium.app` / `support@musaium.app`:

- `accessibility-content.ts:32` (EN) — "...the Musaium web surface (**musaium.app** — landing pages, support, ...)"
- `accessibility-content.ts:58` (EN) — "...contact **support@musaium.app** — target response within 7 business days."
- `accessibility-content.ts:90` (FR) — "...la surface web Musaium (**musaium.app** — landing, ...)"
- `accessibility-content.ts:116` (FR) — "...contactez **support@musaium.app** — réponse cible..."

Canonical domain is `.com` everywhere else: `src/app/layout.tsx:18` `metadataBase ... 'https://musaium.com'`, `src/lib/seo.ts:3` `BASE_URL ... 'https://musaium.com'`, `src/lib/security-content.ts:28-49` uses `security@musaium.com`, `musaium.com`, `*.musaium.com`. So the a11y statement is the **lone outlier** — the contact `support@musaium.app` is an unowned/undeliverable domain.

`git log -1 -- src/lib/accessibility-content.ts` → last touched **`2d25a0f34` 2026-05-14** (well before the claimed #298 fix dated 2026-05-25). **#298 did not touch this file.**

No test catches it: `src/lib/accessibility-content.test.ts` makes no domain/contact assertion; `e2e/a11y/public-accessibility.a11y.spec.ts` only runs axe (no `.com`/`.app` grep). axe cannot flag a wrong domain string.

**Divergence:** roadmap claims ".app→.com EN/FR" DONE; **4 live `.app` references remain** in the accessibility statement (incl. the a11y-defect contact address — EAA §6 "contact mechanism" requirement). **I-CMP5 should be ⚠️ PARTIAL** — skip-link/`<main id>` done & tested, but the domain fix that was the *original substance* of the ticket is NOT applied.

**Remaining `.app` (web tree, excl. node_modules/.next):** exactly the 4 lines above in `accessibility-content.ts`. Zero elsewhere.

---

## I-CMP6 — SBOM cosign attest (BE+web) + mobile EAS gap — VERDICT: **PARTIAL (roadmap accurate)**

Roadmap (`:261`) `⚠️ I-CMP6` "(PARTIAL ... BE ci-cd-backend.yml + web cosign attest --type cyclonedx OK ; reste gap mobile EAS no-digest, deadline CRA 2027, acté ADR-068)". The strikethrough-style stale text "SBOM généré mais jamais attesté/signé ; web+mobile zéro SBOM" is the SUPERSEDED original finding.

**Backend — DONE.** `.github/workflows/ci-cd-backend.yml`:
- Quality-gate SBOM artifact: L99-110 (`cyclonedx-npm` → `sbom-backend` 90d artifact).
- Deploy-prod: image `cosign sign` (L785) + SLSA L3 build-provenance attest (L788-789) + `Generate SBOM (deploy)` (L801-804) + **`cosign attest --yes --type cyclonedx --predicate museum-backend/sbom.json ghcr.io/.../museum-backend@<digest>`** (L806-813) bound to `steps.push.outputs.digest`. `continue-on-error: true` (advisory). Pre-deploy verify gates: `cosign verify` (L815-822) + `gh attestation verify` SLSA (L824-837). Staging mirrors sign+attest (L1397-1433).

**Web — DONE.** `.github/workflows/ci-cd-web.yml:395-415`:
- `Generate SBOM (web)` (L398-401) + cosign install (L403-406) + **`cosign attest --yes --type cyclonedx --predicate museum-web/sbom.json ghcr.io/.../museum-web@<digest>`** (L408-415), digest from `id: push` (L385). `continue-on-error: true` (advisory, never gates deploy).

**Mobile — deliberate gap (tracked).** `.github/workflows/ci-cd-mobile.yml:101-118`:
- `Generate mobile SBOM (CycloneDX)` → `sbom-mobile` artifact (L109-118). **No sigstore image attestation** — comment L101-108 states this is intentional: EAS `eas build` produces a store binary with no OCI digest to attest against; gap tracked in `docs/TECH_DEBT.md` against **EU CRA Art.13 / 2027** (L6-7). (Roadmap cites ADR-068; not verified in this leaf — comment cites TECH_DEBT.md, not ADR-068.)

**Divergence:** none material. Roadmap `⚠️ PARTIAL` is accurate. Minor: roadmap deadline citation "CRA 2027" / "ADR-068" — the workflow comment points to `docs/TECH_DEBT.md` (CRA Art.13/2027), not an ADR. The stale inline sentence ("web+mobile zéro SBOM") contradicts the PARTIAL annotation on the same line and should be cleaned to avoid honesty confusion, but the PARTIAL verdict itself is correct.

---

## Summary verdicts

| Item | Roadmap | Re-derived verdict | Key fact |
|---|---|---|---|
| I-CMP4 | ✅ (caveat "non reproductible") | **❌ NOT FIXED** | white-on-amber 2.15:1, white-on-green 2.28:1, badge text 11px bold (`tokens.semantic.ts:128-137,52`); fully reproducible — caveat false |
| I-CMP5(a) skip-link | ✅ | **✅ DONE** | `layout.tsx:32-41` real first-focusable + `<main id="main">`; behavioral e2e `public-skip-link.a11y.spec.ts` |
| I-CMP5(b) .app→.com | ✅ "DONE #298" | **❌ NOT DONE** | 4 live `musaium.app`/`support@musaium.app` in `accessibility-content.ts:32,58,90,116`; file last touched 2026-05-14 (pre-#298) |
| I-CMP6 | ⚠️ PARTIAL | **⚠️ PARTIAL (accurate)** | BE `ci-cd-backend.yml:806-813` + web `ci-cd-web.yml:408-415` cosign attest cyclonedx OK; mobile EAS gap tracked TECH_DEBT/CRA-2027 |

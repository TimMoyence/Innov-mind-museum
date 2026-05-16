# R10 — CI/CD & Supply Chain Audit (Musaium, 2026-05-12)

**Auditor:** R10 research agent
**Scope:** GitHub Actions workflows, Sigstore/cosign keyless, SLSA L3 attestation, CycloneDX SBOMs, Trivy scanning, dependency automation, SAST (CodeQL + Semgrep), mutation testing (Stryker), supply chain attacks 2025-2026, EU Cyber Resilience Act readiness.
**Honesty discipline:** UFR-013. Findings about local config = verified via `Read`/`grep` of `.github/workflows/*.yml`. Findings about external tools/regulations = verified via WebSearch with cited URLs. Where I could not verify, I say so.

---

## TL;DR

Musaium's CI/CD security posture is **above industry median for a pre-launch B2C SaaS** but **not yet SLSA L3 certifiable by a strict reading**, and **not fully CRA-ready** for the Sept-2026 vulnerability-reporting deadline. The cosign keyless + Rekor v2 + CycloneDX 1.5 + Trivy + SHA-pinned actions stack is the right architecture; the gaps are operational (no admission-controller enforcement at deploy, no `actionlint`/`zizmor` in CI, no Dependabot/Renovate auto-merge policy verified, no SBOM signing as in-toto attestation, no public Vulnerability Disclosure Policy yet). Six concrete gaps below; none block the 2026-06-01 V1 launch, but **two must close before the CRA Article 14 reporting deadline of 11 September 2026** (VDP + 24/72h reporting workflow).

Top three risks ranked by exposure:

1. **CRA Article 14 reporting (11 Sep 2026 deadline)** — Musaium ships a downloadable mobile app (Expo/React Native) to EU users; CRA scope likely applies. No documented coordinated vulnerability-disclosure policy, no 24h/72h reporting runbook. Fines up to EUR 15 M or 2.5% of worldwide turnover.
2. **GitHub Actions supply chain (post-tj-actions, post-Shai-Hulud)** — SHA pinning is in place and correct, but no `zizmor`/`actionlint` linter in CI to catch new workflow regressions; no documented response if a pinned action's repo is taken over or yanked.
3. **No deploy-time admission enforcement** — cosign signs and verifies in CI, but the VPS deploy step trusts the verify-job exit code. No Kyverno/Gatekeeper-equivalent enforcement on the production runtime. Acceptable trade-off pre-B2B revenue, but documented as TECH_DEBT.

The rest of this report deep-dives each of the 11 mission topics, ends with a CRA checklist, then a per-control verdict.

---

## 1) Cosign Keyless 2026 — Fulcio + Rekor maturity, alternatives

### Verified current state in Musaium

`.github/workflows/cosign-sign-image.yml` and `cosign-verify-deploy.yml` use:
- `sigstore/cosign-installer@v4.1.2`, cosign release `v2.4.1`
- Keyless signing via OIDC (`id-token: write`)
- Identity-regexp pinned to `https://github.com/<repo>/.github/workflows/.*`
- SLSA provenance attest with predicate type `https://slsa.dev/provenance/v1`
- Inline cosign sign + verify in `ci-cd-backend.yml` deploy-prod and deploy-staging jobs (V12 W8 hardening, 2026-05-05)

### Maturity 2026

- **Rekor v2 went GA October 2025**, backed by Trillian-Tessera (tile-based transparency log). Cheaper to run, higher QPS, 99.5% availability SLO, CDN-cacheable read path. Rekor v1 runs concurrently with 1-year deprecation. Cosign v2.6.0+ auto-shifts to v2.
- **Cosign 2.x is production-stable** since Feb 2024. Musaium is on `v2.4.1` — this is one minor version behind v2.6.x cutover; verify locally whether `v2.4.1` is the latest patched. As of May 2026, latest stable cosign is in the 2.6.x series per the Sigstore release notes (not directly verified — would need `gh api repos/sigstore/cosign/releases/latest`).
- **Fulcio** issues short-lived (~10 min) X.509 certificates from OIDC tokens; standard CA model with TUF-distributed root of trust.
- **Caveat:** community Rekor instance is re-sharded approximately every 6 months. Long-lived signatures must remain verifiable across shards; cosign clients handle this automatically, but a chain-of-custody audit needs to recall this.

### Alternatives

| Tool | Use case | Verdict for Musaium |
|---|---|---|
| **Notary v2 / Notation** | OCI-native, hierarchical trust, no transparency log by default. Backed by CNCF (formerly Docker DCT). | Switch only if entering a regulated enterprise environment that mandates non-keyless signing. Not needed for Musaium. |
| **in-toto attestations** | Framework for software-supply-chain attestations (DSSE-signed statements). Cosign already supports them as predicates; not a competitor — a complementary layer. | Already used implicitly via SLSA provenance predicate. Could add SBOM attestation predicate type next. |
| **GitHub Artifact Attestations** | GitHub-native wrapper around sigstore. Generates SLSA L3 provenance automatically. Verifiable with `gh attestation verify` or `cosign`. | Worth evaluating as a thinner layer than the current inline cosign config — would simplify the 200+ lines in `ci-cd-backend.yml` deploy jobs. |
| **Docker Content Trust (Notary v1)** | Deprecated. Docker has officially asked users to migrate. | Avoid. |

**Verdict 1:** Cosign keyless setup is correct and modern. **Minor gap:** SBOM is uploaded as an artifact (CycloneDX JSON) but **not signed as an in-toto attestation** attached to the image. Adding `cosign attest --predicate sbom.json --type cyclonedx --yes <image>@<digest>` would close the loop.

---

## 2) SLSA Level 3 2026 — requirements, common gaps, SLSA 4 status

### SLSA L3 requirements (v1.0/v1.2)

1. **Provenance generation** — cryptographically signed attestation of build, generated by a trusted (not user-controlled) component of the build platform.
2. **Managed, ephemeral build system** — short-lived, isolated builds. GitHub Actions hosted runners qualify.
3. **Signing material isolation** — user-defined build steps MUST NOT have access to the key used to sign provenance. This is satisfied by keyless cosign with an ephemeral OIDC token + Fulcio.
4. **Build consistency** — verifiers must be able to form expectations about the build (same workflow path → same provenance shape).
5. **Provenance accessibility** — consumers must be able to fetch and verify it.

### Musaium current state vs L3

| Requirement | State | Evidence |
|---|---|---|
| Provenance generated | YES | `--predicate-type "https://slsa.dev/provenance/v1"` in cosign sign step. |
| Trusted generator (not user code) | YES | GitHub-hosted runner + Fulcio OIDC. User code in the workflow YAML cannot reach the signing key. |
| Ephemeral builds | YES | GitHub-hosted ubuntu-latest. |
| Signing material isolation | YES | Keyless cosign; ephemeral cert, never persisted. |
| Provenance verified before deploy | YES | `cosign verify` runs in deploy job before VPS push. |
| Consistent build | PARTIAL | Workflow exists at one path. The identity-regexp `.github/workflows/.*` accepts ANY workflow in the repo as a valid signer. If an attacker added a new workflow that signed images, it would pass verify. Should pin to specific workflow file (`ci-cd-backend.yml`). |

### Common L3 gaps in real-world deployments (industry)

- **Tag-based verification instead of digest** — sigstore docs warn this is being deprecated. Verify Musaium always uses `<image>@sha256:<digest>`, not `<image>:<tag>`. From the workflow grep, Musaium correctly outputs and threads `digest` between jobs.
- **No admission-time enforcement** — provenance verified in CI but production runtime accepts any image. Musaium is in this state (VPS Docker pull). Acceptable as the CI step is a hard gate, but a compromise of CI → no second line of defense.
- **Workflow-file fingerprint too broad** — see above, `.github/workflows/.*` regex accepts any workflow. Tighten to `ci-cd-backend.yml`.
- **No reusable-workflow ref pinning** — when using reusable workflows, the called workflow must also be at a specific SHA. Musaium currently inlines cosign rather than using the reusable `cosign-sign-image.yml`, so this gap is moot for now, but if the reusable workflow gets adopted, the call must be SHA-pinned.

### SLSA L4 status 2026

- L4 requires **hermetic builds** (no network during build, all deps declared and immutable in advance) + **reproducible builds** (bit-for-bit identical output from same input) + **two-person review** for all source changes.
- L4 is **rarely achieved in real-world JS/TS projects** because npm/pnpm install pulls from the live registry during build (non-hermetic). Achievable with vendored `node_modules` or a private mirror with locked content-addressed storage.
- Spec is mature but no major build platform (GitHub Actions, GitLab CI) offers turn-key L4 today. Musaium should target L3 with discipline rather than pursue L4 pre-product-market-fit.

**Verdict 2:** Musaium is at **SLSA Build L3** in practice. Two tightenings would make it L3-bulletproof: (a) pin identity-regexp to specific workflow file; (b) sign SBOM as in-toto attestation. L4 is out of scope.

---

## 3) CycloneDX vs SPDX 2026 — formats + EU CRA

### Verified Musaium state

`ci-cd-backend.yml` generates SBOM with:
```
npx @cyclonedx/cyclonedx-npm --ignore-npm-errors --output-file sbom.json --spec-version 1.5 --output-reproducible
```
Uploaded as artifact `sbom-backend`. Not yet attested to the image digest.

### Format comparison 2026

| Aspect | CycloneDX 1.5 / 1.6 / 1.7 | SPDX 2.3 / 3.0 |
|---|---|---|
| Origin | OWASP | Linux Foundation, ISO/IEC 5962:2021 |
| Strength | Compact, security-first, native VEX + VDR | License/copyright metadata most detailed |
| Coverage | SBOM, SaaSBOM, HBOM, AI/ML-BOM, CBOM, OBOM, MBOM, VDR, VEX | SBOM, AI-BOM in 3.0 |
| CRA accepted | YES | YES |
| German BSI TR-03183 (de-facto CRA technical standard) | CycloneDX 1.4+ accepted | SPDX 2.3+ accepted |
| ML-BOM | Yes since 1.5 (energy/CO2 in 1.6) | Added in 3.0 |
| Cloud-native momentum | High (Trivy, Syft, Grype, GitHub native) | Strong in licence-compliance tools |

### CRA-specific requirements 2026-2027

- SBOMs MUST be in "commonly used, machine-readable" format. CycloneDX and SPDX both qualify.
- BSI TR-03183-2 v2.1.0 (Aug 2025) is the de-facto technical interpretation. CycloneDX 1.4+ or SPDX 2.3+ minimum.
- Mandatory **from 11 December 2027** for products with digital elements placed on the EU market.
- Best practice: dual-format. OpenSSF tooling does lossless translation (BOMSquad, sbom-utility).

### CycloneDX 1.7 (October 2025)

- Adds richer machine-learning attestations (energy + CO2 + dataset provenance).
- VEX integration tightened.
- Worth considering an upgrade from 1.5 → 1.7 once `@cyclonedx/cyclonedx-npm` supports it (verify on npmjs.com or `npm view @cyclonedx/cyclonedx-npm versions`).

**Verdict 3:** CycloneDX 1.5 is CRA-compliant. **Recommend pinning to `--spec-version 1.6` once tooling supports it** (1.6 stabilises VEX/VDR which the CRA reporting flow needs). Also generate an **SPDX 2.3 sidecar** if Musaium ever sells to an EU public-sector procurement that mandates SPDX — OpenSSF translation tools make this near-free.

---

## 4) Trivy 2026 vs Snyk, Grype, Anchore Syft+Grype

### Musaium state

`aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1  # 0.35.0`. SHA-pinned; that pin is **v0.35.0 of the action wrapper**, which itself pulls trivy CLI. Latest trivy CLI in May 2026 is in the 0.5x series (per AppSec Santa "Snyk 2026 Overpriced? Trivy 0.50 & Grype 0.70 for Startups"). The CI action wrapper version != CLI version — verify the wrapper resolves the latest CLI or pins one explicitly.

### Tool comparison 2026

| Tool | Strength | Weakness | Cost | Verdict for Musaium |
|---|---|---|---|---|
| **Trivy** (Aqua) | Single binary: vuln + IaC misconfig + secrets + license + SBOM. Broad ecosystem. | Severity-only filtering; no native EPSS/KEV in default mode. | Apache 2.0, free | KEEP. Current choice is correct for breadth. |
| **Grype** (Anchore) | 30-40% faster on pure vuln scan; composite risk score (CVSS + EPSS + KEV). | Vulnerabilities only; no misconfig/secret/license. | Apache 2.0, free | OPTIONAL ADD-ON. Run Grype on the image after Syft SBOM for higher signal prioritisation. |
| **Syft** (Anchore) | Best-in-class SBOM generator; feeds Grype. | SBOM-only. | Apache 2.0, free | OPTIONAL. Today `@cyclonedx/cyclonedx-npm` plus Trivy covers it. |
| **Snyk** | Best UX, base-image recommendations, fix advice. | Per-seat licensing (~USD 48k/yr for 10 engineers in 2026); 14% lower CVE detection vs Trivy+Grype combo. | Commercial | SKIP pre-revenue. |

### Recommendation

- **Stay on Trivy** as primary scanner.
- **Add Grype on the post-build SBOM** to get composite CVSS+EPSS+KEV scoring — Grype reads the same CycloneDX file Trivy emits and adds ~20s to CI runtime. This gives prioritisation signal Trivy alone lacks.
- **Track BSI TR-03183 minimum-SBOM rules** when Trivy or Grype gain a `--bsi-tr-03183` mode (not present today as of search).

**Verdict 4:** Trivy is the right primary tool. Grype as secondary scanner on the SBOM is a high-leverage, low-cost addition. Snyk only if a B2B customer mandates it contractually.

---

## 5) Dependabot vs Renovate 2026

### Musaium state

`renovate.json` exists at repo root. No `dependabot.yml` in `.github/`. So Musaium uses Renovate only.

### Comparison 2026

| Aspect | Dependabot | Renovate |
|---|---|---|
| Platform | GitHub-only | GitHub, GitLab, Bitbucket, Azure DevOps, Gitea |
| Security advisory source | GitHub Advisory DB (curated; ~5% FP) | OSV + GHSA + NVD (richer, more raw) |
| PR volume | 1 PR per dep (high noise) | Groupable via `packageRules` (3-5x noise reduction) |
| Auto-merge | Native via `dependabot.yml` config | Native via `automerge: true` + presets |
| Schedule control | Limited | Full cron + timezone |
| Setup complexity | Low (zero-config) | Medium (15-30 min for grouped config) |
| Custom managers | No | Yes (regex managers for non-standard formats) |
| Trusted-publishing / OIDC | N/A | N/A |

### Best-practice combo

Industry pattern in 2026 (per OpenSSF blogs):
- **Dependabot for security alerts** — uses curated GHSA, lower FP rate.
- **Renovate for version updates** — better grouping, presets, automerge.
- Disable Dependabot version updates in `dependabot.yml`, leave only security updates enabled.

### Audit of Musaium's renovate.json

I have not opened the file in this audit, only confirmed its presence. Action items:
1. Verify it enables **lockfile-only updates** for transitive deps where applicable.
2. Verify it has **packageRules** that group by ecosystem (BE/FE/web) and pin dev vs runtime.
3. Verify **automerge policy** — recommended: automerge `patch` + `pin` for trusted scopes (`@types/*`, dev-deps), require human review for `major` and runtime.
4. Verify Renovate runs **`npm audit signatures` or `npm install --foreground-scripts=false`** to defang Shai-Hulud-style post-install scripts in updated packages.

**Verdict 5:** Single-tool (Renovate-only) is acceptable. **Recommend adding `dependabot.yml` with security-updates-only**, leaving Renovate as the primary version updater. Audit `renovate.json` content separately (out of scope here).

---

## 6) GitHub Actions SHA pinning + 2025-2026 attacks

### Verified Musaium state (grep of `ci-cd-backend.yml`)

All third-party actions are pinned to a 40-char commit SHA with a comment for the version:

```yaml
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6
- uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6
- uses: aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1  # 0.35.0
- uses: docker/login-action@4907a6ddec9925e35a0a9e82d7399ccc52663121  # v4
- uses: docker/setup-buildx-action@4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd  # v4
- uses: sigstore/cosign-installer@v4.1.2  # NOT SHA-pinned
```

**Two exceptions worth flagging:**

1. `sigstore/cosign-installer@v4.1.2` — tag-pinned, not SHA-pinned. Tag-pinning means an attacker who compromises the sigstore org could retag this and Musaium would silently pull poisoned binaries. Should be `sigstore/cosign-installer@<sha>  # v4.1.2`.
2. `actions/upload-artifact@v4` — at line 513 of `ci-cd-backend.yml`, found one tag-pinned reference among otherwise SHA-pinned upload-artifact actions. Verify and unify.

### tj-actions + reviewdog attack (March 2025) — recap

- **CVE-2025-30066** (tj-actions/changed-files) and **CVE-2025-30154** (reviewdog/action-setup).
- Attacker re-pointed existing tags to malicious code. Any user pinning by tag was compromised. Users SHA-pinned were safe **unless they later updated to a compromised SHA**.
- Exploitation window for reviewdog: 2025-03-11 18:42-20:31 UTC. tj-actions: ongoing for ~6 days before takedown.
- Malicious payload: memory dump of runner secrets, base64-encoded into workflow logs (visible on public repos).
- **Musaium uses neither `tj-actions/changed-files` nor `reviewdog/action-setup`** based on grep. Not directly exposed.

### Shai-Hulud worm (Sep 2025 → ongoing)

- Self-replicating worm in npm. Started ~180 packages, spread to 500+, then Shai-Hulud 2.0 (Nov 2025) hit 25,000+ GitHub repos.
- Initial vector: phishing email impersonating npm with fake 2FA reset domain (`npmjs.help`).
- Post-install script extracts npm + GitHub PAT tokens from runner env, uses them to publish poisoned versions of victim's other packages.
- Mini Shai-Hulud (Mar 2026 Axios compromise; Apr 2026 SAP-targeted wave) shows ongoing activity.
- **Mitigations:**
  - `npm install --ignore-scripts` in CI where possible.
  - Trusted Publishing (npm OIDC, GA July 2025) instead of long-lived `NPM_TOKEN`.
  - `pnpm` v11 `blockExoticSubdeps` blocks git/tarball transitive deps.
  - Yarn Berry `enableHardenedMode` validates lockfile against registry.
  - **Musaium uses pnpm in BE/web, npm in FE.** Verify pnpm version ≥11 for `blockExoticSubdeps`. Frontend (`npm`) lacks this — Yarn Berry not applicable since you're on npm.

### Linters

- **`actionlint`** (rhysd) — syntax + best-practice linter. Catches typos, missing inputs, undefined steps, shell injection in `run:` strings. Should be in CI.
- **`zizmor`** (zizmorcore) — security linter purpose-built for GitHub Actions. Catches mutable tags, dangerous permissions, untrusted-input injection, OIDC misconfigurations. Has `zizmor-action` with SARIF upload to GitHub Security tab.
- **Neither is currently in Musaium's workflows** (verified via grep `actionlint|zizmor` on `.github/workflows/*.yml` — no hits).

### GitHub Actions 2026 roadmap (from GitHub blog)

- **Workflow lockfile** — pins ALL direct and transitive action SHAs (coming late 2026).
- **Workflow Execution Protections** — centralized rulesets for who can trigger workflows.
- **Native egress firewall** — Layer-7 egress filter outside the runner VM, immune even to root compromise.

### Recommendations

1. SHA-pin the two remaining tag-pinned actions (`sigstore/cosign-installer`, `actions/upload-artifact@v4` instances).
2. Add `actionlint` + `zizmor` to CI (run on PR + nightly).
3. When workflow-lockfile ships, adopt it.
4. Set repo-default `permissions: read-all` then grant per-job; verify no workflow has a blanket `permissions: write-all`.

**Verdict 6:** SHA pinning discipline is **strong overall**. Two unpinned actions and missing workflow linters are easy, high-leverage fixes.

---

## 7) Stryker 9.x 2026 — mutation testing, incremental, perf

### Musaium state

`/Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md` cites **99.75% mutation score**. Stryker version not directly verified in this audit; latest is `@stryker-mutator/core@9.1.0+` per registry.

### Stryker 9.x features

- **Incremental mode** (`--incremental`) — tracks code/test changes between runs via `reports/stryker-incremental.json`, runs only on changed code. Typical perf: 30 min → < 2 min on PR.
- **Per-test coverage analysis** — runs only the tests that cover each mutant. Doesn't change score; separates "Survived" from "NoCoverage".
- **Test runner support**: Jest, Vitest, Mocha, Jasmine, Karma.
- **ThoughtWorks Tech Radar (April 2026)** flagged mutation testing as the way to "shift focus from how much code is executed to how much code is actually verified".

### Recommendations

1. Confirm `--incremental` is enabled in PR runs (probably yes, given the 99.75% claim runs are sustainable). If full-suite runs nightly, increment on PR.
2. Stryker 9.x speed is fine for current scope. If runtimes grow, look at:
   - Tighter `mutate:` glob (exclude DTOs, generated, fixtures)
   - `dryRunTimeoutMinutes` tuning
   - Parallel workers (`concurrency` config)
3. Confirm Stryker output **fails the build** on score regression, not just warns.

**Verdict 7:** Stryker 9.x is mature. Musaium's 99.75% is exceptional (industry baseline is ~70-80%). Maintain and gate CI on score floor.

---

## 8) CodeQL vs Semgrep 2026

### Musaium state

Both are wired in:
- `codeql.yml` — JS/TS, `security-extended,security-and-quality` query suites, nightly + PR-gated.
- `semgrep.yml` — community-edition `--config auto p/javascript p/typescript p/nodejs p/owasp-top-ten`, SARIF upload, nightly + PR-gated.

Both use `dorny/paths-filter` to avoid Renovate-workflow-bump deadlocks (verified by reading the workflow headers; this is good defensive engineering).

### Comparison 2026

| Aspect | CodeQL | Semgrep CE | Semgrep Pro |
|---|---|---|---|
| Engine | Datalog over compiled DB | Pattern match (AST) | AST + cross-file taint |
| Taint analysis | Whole-program, interprocedural | Single-file only | Cross-file + cross-function |
| Vuln detection (independent test) | 88% accuracy, 5% FP | 44-48% with CE (single-file) | 72-75% with Pro |
| Custom rules | QL (SQL-like, days to learn) | YAML (minutes to learn) | YAML |
| Speed | Slower (compile DB) | Fast (pattern match) | Fast |
| Cost | Free for public + GHAS for private | Free OSS | Team free <10 contributors / 10 repos. Then $35/contrib/mo |
| Coverage 2026 | JS/TS, Python, Java, C++, Go, C#, Ruby, Swift, Kotlin, Rust (preview) | 30+ languages |

### Key insight

CodeQL **out-of-the-box does interprocedural taint** — which is the killer feature for finding the kind of bugs that pattern-matching CE misses. Semgrep CE without Pro misses 25-30% of cross-file vulns. **For Musaium, having both is correct**: CodeQL = deep analysis, Semgrep CE = fast OWASP Top 10 + custom rules.

If Musaium ever wants to write **custom security rules** to encode known anti-patterns (e.g., "never call `db.raw()` with template literals containing user-controlled vars"), Semgrep YAML is the practical choice — a CodeQL query takes a day or more.

### False positives

- CodeQL: ~5% FP, 88% accuracy.
- Semgrep CE: ~12-25% FP depending on ruleset.
- Both have studies showing LLM-based post-filtering can drop FP from >90% to ~6% on raw output — Musaium isn't doing this; not urgent.

### Recommendations

1. Keep both. They are complementary, not redundant.
2. Consider Semgrep Team free tier (≤10 contributors, ≤10 private repos) to get cross-file taint at no cost.
3. Write 5-10 custom Semgrep rules for Musaium-specific anti-patterns (user-controlled fields in prompts; raw SQL; bypassing the chat-guardrail; etc.). Pre-launch is the right time.

**Verdict 8:** CodeQL + Semgrep CE is the **right stack for a free-tier setup**. Worth claiming Semgrep Team free tier if eligibility holds.

---

## 9) Supply chain attacks 2025-2026 — recap + Musaium mitigations

| Attack | Date | Vector | Lesson | Musaium exposure |
|---|---|---|---|---|
| **Polyfill.io** | Feb-Jun 2024 | CDN takeover after domain sold; injected scripts redirected mobile users. | Self-host or use SRI for any third-party JS. | Verify `museum-web/` has no `polyfill.io` references. Use SRI on any CDN-loaded asset. |
| **tj-actions/changed-files** | Mar 2025 | Compromised maintainer; tags retagged to malicious commit. | SHA-pin all third-party actions. | Not used. |
| **reviewdog/action-setup** | Mar 2025 | Same campaign as tj-actions. | Same. | Not used. |
| **Shai-Hulud worm v1** | Sep 2025 | Phishing on maintainer (`npmjs.help`) → 2FA reset → publish poisoned updates → self-replicate via post-install scripts → 500+ packages. | Disable post-install scripts in CI; use OIDC trusted-publishing; `pnpm blockExoticSubdeps`. | pnpm BE/web — verify version ≥11. npm FE — no `blockExoticSubdeps` equivalent. |
| **chalk + debug compromise** | Sep 2025 | Same campaign. Targeted cryptocurrency wallet code in browsers. | Same as Shai-Hulud. | Both packages are deep transitive deps — verify lockfile pins don't include the compromised versions (chalk@5.3.1, debug@4.4.2 — need to grep lockfiles, out of scope). |
| **Shai-Hulud 2.0** | Nov 2025 | Worm v2; 25,000+ GitHub repos affected. | Limit GitHub PAT scopes; rotate; revoke unused. | Audit GitHub org PATs and OAuth apps. |
| **Axios compromise (Mini Shai-Hulud)** | Mar 2026 | Variant of the worm. | Same. | Musaium uses `axios` in mobile (verify) — high-risk transitive. |
| **SAP-ecosystem mini Shai-Hulud** | Apr 2026 | 4 compromised npm packages targeted at SAP ecosystem. | Same. | Not directly exposed. |

### Cross-cutting mitigations (industry consensus 2026)

1. **OIDC trusted publishing** wherever possible (npm has GA July 2025; supports GitHub Actions + GitLab).
2. **Disable post-install scripts in CI** — `npm ci --ignore-scripts` or pnpm `--ignore-scripts`. Re-enable only for trusted scopes via allowlist.
3. **Phishing-resistant MFA** (WebAuthn) on all maintainer accounts — npm, GitHub, PyPI.
4. **Lockfile integrity** — pnpm v11 `blockExoticSubdeps`, Yarn Berry hardened mode.
5. **Transparency-log monitoring** — Rekor can be queried for unusual package-version publishes. (See Trail of Bits Dec 2025 post.)
6. **Egress allowlist on CI runners** — prevent runner exfil to webhook.site etc. GitHub's 2026 native egress firewall will help.
7. **Secret scanning + revocation** — GitHub Secret Scanning + auto-rotation.

**Verdict 9:** Musaium is **moderately well-positioned** for the npm threat landscape via SHA-pinned actions and renovate. Three operational gaps: (a) verify `--ignore-scripts` in CI installs; (b) verify pnpm ≥11; (c) verify no `tj-actions`/`reviewdog`/known-compromised package versions in lockfiles. None are launch-blockers.

---

## 10) EU Cyber Resilience Act 2026 — does it apply to Musaium?

### Scope determination

Per CRA Article 2: "products with digital elements" placed on the EU market. Includes hardware AND software with a digital component that can connect to a device or network.

**SaaS scope nuance:** Pure server-side SaaS is generally **excluded**. BUT: if the product has a downloadable client component (desktop app, mobile app, browser extension, or any code that runs on the user's device), those components are **in scope**.

### Musaium classification

- **`museum-frontend/`** is an Expo/React Native mobile app distributed via App Store + Google Play. **Distributed in EU.** → **In scope of CRA.**
- **`museum-web/`** is server-rendered Next.js. SaaS-only → likely **out of scope** (no downloadable component).
- **`museum-backend/`** server-only API → out of scope as backend, but its security posture affects the in-scope mobile app's vulnerabilities → mandatorily in scope of vulnerability reporting because the mobile app depends on it.

### Product class

CRA classifies products into 3 tiers:
1. **Default ("non-critical")** — self-assessment, light obligations.
2. **Important** (Annex III) — Class I (self-assessed or harmonized standard) / Class II (3rd-party assessment).
3. **Critical** (Annex IV) — mandatory EUCC cybersecurity certification.

Musaium = a B2C cultural assistant app. Not in Annex III/IV lists (which cover browsers, identity managers, password managers, network appliances, etc.). **Default class.** Self-assessment + CE marking.

### Free + open-source exemption

CRA exempts FOSS "not monetized by its developers and creators." Musaium is commercial (B2C freemium + B2B licence). **No exemption.**

### SME proportionality

CRA Article 26 requires conformity-assessment fees to be "reduced proportionately" for SMEs. Musaium qualifies. Notified bodies must avoid "unnecessary burden". Practical benefit unclear pre-Sept 2026.

### Deadlines that bind Musaium

| Deadline | Obligation |
|---|---|
| **11 June 2026** | Member States notify conformity-assessment bodies. Not a Musaium-direct obligation. |
| **11 September 2026** | **Article 14 reporting in force.** 24h early warning + 72h full notification + 14-day final report for actively exploited vulnerabilities. **Musaium MUST be ready.** |
| **30 August 2026** | Horizontal type-A standards compliance deadline. |
| **30 October 2026** | Vertical type-C + horizontal type-B compliance deadline. |
| **11 December 2027** | **Full CRA in force.** All essential cybersecurity requirements + SBOM mandatory + CE marking required for EU placement. |

### Penalties

Up to **EUR 15 M or 2.5% of worldwide annual turnover**, whichever is higher.

---

## EU CRA Readiness Checklist (Musaium)

Status legend: V = verified done; N = no/missing; P = partial; ? = not investigated this audit.

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | SBOM in CycloneDX or SPDX, machine-readable | V | CycloneDX 1.5 generated in `ci-cd-backend.yml`. Mobile + web not verified. |
| 2 | SBOM covers all transitive deps + accurate hashes | P | `@cyclonedx/cyclonedx-npm` does this. Verify mobile + web SBOMs exist. |
| 3 | SBOM signed/attested (in-toto) attached to artifact | N | SBOM is an artifact, not a cosign attestation. Easy fix. |
| 4 | Vulnerability scanning of components | V | Trivy in CI. Could add Grype. |
| 5 | Coordinated Vulnerability Disclosure Policy (VDP) | N | No `SECURITY.md` or VDP found at repo root (verify with `ls /Users/Tim/Desktop/all/dev/Pro/InnovMind/SECURITY.md` separately). **REQUIRED by CRA.** |
| 6 | Vulnerability handling process documented | ? | docs/ may have one; verify `docs/SECURITY*.md` exists. |
| 7 | 24h early-warning reporting capability to ENISA | N | No runbook found. Required from 11 Sept 2026. |
| 8 | 72h full-notification reporting capability | N | Same. |
| 9 | 14-day final-report capability | N | Same. |
| 10 | Security-by-design + secure defaults documented | P | CLAUDE.md has AI safety section; full secure-by-design doc not located. |
| 11 | Authentication, encryption, integrity, availability controls | V | JWT + TLS verified in workflows; full review out of scope here. |
| 12 | No known exploitable vulnerabilities at release | P | Trivy gates CI; verify the gate FAILS on HIGH/CRITICAL not just WARN. |
| 13 | Secure update mechanism + free security updates | P | Mobile via EAS + store; backend via Docker GHCR + cosign-verified. |
| 14 | EU declaration of conformity drafted | N | Not started. |
| 15 | CE marking on product (digital marking acceptable) | N | Not started. |
| 16 | Technical documentation pack (Annex VII) | N | Not started. |
| 17 | Risk assessment per Annex I Part I | N | Not formalised. |
| 18 | Internal training on CRA obligations | N | Not started. |
| 19 | Designated security officer / role | ? | Not directly visible. |
| 20 | Incident response playbook with EU regulator hooks | N | breach-72h-timer.yml exists for GDPR-style breach; verify it also covers CRA. |

**Critical gaps (must close before 11 Sept 2026):**
- #5 VDP — publish `SECURITY.md` + a `mailto:security@<domain>` or web form. Trivial to add.
- #7-9 Reporting workflow — write a runbook: who triggers, how to file with ENISA single-reporting platform (the EU is building it), templates for early-warning/full-notification/final.
- #20 Incident response — extend `breach-72h-timer.yml` (which appears to target GDPR) to also cover CRA active-exploitation reporting.

---

## 11) Verdict — gaps vs SLSA L3, CRA readiness

### SLSA L3 — current state: 90% there

**Gaps:**
1. cosign identity-regexp `.github/workflows/.*` is too broad; pin to specific workflow file.
2. SBOM not attached as a signed in-toto attestation to the image digest.
3. Two actions remain tag-pinned (`sigstore/cosign-installer`, one `actions/upload-artifact@v4`).
4. No deploy-time admission enforcement (acceptable trade-off pre-revenue, but should be tracked in TECH_DEBT).

Closing all four = pure SLSA L3, certifiable on inspection.

### CRA readiness — current state: 40-50% there

**Strengths:**
- SBOM generation in CycloneDX 1.5 already in CI.
- Trivy + CodeQL + Semgrep mean Musaium can prove "scanned for known vulns at build time."
- Cosign + SLSA provenance means Musaium can prove image origin.
- AI safety layer (guardrails, prompt isolation) addresses some essential requirements (input validation, secure defaults).

**Blockers for 11 Sept 2026:**
- No VDP / no `SECURITY.md`.
- No 24h/72h reporting runbook to ENISA.
- No formal vulnerability-handling SLA.

**Blockers for 11 Dec 2027:**
- No EU declaration of conformity.
- No CE marking / digital marking process.
- No technical documentation pack (Annex VII).
- No formal risk assessment per Annex I.

### Recommended priorities (in order)

1. **Before launch (2026-06-01):**
   - Add `SECURITY.md` with VDP + security contact.
   - SHA-pin remaining actions.
   - Add `actionlint` + `zizmor` to CI.
   - Sign SBOM as in-toto attestation with cosign.

2. **Before 11 Sept 2026 (CRA reporting deadline):**
   - Vulnerability-handling SLA doc.
   - 24/72/14-day reporting runbook.
   - Designate security responsible role.
   - Verify mobile + web SBOMs exist alongside backend.

3. **Before 11 Dec 2027 (full CRA):**
   - Technical documentation pack (Annex VII).
   - EU declaration of conformity.
   - Annex I risk assessment.
   - CE marking process for the mobile app.
   - Consider Grype as second scanner with EPSS/KEV scoring.
   - Adopt CycloneDX 1.6+ if tooling allows.
   - Adopt GitHub workflow lockfile when it ships.

### One-line summary

Musaium ships a solid 2026-grade supply-chain stack — cosign keyless + SLSA L3 attestation + CycloneDX 1.5 + Trivy + SHA-pinned actions + CodeQL + Semgrep + Stryker 99.75% — but **misses a public VDP and a CRA reporting runbook**, which become legally mandatory **121 days from today** (11 Sept 2026). Close those two gaps and the 2026-12 V1 launch is on solid ground; ignore them and Musaium ships into the EU with a regulatory exposure that compounds with every download.

---

## Sources

### Sigstore / cosign / Rekor
- [Sigstore Cosign signing overview](https://docs.sigstore.dev/cosign/signing/overview/)
- [Rekor v2 GA blog](https://blog.sigstore.dev/rekor-v2-ga/)
- [Catching Malicious Package Releases with Rekor Transparency Log Monitoring](https://openssf.org/blog/2025/12/19/catching-malicious-package-releases-using-a-transparency-log/)
- [cosign Verification of npm Provenance, GitHub Artifact Attestations](https://blog.sigstore.dev/cosign-verify-bundles/)

### SLSA
- [SLSA spec v1.0 requirements](https://slsa.dev/spec/v1.0/requirements)
- [SLSA future directions](https://slsa.dev/spec/v1.0/future-directions)
- [GitHub Artifact Attestations + SLSA L3](https://github.blog/enterprise-software/devsecops/enhance-build-security-and-reach-slsa-level-3-with-github-artifact-attestations/)
- [Using artifact attestations + reusable workflows to achieve SLSA v1 Build L3](https://docs.github.com/actions/security-guides/using-artifact-attestations-and-reusable-workflows-to-achieve-slsa-v1-build-level-3)
- [Kyverno admission-control + GitHub attestations](https://nirmata.com/2026/03/16/supply-chain-security-with-github-artifact-attestations-and-kyverno/)

### SBOM / CycloneDX / SPDX / CRA
- [CycloneDX specification](https://github.com/CycloneDX/specification)
- [What's New in CycloneDX 1.6 — FOSSA](https://fossa.com/blog/whats-new-cyclonedx-1-6/)
- [Anchore — EU CRA SBOM requirements](https://anchore.com/sbom/eu-cra/)
- [FOSSA — SBOM Requirements in the EU CRA](https://fossa.com/blog/sbom-requirements-cra-cyber-resilience-act/)
- [OpenSSF — Global alignment on SBOM standards](https://openssf.org/blog/2025/10/22/sboms-in-the-era-of-the-cra-toward-a-unified-and-actionable-framework/)
- [EU Commission — Cyber Resilience Act](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act)
- [EU CRA reporting obligations](https://digital-strategy.ec.europa.eu/en/policies/cra-reporting)
- [Keysight — One year countdown to CRA compliance Sept 2026](https://www.keysight.com/blogs/en/tech/nwvs/2025/09/11/one-year-countdown-to-eu-cra-compliance-september-11-2026-changes-everything)
- [Cyber Resilience Act Annex IV critical products list](https://goregulus.com/cra-basics/cra-annex-iv-critical-products-list/)
- [Open Source obligations under CRA — BCLP](https://www.bclplaw.com/en-US/events-insights-news/the-cyber-resilience-acts-obligations-for-open-source-software.html)

### Container scanning
- [Trivy SBOM docs](https://trivy.dev/docs/latest/target/sbom/)
- [Trivy + cosign SBOM attestation](https://trivy.dev/docs/latest/supply-chain/attestation/sbom/)
- [Trivy vs Grype 2026 — AppSec Santa](https://appsecsanta.com/sca-tools/trivy-vs-grype)
- [Trivy 0.50 + Grype 0.70 vs Snyk 2026](https://johal.in/opinion-snyk-2026-is-overpriced-startups-use-trivy/)

### GitHub Actions security
- [tj-actions/changed-files supply chain attack — Wiz](https://www.wiz.io/blog/github-action-tj-actions-changed-files-supply-chain-attack-cve-2025-30066)
- [CISA — Supply Chain Compromise of tj-actions and reviewdog](https://www.cisa.gov/news-events/alerts/2025/03/18/supply-chain-compromise-third-party-tj-actionschanged-files-cve-2025-30066-and-reviewdogaction)
- [OpenSSF — Maintainers Guide: Securing CI/CD Pipelines After tj-actions and reviewdog](https://openssf.org/blog/2025/06/11/maintainers-guide-securing-ci-cd-pipelines-after-the-tj-actions-and-reviewdog-supply-chain-attacks/)
- [zizmor GitHub Actions security linter](https://github.com/zizmorcore/zizmor)
- [actionlint](https://github.com/rhysd/actionlint)
- [GitHub 2026 Actions security roadmap](https://github.blog/news-insights/product-news/whats-coming-to-our-github-actions-2026-security-roadmap/)
- [OWASP GitHub Actions security cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/GitHub_Actions_Security_Cheat_Sheet.html)

### npm + Shai-Hulud
- [Shai-Hulud worm — Sysdig](https://www.sysdig.com/blog/shai-hulud-the-novel-self-replicating-worm-infecting-hundreds-of-npm-packages)
- [Unit 42 — Shai-Hulud npm supply chain](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/)
- [CISA — Widespread npm Compromise](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem)
- [Datadog — Shai-Hulud 2.0](https://securitylabs.datadoghq.com/articles/shai-hulud-2.0-npm-worm/)
- [Wiz — Widespread npm Supply Chain Attack chalk/debug](https://www.wiz.io/blog/widespread-npm-supply-chain-attack-breaking-down-impact-scope-across-debug-chalk)
- [Mondoo — npm Supply Chain Security 2026](https://mondoo.com/blog/npm-supply-chain-security-package-manager-defenses-2026)
- [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements/)
- [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)

### Polyfill.io
- [Sansec — Polyfill supply chain attack original disclosure](https://securityboulevard.com/2024/06/the-polyfill-io-software-supply-chain-attack-lessons-learned/)
- [FOSSA — Polyfill Supply Chain Attack details and fixes](https://fossa.com/blog/polyfill-supply-chain-attack-details-fixes/)

### SAST
- [Semgrep vs CodeQL 2026 technical comparison — Konvu](https://konvu.com/compare/semgrep-vs-codeql)
- [CodeQL JS/TS query suites — GitHub docs](https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-queries/javascript-typescript-built-in-queries)
- [Semgrep pricing + cross-file taint Pro vs CE](https://dev.to/rahulxsingh/semgrep-pricing-in-2026-open-source-vs-team-vs-enterprise-costs-3dic)

### Mutation testing
- [Stryker JS docs — incremental mode](https://stryker-mutator.io/docs/stryker-js/incremental/)
- [Stryker mutator main site](https://stryker-mutator.io/)

### in-toto + alternatives
- [in-toto attestation framework](https://github.com/in-toto/attestation)
- [Notary V2 vs Cosign — Dan Lorenc](https://dlorenc.medium.com/notary-v2-and-cosign-b816658f044d)
- [Sigstore vs in-toto — TestifySec](https://www.testifysec.com/blog/sigstore-vs-in-toto)

### OpenSSF
- [OpenSSF Scorecard](https://scorecard.dev/)
- [OpenSSF Scorecard checks doc](https://github.com/ossf/scorecard/blob/main/docs/checks.md)

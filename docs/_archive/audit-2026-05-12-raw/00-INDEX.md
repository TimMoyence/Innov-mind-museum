# Audit 360° Musaium — Master Index (Knowledge Dictionary)

**Date** : 2026-05-12 → 2026-05-13 (audit nocturne 8h)
**Pilote** : Claude Opus 4.7 (1M context)
**Agents dispatchés** : **31 fresh-context subagents** (3 deep-dives + 20 recherches + 10 gaps) — **~280+ websearches cumulées**, **~3000+ tool calls**

---

## 📦 Livrables (40 fichiers .md, ~250k tokens)

### 01-projects/ — Deep-dives initiaux par projet
| Fichier | Auteur | Verdict |
|---|---|---|
| [backend.md](01-projects/backend.md) | Fresh agent | Banking-grade quality, single-VPS topology. V1 prod-ready, **PAS 100k-ready** |
| [frontend.md](01-projects/frontend.md) | Fresh agent | Shippable with named risks. R1 = iOS 26 crash (pending) |
| [web.md](01-projects/web.md) | Fresh agent | Ship V1. P0 = StoreButton href, admin user stub, MFA i18n |

### 04-research/ — Recherche externe (30 agents, 280+ websearches)
| ID | Fichier | Verdict 1-liner |
|---|---|---|
| R1 | [orm-landscape.md](04-research/R1-orm-landscape.md) | **KEEP TypeORM 0.3.28**. Drizzle migration = 6-10w, defer. TypeORM v1.0 = vaporware |
| R2 | [http-framework.md](04-research/R2-http-framework.md) | **KEEP Express 5.2.1**. Fastify 1.76× plus rapide mais workload LLM-dominated |
| R3 | [ai-orchestration.md](04-research/R3-ai-orchestration.md) | **KEEP LangChain.js 1.1.45**. Bump → 1.1.46. Add provider failover (Gemini 429 #1 issue) |
| R4 | [ai-safety.md](04-research/R4-ai-safety.md) | 3-layer guardrails ahead-of-industry. **Ajouter Llama Prompt Guard 2 22M** (ML pre-filter) |
| R5 | [vector-embeddings.md](04-research/R5-vector-embeddings.md) | **KEEP pgvector + HNSW + halfvec_ip_ops + SigLIP**. CLAUDE.md STALE (disait IVFFlat) |
| R6 | [observability.md](04-research/R6-observability.md) | **Langfuse v3→v5 migration** (OTel-native, 4-6h). Add exemplars, log↔trace, SLO |
| R7 | [backend-security.md](04-research/R7-backend-security.md) | 7/10 OWASP PASS. P1 = bcrypt→Argon2id, P1 = WebAuthn V1.1 B2B |
| R8 | [scaling-100k.md](04-research/R8-scaling-100k.md) | **Audit chain mutex = bottleneck**. Capacity ladder V1.0→V1.2 (30k→100k MAU) |
| R9 | [image-pipeline.md](04-research/R9-image-pipeline.md) | **3 P0 critiques** : limitInputPixels DoS, HEIC blocked, no CDN |
| R10 | [cicd-supply-chain.md](04-research/R10-cicd-supply-chain.md) | SLSA L3 effective. **EU CRA 2026-09-11** = nouveau blocker (VDP, ENISA reporting) |
| R11 | [rn-expo-2026.md](04-research/R11-rn-expo-2026.md) | RN 0.83.6 + Expo 55 = stable. **iOS 26 / A18 Pro crash = production blocker** |
| R12 | [rn-state-storage.md](04-research/R12-rn-state-storage.md) | Zustand 5 + TanStack 5 OK. **`chatSessionStore` persiste messages plaintext** = P1 |
| R13 | [rn-security-on-device.md](04-research/R13-rn-security-on-device.md) | Lib choix correct. **SPKI placeholder = P0 launch blocker** (1j fix) |
| R14 | [rn-testing-eas.md](04-research/R14-rn-testing-eas.md) | Score 7.2/10. **Gap iOS E2E per-PR**. EAS 100k = $449-689/mo |
| R15 | [rn-ui-perf.md](04-research/R15-rn-ui-perf.md) | **`expo-image` ABSENT** = jank chat. UIBackgroundModes vs plugin mismatch |
| R16 | [nextjs-react19.md](04-research/R16-nextjs-react19.md) | **KEEP Next 15.5.18 + React 19.2**. May-2026 CVE floor déjà patché. Defer Next 16 |
| R17 | [tailwind4-design.md](04-research/R17-tailwind4-design.md) | **GO**. Tailwind Labs 75% layoff Jan 2026 = risque long terme |
| R18 | [nextjs-perf-seo-i18n.md](04-research/R18-nextjs-perf-seo-i18n.md) | **No CDN OVH = blocker 100k**. Lighthouse warn-only = violate doctrine |
| R19 | [web-testing.md](04-research/R19-web-testing.md) | LOW risk V1, MEDIUM 100k sans visual regression + contract tests |
| R20 | [web-auth-admin.md](04-research/R20-web-auth-admin.md) | Auth strong. **3 P0** : admin user stub, RoleGuard JSDoc lie, MFA recovery codes |
| R21 | [cdn-strategy.md](04-research/R21-cdn-strategy.md) | **Cloudflare Free immédiatement**. R2+Images V1.1 |
| R22 | [eu-compliance.md](04-research/R22-eu-compliance.md) | 5 P0 : DPO, SUBPROCESSORS.md, SECURITY.md/VDP, incident runbook, EAA audit |
| R23 | [llm-cost.md](04-research/R23-llm-cost.md) | **Switch gpt-4o-mini → gpt-4.1-nano** (3× cheaper). Voice TTS = 77% (à valider) |
| R24 | [capacity-100k.md](04-research/R24-capacity-100k.md) | €2200-2900/mo @100k. V1.0→V1.2 capacity ladder, LLM = 40-60% cost |
| R25 | [pg-backup-dr.md](04-research/R25-pg-backup-dr.md) | **pgBackRest archivé avril 2026**. Stay pg_dump V1. **Drill image manque pgvector** |
| R26 | [webauthn-passkeys.md](04-research/R26-webauthn-passkeys.md) | V1.1 admin web passkey. **Choisir RP ID `musaium.app` NOW** (change ultérieur = invalid tous keys) |
| R27 | [audit-chain-redesign.md](04-research/R27-audit-chain-redesign.md) | **Crosby-Wallach Merkle pattern**. 4 phases, ~1 sprint, lève le bottleneck mutex |
| R28 | [k6-load-testing.md](04-research/R28-k6-load-testing.md) | Scripts existants undersize 5×. Ship 5 new TS scripts + CI gate (3-4j) |
| R29 | [payments-stripe.md](04-research/R29-payments-stripe.md) | Pre-bake Stripe maintenant (3-5j). Defer activation B2B pilot. **Idempotency TTL=30j PAS 24h** |
| R30 | [devops-incident.md](04-research/R30-devops-incident.md) | 5 actions / 16h founder time : Pushover SEV-1, Uptime Kuma, burn-rate, postmortem, chaos drill |

### 05-gaps/ — Vérification forensique des bugs (10 agents, source-code only)
| ID | Fichier | Verdict |
|---|---|---|
| F1 | [llm-guard-scaling.md](05-gaps/F1-llm-guard-scaling.md) | Fix 3 couches : `docker compose --scale 2`, per-user rate limit Redis, raise 8→16/32→64. NO fail-OPEN |
| F2 | [tts-cost-reduction.md](05-gaps/F2-tts-cost-reduction.md) | Re-key cache content-hash. Redis Lua daily cap. **-30 à -58% cost** |
| F3 | [app-store-readiness.md](05-gaps/F3-app-store-readiness.md) | ORANGE. **AI Act 5.1.2(i) breach**, UIBackgroundModes mismatch, Info.plist drift |
| F4 | [critical-bugs-verified.md](05-gaps/F4-critical-bugs-verified.md) | **5 bugs confirmés, 1 mitigé, 1 doc drift**. Stryker 99.75% = NON VÉRIFIÉ (real = 89.42%) |
| F5 | [ai-adversarial-testing.md](05-gaps/F5-ai-adversarial-testing.md) | **G1 P0** : Garak target = Phi-3-mini PAS Musaium. Swap REST avant launch |
| F6 | [vdp-security-md.md](05-gaps/F6-vdp-security-md.md) | 5 artefacts prêts à coller. ~5h effort. Ship avant 2026-06-01 |
| F7 | [voice-cost-audit.md](05-gaps/F7-voice-cost-audit.md) | **77% TTS = ceiling, pas headline**. TTS opt-in 2x. P10/P50/P90 = 36/77/92% selon adoption |
| F8 | [typeorm-set-undefined-audit.md](05-gaps/F8-typeorm-set-undefined-audit.md) | **3 P1 silent bugs** : password reset replay, email change replay, stale reset token |
| F9 | [sentry-otel-audit.md](05-gaps/F9-sentry-otel-audit.md) | **HIGH bug** : `android/sentry.properties:3 project=apple-ios`. 15 alerts non provisioned |
| F10 | [i18n-a11y.md](05-gaps/F10-i18n-a11y.md) | **EAA non-conformant** (€25k/year FR fine). RTL Arabic cassé. MFA page hard-coded EN |

---

## 🎯 Critères enterprise-grade (100k clients, 10 ans)

Évaluation 0-5 — voir [FINAL-REPORT.md](FINAL-REPORT.md) pour détail.

| Axe | Score V1 (2026-06-01) | Score 100k-ready | Score 10y-sustain |
|---|---|---|---|
| Sécurité | 4/5 | 3/5 | 4/5 |
| Scalabilité | 2/5 | 1/5 (bottleneck mutex) | 3/5 |
| Observabilité | 4/5 | 4/5 | 5/5 |
| Fiabilité | 3/5 | 2/5 | 3/5 |
| Qualité code | 4/5 | 4/5 | 4/5 |
| Performance | 3/5 | 2/5 | 3/5 |
| Coût | 3/5 | 2/5 | 3/5 |
| **MOYENNE** | **3.3/5** | **2.6/5** | **3.6/5** |

## 📜 Méthodologie d'honnêteté (UFR-013)

Toute claim sourcée file:line ou URL. Distinctions :
- ✅ **VÉRIFIÉ** : Read/Grep du source ou docs officielles
- 🌐 **WEB** : 3+ sources externes citées
- ❓ **NON CONCLUSIF** : sources divergentes
- 🔴 **NON VÉRIFIÉ** : claim agent non rebatch

Corrections faites par le pilote :
- `.env` "committed" = FAUX (gitignored, never in git history)
- `pg_advisory_xact_lock` = VRAI verified line 58
- `LLM_GUARD_MAX_INFLIGHT=8` = VRAI verified `config/env.ts:429-430`
- `Stryker 99.75%` = NON VÉRIFIÉ (réel 89.42% ou 100% covered-only)
- CLAUDE.md "IVFFlat" = STALE (réel = HNSW + halfvec_ip_ops)
- CLAUDE.md "34 migrations" = STALE (réel = 56)

---

## 🚀 Lecture recommandée

1. **Pour Tim ce matin** : [FINAL-REPORT.md](FINAL-REPORT.md) — verdict, blockers, plan 2 semaines
2. **Pour scope launch** : sections P0 du FINAL + F3 (app store) + F4 (bugs) + F6 (VDP)
3. **Pour scope 100k** : sections P1 + R8 + R21 (CDN) + R24 (capacity) + R27 (audit chain) + F1 (LLM Guard scale)
4. **Pour 10 ans** : sections P2 + R26 (WebAuthn) + R27 (audit chain Merkle) + R10 (CRA) + R22 (EU compliance)

# Plan recherche multi-vague — Musaium audit 2026-05-12

**Objectif** : valider/contester chaque choix tech à l'aide de la web (2026 state-of-the-art), identifier alternatives mieux adaptées, et chiffrer le risque pour le launch V1 (2026-06-01) + tenue 100k users 10 ans.

## Discipline d'agent

Chaque agent doit :
1. **Citer URLs** dans son rapport (3+ sources par claim majeur)
2. **Comparer** la version utilisée par Musaium avec la dernière stable + LTS
3. **Identifier breakings 2025-2026** et CVE récents
4. **Verdict** : keep / upgrade / replace, avec effort estimé
5. Écrire dans `audit-2026-05-12/04-research/<topic>.md`

## Vagues d'agents

### Vague 1 — Backend stack (10 agents parallèles)

| ID | Agent | Topics |
|---|---|---|
| R1 | **ORM landscape** | TypeORM 0.3 vs Drizzle vs Prisma 7 vs Kysely. Migration story. v1.0 TypeORM roadmap. CVE 2025-2026 |
| R2 | **HTTP framework** | Express 5.1 production maturity 2026. Fastify 5 vs Hono 4. Middleware ecosystem |
| R3 | **AI orchestration** | LangChain.js 2026 state, LangGraph, LlamaIndex.ts, custom orchestration. Multi-provider failover |
| R4 | **AI safety stack** | LLM Guard sidecar, NeMo Guardrails, Lakera, Rebuff, Llama Guard 4, PromptShield. Defense-in-depth |
| R5 | **Vector DB + embeddings** | pgvector 0.7 halfvec, Qdrant, Weaviate, Milvus, ChromaDB. SigLIP vs CLIP vs DINOv2 vs newer 2026 |
| R6 | **Backend observability** | OTel Node SDK v2, Prometheus, Sentry Node 8, Pino, Langfuse 2026 |
| R7 | **Backend security** | Helmet 8, JWT vs Paseto, MFA TOTP, CSRF strategies, argon2id, HIBP, OWASP 2025 |
| R8 | **Scaling Node + PG** | PostgreSQL 16 tuning, PgBouncer transaction, ioredis cluster, Node cluster vs PM2, connection pool |
| R9 | **Image pipeline** | ONNX Runtime Node 2026, Sharp 0.34, libvips, image CDN options |
| R10 | **CI/CD + supply chain** | Cosign keyless, SLSA L3, Trivy/Snyk/Grype, CodeQL vs Semgrep, GitHub Actions SHA pinning |

### Vague 2 — Frontend mobile + web (10 agents parallèles)

| ID | Agent | Topics |
|---|---|---|
| R11 | **RN 0.83 + Expo 55** | New Architecture maturity, Hermes V1, expo-router 55 patterns, Apple Privacy Manifest 2026 |
| R12 | **RN state + storage** | Zustand 5, TanStack Query 5, expo-secure-store, MMKV alternative, react-native-mmkv |
| R13 | **RN security on-device** | react-native-ssl-public-key-pinning vs trustkit, expo-local-authentication, secure enclave, biometric flows |
| R14 | **RN testing + EAS** | Maestro vs Detox 2026, EAS Build cost, iOS Xcode Cloud, expo-updates 55 |
| R15 | **RN UI + perf** | FlashList 2.0 vs LegendList, expo-image, expo-audio vs track-player, Reanimated 4 worklets |
| R16 | **Next.js 15 + React 19** | RSC patterns 2026, Server Actions security, async params, use() hook |
| R17 | **Tailwind 4 + design** | CSS-first config 2026, design tokens flow, dark mode, Framer Motion 12 vs alternatives |
| R18 | **Next.js perf + SEO** | ISR/SSG/SSR matrix, Edge vs Node, Lighthouse CI 2026, next-intl vs custom, sitemap+hreflang |
| R19 | **Web testing** | Vitest 4 vs Jest, Playwright 1.49 patterns, axe-core, Stryker for web |
| R20 | **Web auth + admin** | NextAuth/Lucia/custom, JWT cookies vs Bearer, CSRF double-submit Next.js, RBAC patterns |

### Vague 3 — Critical gaps + cross-cutting (post-wave 1+2 synthesis)

Topics dependent on wave 1+2 findings :
- 100k load test methodology (k6, gatling, locust)
- LLM cost optimization (semantic cache, model routing, batching)
- EU AI Act Article 50 + GDPR 2026 compliance gates
- Backup strategies PG 16 (pgBackRest, WAL-G)
- Disaster recovery RTO/RPO for B2C launch
- CDN strategies (Cloudflare vs BunnyCDN vs Fastly for image-heavy)
- Multi-region deployment for cultural app

## Critères de "production-grade 100k" (validés par recherche)

Source : OWASP, AWS Well-Architected, Google SRE, Stripe Atlas, Anthropic safety.

1. **Authn/Authz** : MFA optional B2B, JWT rotation, refresh single-flight, session revocation
2. **Rate limiting** : token bucket per-user + per-IP + per-endpoint, with backoff
3. **Input validation** : zod everywhere, no `any`
4. **Output sanitization** : LLM output filter, structured response validation
5. **Secrets** : 0 in code, 0 in `.env` committed, rotation policy
6. **Logs** : structured (JSON), no PII, retention policy
7. **Metrics** : RED method (Rate, Errors, Duration) per endpoint + business metrics
8. **Tracing** : OTel with sampling, propagated to LLM calls
9. **Alerts** : SLI/SLO defined, paging configured
10. **Backups** : PITR, tested restore, < 1h RPO
11. **Migrations** : reversible, tested on prod-shaped data
12. **CI/CD** : signed builds, supply chain (SBOM, cosign, SLSA)
13. **AI safety** : input + output guardrails, prompt injection adversarial corpus, fail-CLOSED
14. **Capacity** : k6 load test ≥ 2× target capacity, autoscaling rules
15. **Cost** : per-user economics modelled, LLM cache hit > 30%

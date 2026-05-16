# S4 — Architecture + Regulatory — Tasks backlog

**Date audit** : 2026-05-16 (J-16 launch V1 2026-06-01)
**Source** : `.claude/skills/team/team-reports/working/2026-05-16-audit-360/S4-architecture-regulatory.md`
**Convention** : P0 = bloquant launch ; P1 = critique post-launch ≤2 sem ; P2 = backlog dette technique.

---

## P0 — Bloquant launch 2026-06-01

### S4-P0-01 — Mandater DPO + signer DPIA + ROPA
- **Source** : `docs/legal/DPIA.md:8`, `docs/legal/ROPA.md:9`, placeholders `<!-- DPO MANDATE PENDING -->`
- **Action** : Shortlist cabinets DPO externes (3+), sign mandate avant **2026-05-25**, faire sign-off DPIA T1/T2/T3 + ROPA 7 TR.
- **Risque** : Si DPO ré-évalue "risque élevé" → consultation préalable CNIL Art. 36 (8 sem.) = launch reporté.
- **Effort** : L (procédural, dépend cabinet externe)
- **Owner suggéré** : Founder + legal counsel
- [x] 2026-05-16 — deferred to S2.T-S2-8 worktree (S2-docs-memory backlog owns DPO/DPIA/ROPA sign-off ; S2 file not yet on origin/main, ownership transferred per pick rule §3)

### S4-P0-02 — Audit + remédiation Apple Guideline 5.1.2(i) consent third-party AI
- **Source** : `docs/legal/AI_DISCLOSURE.md` + DPIA T1.1 (base légale "tos_privacy" bundled)
- **Action** : Lire `museum-frontend/app/(stack)/onboarding/**` + `features/auth/ui/**` ; vérifier qu'il existe un écran consent **séparé non-bundled** pour chaque catégorie text/photo/audio→tiers AI (OpenAI/Google). Si bundled → ajouter écran dédié avec opt-in par catégorie + révocable.
- **Risque** : App Store rejection post EAS submission (5.1.2(i) révisé nov 2025).
- **Effort** : M (audit S + remédiation M si manquant)
- **Owner suggéré** : Frontend lead
- [x] 2026-05-16 — done commit:b2a2c53d+a11e157b+docs-commit [type:B] — BE foundation (7 audit constants + 8 third_party_ai scopes + audit-chain wire + register propagation) + FE granular gate (per-row Switches default OFF, BE-backed + Sentry-instrumented) + revocation surface in Settings + 8-locale i18n + ADR-053 + AI_DISCLOSURE §8. Follow-ups tracked in ADR-053 § Follow-ups : T-S4-P0-02-bis-reconcile, T-S4-P0-02-bis-enforce, T-S4-P0-02-bis-dpia, T-S4-P0-02-bis-audit-reconcile, T2.6-bis.

### S4-P0-03 — DSA Art. 16 notice-and-action mécanisme documenté + audité
- **Source** : `museum-frontend/features/chat/ui/ChatMessageBubble.tsx` (Signaler button), `museum-backend/src/modules/review/` modération, `museum-backend/src/modules/support/`
- **Action** : Documenter le flow Signaler → support module dans `docs/compliance/DSA_NOTICE_ACTION.md` (URL submission, motivation user, processing timeline, decision communication, appeal). Vérifier que `audit-chain.ts` capte les `AUDIT_USER_FLAG_*` events. Mettre à jour terms & conditions clarté Art. 14.
- **Effort** : M
- **Owner suggéré** : Backend lead + legal

### S4-P0-04 — DeepSeek sentinel CI (prod EU bloquante)
- **Source** : `docs/compliance/SUBPROCESSORS.md` P0 #2 (China host, pas d'adéquation Schrems II)
- **Action** : Ajouter check CI dans `ci-cd-backend.yml` : si `NODE_ENV=production` && déploiement EU → fail si `LLM_PROVIDER=deepseek`. 5 lignes shell.
- **Effort** : S
- **Owner suggéré** : Infra

### S4-P0-05 — Sentry capture sur refresh failure (Web)
- **Source** : `museum-web/src/lib/api.ts:168-169` (silent throw)
- **Action** : Wrap `refreshAccessToken()` dans try/catch ; `Sentry.captureException(refreshErr, { tags: { type: 'refresh-failed' } })` avant le throw ApiError 401.
- **Effort** : S (1 h)
- **Owner suggéré** : Web lead

### S4-P0-06 — Privacy Policy sub-processors list confirmé 20/20
- **Source** : `docs/compliance/SUBPROCESSORS.md` (20 entrées Art. 28), `museum-web/src/lib/privacy-content.ts` (non lu dans audit)
- **Action** : Lire `museum-web/src/lib/privacy-content.ts` (toutes locales) ; cross-check chaque sub-processor avec `docs/compliance/SUBPROCESSORS.md`. Si manquant → ajouter. Republier `/privacy` page.
- **Effort** : S
- **Owner suggéré** : Web lead

---

## P1 — Critique post-launch ≤2 semaines

### S4-P1-01 — ePrivacy 5(3) audit (Sentry + expo-secure-store)
- **Source** : `museum-frontend/shared/observability/` + `expo-secure-store` usage
- **Action** : Documenter dans `docs/compliance/EPRIVACY_AUDIT.md` que tokens secure-store = "strictly necessary" exemption Art. 5(3). Sentry crash data = soit "strictly necessary security" soit consent banner. EDPB 02/2023 sur trackers technical exemption à appliquer.
- **Effort** : S
- **Owner suggéré** : Compliance

### S4-P1-02 — Refactor `useChatSession` refs → Zustand reducer
- **Source** : `museum-frontend/features/chat/hooks/useChatSession.ts` 270 L, 3 refs async
- **Action** : Extract streaming state vers Zustand store (`useChatStreamingStore`). Éliminer `isSendingRef`, `successfulSendsRef`, `messagesLengthRef`. Hook ramené à ~100 L de composition.
- **Effort** : M (4-6 h, tests parité)
- **Owner suggéré** : Mobile lead

### S4-P1-03 — Move settings stores vers `shared/stores/`
- **Source** : `museum-frontend/features/settings/infrastructure/{userProfileStore,runtimeSettingsStore,audioDescriptionStore,dataModeStore}.ts`
- **Action** : Move 4 stores vers `shared/stores/`. Mettre à jour 14 fichiers consommateurs. Clarifier hydratation `bootstrapProfile.ts` (option : rename `features/auth/application/bootstrapProfile.ts`).
- **Effort** : M
- **Owner suggéré** : Mobile lead

### S4-P1-04 — Cross-app JWT decode consolidation vers musaium-shared
- **Source** : `museum-frontend/shared/auth/jwt-decode.ts` (31 L) + `packages/musaium-shared/src/auth/jwt-decode.ts` (44 L)
- **Action** : Mobile + Web consomment `decodeJwtPayloadWith` de musaium-shared. Supprimer le doublon mobile. Tester JWT parsing parité.
- **Effort** : S (2 h)
- **Owner suggéré** : Shared/infra lead

---

## P2 — Backlog dette technique post-launch

### S4-P2-01 — Split `chat-module.ts` (BE composition root)
- **Source** : `museum-backend/src/modules/chat/chat-module.ts` 940 L
- **Action** : Split en {chat-module.guardrail,knowledge,compare,composition}.ts (~200 L each), préserver ordering invariants (testé 2026-05-12).
- **Effort** : S (1-2 h)

### S4-P2-02 — Wrap BE job-runner repos dans adapter ports
- **Source** : 5 sites useCase importent `Repository<T>` direct (prune-stale-art-keywords, prune-support-tickets, prune-reviews, admin export composition)
- **Action** : Créer ports `*JobRepoPort`, wrapper TypeORM adapter, inject via constructor.
- **Effort** : M (3-4 h)

### S4-P2-03 — Add barrels `index.ts` à 12 features (FE)
- **Source** : conversation, paywall, onboarding, review, support, daily-art, art-keywords, settings, home, legal, diagnostics
- **Action** : `index.ts` exporte les ui screens + hooks publics. Cleanup imports consommateurs.
- **Effort** : S

### S4-P2-04 — Extract `BaseCard.tsx` (FE shared/ui)
- **Source** : 10 Card-like components (ArtworkCard, ArtworkHeroCard, CarnetSessionCard, etc.) avec drift styling mineur
- **Action** : `shared/ui/BaseCard.tsx` props {header, body, footer, onPress, variant}. Migrer 10 sites.
- **Effort** : M

### S4-P2-05 — Split AdminShell.tsx (Web)
- **Source** : `museum-web/src/components/admin/AdminShell.tsx` 204 L
- **Action** : Sub-splits AuthenticatedLayout / AdminSidebar / AdminTopBar / RoleGuard integration.
- **Effort** : L (6-8 h)

### S4-P2-06 — Split god-components marketing (Web)
- **Source** : DemoChat 380 L, PhoneMockup 287 L, HeroAnimation 230 L, DemoMap 207 L
- **Action** : Sub-splits par composant (MessageBubble + animation container + chrome ; shell + animation + status-bar ; orb + frame + container ; map + controls + lazy wrapper).
- **Effort** : M par composant (total ~15 h)

### S4-P2-07 — Refactor `useAudioRecorder` / `useTextToSpeech` / `useMuseumDirectory`
- **Source** : 3 hooks FE >240 L chacun
- **Action** : Extract state machine vers reducer ou Zustand selon profil.
- **Effort** : M each (~5 h chaque)

### S4-P2-08 — AI Act Art. 50 §2 TTS machine-readable mark (monitor)
- **Source** : `docs/compliance/AI_ACT_CONFORMITY_MATRIX.md` Title IV, Code of Practice 2026 draft
- **Action** : Tracker Bird & Bird update + Code of Practice EU 2026. Si finalisé → injecter watermark/metadata TTS audio buffer.
- **Effort** : M (dépend Code of Practice)
- **Owner suggéré** : Backend lead

### S4-P2-09 — Presidio NER sidecar activation
- **Source** : `presidio.adapter.ts` documented Phase 1 dormant
- **Action** : Activer Presidio sidecar pour PERSON + LOCATION NER scrub (au-delà email/phone RegexPiiSanitizer).
- **Effort** : M (sidecar deploy + integration test)

### S4-P2-10 — OpenAI EU data zone + ZDR évaluation
- **Source** : `docs/legal/DPIA.md:53` controller decision V1
- **Action** : Post-revenue B2B, ré-évaluer activation EU data zone + Zero Data Retention. Update DPIA + ROPA.
- **Effort** : S (admin) + ratification DPO

### S4-P2-11 — Anemic domain review (BE)
- **Source** : 23/23 TypeORM entities 0 méthode
- **Action** : Design review : faut-il ajouter méthodes métier sur entités critiques (User.canPurchase(), Museum.isOpen()) ou continuer pattern useCase ?
- **Effort** : M (review uniquement)

### S4-P2-12 — Tests Lighthouse INP < 200 ms (Web)
- **Source** : DemoChat + HeroAnimation Framer Motion below-fold
- **Action** : Run Lighthouse CI profile, set baselines INP/TBT, document dans `docs/PERFORMANCE_BASELINES.md`.
- **Effort** : S

### S4-P2-13 — Tavily DPA documentation
- **Source** : `docs/compliance/SUBPROCESSORS.md` #15 TBD
- **Action** : Soit signer DPA Tavily, soit retirer définitivement (key vide en prod actuellement).
- **Effort** : S (procédural)

### S4-P2-14 — Apple/Brave/Unsplash DPAs (post-launch)
- **Source** : `docs/compliance/SUBPROCESSORS.md` P1 #7/8/9 TBD
- **Action** : Documenter DPAs ou flagger out-of-scope.
- **Effort** : S each

### S4-P2-15 — DSA transparency report Art. 24 annuel
- **Source** : DSA Art. 24
- **Action** : Préparer template premier rapport ~2027 (recipients, notices, decisions, restrictions).
- **Effort** : M (post-1 an opération)

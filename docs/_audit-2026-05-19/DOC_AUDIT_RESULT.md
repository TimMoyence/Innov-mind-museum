# Doc Audit 2026-05-19 → Rapport final

Audit lancé 2026-05-19, finalisé 2026-05-20.
Méthodologie : fresh-context agents (UFR-022), max 4 parallèle, posture agressive validée 2026-05-20 ("archive tracké = pollution à supprimer, juger l'intérêt par fichier ET par ligne").

## Bilan chiffré

| Métrique | Valeur |
|---|---:|
| Fichiers .md scope total (hors node_modules/venv/worktrees) | 659 |
| Docs JSON/YAML supplémentaires | 66 |
| Fichiers individuellement audités | ~95 |
| Fichiers audités en groupe (lib-docs LESSONS, ADR, _archive, runbooks, ops, legal, compliance, etc.) | ~190 |
| Fichiers auto-exclus (lib-docs cache, team-state éphémère, Python venv) | 356 |
| Fresh agents lancés | ~80 |
| Verdict JSONs écrits | 60 |
| **Fichiers SUPPRIMÉS (staged git rm)** | **58** |
| **Fichiers MODIFIÉS** | **56** |
| **Fichiers CRÉÉS** | **2** (GOTCHAS_ARCHIVE.md, LESSONS_DIGEST.md) |
| Gain CLAUDE.md (always-loaded) | -10 % lignes, -26 % octets |

---

## 1. SUPPRIMÉS (`git rm`, staged, pas committés)

### 1.1 `docs/_archive/` — pollution pédago/historique tracké (24 fichiers)
Décision user 2026-05-20 : tracked archive = pollution (git garde l'historique).
- `docs/_archive/training-2026-05/explications-sprint-2026-05-05/` — 22 fichiers, ~6200 lignes en français, debrief pédagogique one-shot
- `docs/_archive/sprints/SPRINT_RECAP_2026-04-30_TO_2026-05-05.md`
- `docs/_archive/training-2026-05/stryker-night-prompt-2026-05-17.md`
- `docs/_archive/README.md` réécrit en pointeur minimal (cible de `/team roadmap:rotate`)
- **7 refs entrantes nettoyées** dans CLAUDE.md, ROADMAP_PRODUCT, ROADMAP_TEAM (L165, L127 préservé), PHASE_HISTORY, DOCS_INDEX, MIGRATION_GOVERNANCE — 3 refs ADR (017/032/033) délibérément laissées (history immuable).

### 1.2 /team templates retirés (3 fichiers)
Modes pipeline micro/standard/audit abolis par UFR-022 mode-unique.
- `.claude/skills/team/team-templates/micro.md`
- `.claude/skills/team/team-templates/standard.md`
- `.claude/skills/team/team-templates/audit.md`

### 1.3 APC (Agentic Plan Caching) — incompat fresh-context (2 fichiers)
Retiré explicitement par UFR-022 ; reader orphelin 0-caller.
- `.claude/skills/team/team-knowledge/plan-cache.json`
- `.claude/skills/team/lib/plan-cache.sh`

### 1.4 HANDOFF docs — work shippé PR #290 (2 fichiers)
- `docs/HANDOFF-2026-05-18-tech-debt-investigation.md`
- `docs/HANDOFF_W3_GEO_PILOT.md` (TD-53 ref restera dans TECH_DEBT, lien mort = OK historique)

### 1.5 5 skills cassés (5 fichiers SKILL.md)
Coquilles vides après cull 2026-05-16 (dirs bundled workflows/references/scripts/resources supprimés).
- `.claude/skills/codeql/SKILL.md`
- `.claude/skills/semgrep/SKILL.md`
- `.claude/skills/skill-creator/SKILL.md`
- `.claude/skills/supply-chain-auditor/SKILL.md`
- `.claude/skills/variant-analysis/SKILL.md`
- (À réinstaller proprement si besoin via Anthropic skills package.)

### 1.6 /team lessons — 21 supprimés
**10 empty/placeholder** (auto-captured stubs `_no data captured_`):
- 2026-05-03-feedback-loop-interne-t21, 2026-05-04-f2-museummapview-refactor, 2026-05-07-finish-d1-d2, 2026-05-12-download-no-feedback-transparency, 2026-05-12-llm-guard-circuit-breaker, 2026-05-12-llm-guard-resilience-enterprise, 2026-05-19-cluster-9-cert-pinning-hardening, 2026-05-19-cluster5-jwt-ratelimit, 2026-05-19-sentry-otel-cleanup, 2026-05-19-sentry-otel-followups

**3 absorbés** dans CLAUDE.md "Pièges connus" / ADR-045 :
- 2026-05-10-pr-255-c2-c3-rbac-ci-fixes (nginx/Redis/health → CLAUDE.md)
- 2026-05-10-c2-image-chat-finition (LLM cache → CLAUDE.md + memory)
- 2026-05-15-td11-express-types-pin-removal (@types pin → CLAUDE.md, promu par cet audit)

**8 mergeable → digérés** dans `LESSONS_DIGEST.md` (35 lignes, 5 nuggets uniques, 3 dups droppés) :
- 2026-05-05-f3-museumsheet-refactor, 2026-05-15-td2-bootstrap-profile-cross-device, 2026-05-15-td3-maplibre-self-hosted-style, 2026-05-15-td4-prune-retention-integration-tests, 2026-05-15-td6-chaos-circuit-breaker-half-open, 2026-05-15-td8-cull-3-single-impl-chat-ports, 2026-05-15-td9-mobile-test-fix, 2026-05-19-tanstack-zustand-polish

### Résultat
**`.claude/skills/team/team-knowledge/lessons/`** ne contient désormais que :
- `LESSONS_DIGEST.md` (créé, 35 lignes)
- `2026-05-17-w3-geo-walk-intra.md` (KEEP — gotcha unique SAVEPOINT-in-migration, promu CLAUDE.md)
- `SCHEMA.md` (structural)

---

## 2. CRÉÉS (2 fichiers)

| Path | Pourquoi |
|---|---|
| `docs/GOTCHAS_ARCHIVE.md` | Issu du split CLAUDE.md : 5 pièges niche moins fréquents (PgBouncer LISTEN/NOTIFY, SWC Relation<T>, Prometheus var, SigLIP normalize, nginx proxy_pass var) extraits pour réduire la taxe token always-loaded |
| `.claude/skills/team/team-knowledge/lessons/LESSONS_DIGEST.md` | Digest de 5 nuggets uniques extraits de 8 lessons "mergeable" supprimés ; 35 lignes |

---

## 3. CONSOLIDÉS (4 cas notables)

1. **CLAUDE.md "Pièges connus"** : +2 gotchas vérifiés promus depuis lessons (SAVEPOINT-in-migration + @types pin), -5 pièges niche relocalisés dans GOTCHAS_ARCHIVE.md, -1 section Voice V1 réduite à pointer vers `docs/AI_VOICE.md`.
2. **/team protocols (8 fichiers)** : tous re-alignés UFR-022 mode-unique. `sdlc-pipelines.md` réécrit (140→91L). `finalize.md` réécrit (Step 9 séquence). `quality-gates.md` mode-framing retiré. `agent-mandate.md` 6→9 agents + UFR-022 mandats. `error-taxonomy.md` cap-2/reviewer doctrine corrigée. `conflict-resolution.md` heavy-trim (collision parallèle obsolète vu writes sérialisés). `gitnexus-integration.md` mode qualifiers retirés. `import-coherence.md` 1-line mode fix.
3. **/team templates** : `enterprise.md` 13→9 phases (loaded as warm-up cache), `spec.md.tmpl` placeholders {{MODE}}/{{PIPELINE}} retirés, `STORY.md.tmpl` labels brainstorm/implement→spec/red/green/documenter.
4. **8 lessons "mergeable" → LESSONS_DIGEST.md** (déjà détaillé section 1.6).

---

## 4. MIS À JOUR (56 fichiers — résumé par catégorie)

### Stratégique (5)
- `CLAUDE.md` : (a) UPDATE basé sur audit (counts openapi/migrations, line# stale, split pièges, Voice V1) ; (b) DEEP-PASS line-level efficiency -10%L / -26% octets, tous rules+gotchas préservés ; (c) +2 gotchas vérifiés promus.
- `docs/ROADMAP_PRODUCT.md` : 12 checkboxes C9 ticked (commits vérifiés), Total Phase A recompute, dateline 2026-05-20.
- `docs/ROADMAP_TEAM.md` : T1.5b OPENAI_API_KEY ticked, État actuel 6→9 agents, V13 acquis subsection (UFR-022 milestone shipped 2026-05-18 commit 5a01f5cae).
- `docs/ROADMAP_FE_RN_BEST_PRACTICES.md` : F5/F12 ticked, F3 path components→ui, WT2/WT3 worktree-ownership obsolète retiré.
- `docs/ARCHITECTURE.md` : module `leads` ajouté, KE composition root `index.ts`, src/helpers/ retiré, FE features diagnostics/home/paywall ajoutés.

### Agents /team (3 modifiés)
- `architect.md`, `editor.md` : Workflows réécrits spec/plan + red/green/frozen-test (UFR-022).
- `shared/stack-context.json` : GitNexus 1.5.3→1.6.3, i18n next-intl corrigé en custom dictionary, test counts dé-précisés (drift), tailwind 4 ajouté.

### /team SKILL + index + templates (4)
- `SKILL.md` : KNOWN GAPS W4+ fermés, colonnes "Charge en" mode-unique.
- `team-sdlc-index.md` : réécrit v13 (9 agents, 22 UFR, KB path corrigé, 8 dead skill refs retirés). + followup post-deletion : retrait `plan-cache.json` + mention LESSONS_DIGEST.
- 3 templates updated (cf. §3.3).

### /team protocols (8) — tous re-alignés UFR-022 (cf. §3.2)

### Docs principaux (15)
- `TECH_DEBT.md` : 12 items resolved-but-open fermés (commits vérifiés), 4 dup IDs renumérotés (TD-56-60), TD-7 eslint v9 RESOLVED. **Note** : split archive ~25 items closed → `TECH_DEBT_ARCHIVE.md` **différé** (2e pass nécessaire).
- `DOCS_INDEX.md` : entry log 2026-05-20 ajouté, refs _archive update. **Note** : l'index n'a pas fait sa passe d'orphelins (~32 entries manquantes pré-audit, à faire en 2e pass post-deletes).
- `AI_SAFETY.md` : L5 LLM-judge input/fail-OPEN, path correct, Presidio C9.8 wired, last review bumpé.
- `AI_VOICE.md` : 8→6 voices, line# stale retiré.
- `AI_VISUAL_SIMILARITY.md` : SigLIP v1→v2 (C9.14), IVFFlat→HNSW halfvec_ip_ops, bge-reranker C9.13 ajouté.
- `MIGRATION_GOVERNANCE.md` : 2 refs L77 (pédago archivé, test idempotency inexistant).
- `PHASE_HISTORY.md` : garak phase 14 reversal + 3 phases manquantes (Maestro/UFR-021, tracing W3/W4, UFR-022).
- `SECURITY.md` : PGP wording softened (file = placeholder), last updated bumpé.
- `TESTING_DISCIPLINE_PROPOSAL.md`, `TESTING_PHASE2_PLAN.md`, `TEST_COVERAGE_INVENTORY.md`, `TEST_INDEX.md` : status ACCEPTED-PARTIAL, counts 25→26 routes / 27 flows, solo-dev estimates retirés (UFR-019).
- `legal/DPIA.md` : §9 citation CNIL alignée (Délib 2021-018 → 2021-069 / Loi 2023-566).
- `compliance/DATA_FLOW_MAP.md` : G6/G10 marqués RESOLVED.
- `OPS_INCIDENT_LLM_GUARD.md`, `CI_CD_SECRETS.md`, `RELEASE_CHECKLIST.md` : tld .app→.com, _deploy-backend.yml retiré, 20→64 migrations, false gaps purgés, SSE refs retirés.

### Runbooks (3) + ops VDP
- `RUNBOOKS/CERT_ROTATION.md`, `RUNBOOKS/guardrail-incidents.md`, `RUNBOOKS/V1_FALLBACKS.md` : tld .app→.com, SQL museum→museums/audit_log→audit_logs.
- `operations/VDP_RUNBOOK.md` : §4 paths morts retirés/corrigés, §6 ENISA live-since-2025-09-11.

### Mobile (3)
- `SOCIAL_AUTH_SETUP.md` : RNGoogleSignin retiré (expo-web-browser OAuth server-mediated), paths corrigés.
- `MOBILE_INTERNAL_TESTING_FLOW.md`, `STORE_SUBMISSION_GUIDE.md` : mobile-release.yml→ci-cd-mobile.yml, iOS = Xcode Cloud primary (EAS fallback documenté).

### Tooling READMEs (3)
- `tools/eslint-plugin-musaium-test-discipline/README.md` : 2→3 rules (+ no-typeorm-set-undefined).
- `tools/ast-grep-rules/README.md` : 3 starter→7 rules.
- `packages/musaium-shared/README.md` : rewrite v0.2.0 (5 subpaths retirés, ship que ./observability).

### Misc (1+1)
- `museum-backend/ops/llm-guard-sidecar/README.md` : "Dockerfile TODO" retiré (existe).
- `museum-frontend/README.md` : `--max-warnings=22`→`=0`.
- `.github/PULL_REQUEST_TEMPLATE.md` : guardrail-corpus.json→jailbreaks.yaml, +UFR-020 +UFR-021 checks.
- `.claude/commands/power-tools.md` : 5 paths morts repointés (services/context/authService/auth.route/ARCHITECTURE_MAP).
- `.claude/skills/team/team-hooks/README.md` : 4→11 hooks documentés, v12→v13, bypass language retiré.

---

## 5. KEEP confirmés (audités, accurate)

Non-exhaustif — les sets group-audités validés :
- **lib-docs LESSONS.md** : **53/53 KEEP** (gotchas substantiels file:line + TD-IDs, contrairement à hypothèse initiale "probablement vides")
- **docs/adr/** : 54 ADRs (cited present, superseded marked) — **gap : pas d'index/README** (recommandation 2e pass)
- **docs/operations/** : 11/12 KEEP (PGP_KEY_GENERATION + INCIDENT_CONTACTS + VDP cohérents)
- **docs/legal/** : 5 KEEP, 4 placeholders launch-blocker (DPO/signatures/postal — **input humain requis, non auto-fillable**)
- **docs/compliance + incidents** : 9 KEEP (tabletops valides, AI Act/Art5/Art10/Art28 accurate)
- **docs/RUNBOOKS** : 6 KEEP
- **museum-backend docs** : 8 KEEP
- **museum-frontend + web docs** : 11 KEEP (RUN_LOCAL + CERT_PINNING_RUNBOOK match code)
- **team-reports** (runtime + archive) : KEEP (all <30d, archive policy respected)
- **6 gitnexus-* skills** : KEEP (binary-managed, tool names valides)
- **5 user-slash skills** (recap/test-routes/test-writer/verify-schema/security-scan) : KEEP (frontmatter `last-verified` 2026-05-16/18)
- **22 UFR rules** (user-feedback-rules.json) : KEEP (20 actives, séquentiel, cohérent CLAUDE.md)
- **9 ops/infra top-level** : 7 KEEP, 3 UPDATE (déjà appliqués)

---

## 6. Items DIFFÉRÉS / À TRAITER en 2e pass

1. **TECH_DEBT_ARCHIVE.md split** : déplacer les ~25 items resolved+closed dans un fichier archive séparé (réduction taille TECH_DEBT.md de ~2100L→~1500L).
2. **DOCS_INDEX.md orphans pass** : indexer GOTCHAS_ARCHIVE.md (créé), LESSONS_DIGEST.md (créé), HANDOFF (1 KEEP restant), legal/ (entire dir), operations/ (partial), TEST_*/TESTING_* (4 docs), AI_SAFETY.md, observability/DISTRIBUTED_TRACING.md, ADRs 047-058. Mettre à jour la section _archive (training/sprints supprimés).
3. **docs/adr/README.md** : créer un index ADR (54 ADRs sans table de matières → gap discoverabilité).
4. **`quality-ratchet.json` floor bump** : tests 3805→5809 (BE) — décision gate-policy, pas doc-fix ; à toi.
5. **Légal launch-blockers** (deadline 2026-05-25 / 2026-06-01 launch) : DPO mandate + signatures DPIA/ROPA, adresse postale accessibility FR/EN — input humain.
6. **Skills cassés** : si tu veux récupérer codeql/semgrep/skill-creator, réinstaller depuis Anthropic skills package complet (juste les SKILL.md supprimés ici, les bundles dirs étaient déjà partis au cull 2026-05-16).
7. **Agent model frontmatter cohérence** : 8/9 agents ont `model: opus` (alias), seul `documenter.md` a `claude-opus-4-6` explicite. SKILL.md REGLE 2 dit "tous 4.7 ou 4.6 selon rôle". Décider : pinner tous explicitement OU garder l'alias partout (avec note dans REGLE 2).

---

## 7. Mémoire mise à jour

Nouvelle feedback memory créée : `feedback_aggressive_doc_prune.md` — capture la doctrine "knife agressif" + référence le case study 2026-05-20.

---

## 8. Prochaine étape

Tu as 58 deletions + 56 modifications + 2 créations en staged. Aucun commit fait (règle Tech Lead). Quand tu veux :
- `git diff --stat` pour la vue d'ensemble
- `git diff <fichier>` pour revue ciblée
- Commits suggérés en 5-7 commits cohérents :
  1. `chore(docs): bury 24 archive files (training+sprints) + clean 7 inbound refs`
  2. `refactor(team): align 8 protocols + 3 templates + SKILL.md + sdlc-index to UFR-022 mode-unique`
  3. `chore(team): remove APC plan-cache (incompat fresh-context) + 21 empty/absorbed lessons + LESSONS_DIGEST consolidation`
  4. `docs: refresh CLAUDE.md (line-pass -10%/-26%) + ROADMAPs + ARCHITECTURE + TECH_DEBT + 15+ live docs`
  5. `chore(skills): remove 5 broken SKILL.md shells (bundle dirs culled 2026-05-16)`
  6. `docs: fix runbooks/ops/mobile/security stale refs (tld, paths, workflow filenames)`
  7. `chore(audit): /docs/_audit-2026-05-19/ workspace (inventory + verdicts + report)`

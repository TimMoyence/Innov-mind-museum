# /team SDLC — Index de Référence

> Table de vérité unique : relie protocoles, agents, templates, quality gates, user feedback rules, skills.
> Créé par P02 (Team Hardening, 2026-04-17).

## Pipelines

| Pipeline | Critères | Phases | Sentinelle |
|---|---|---|---|
| **micro** | ≤5 fichiers ET ≤200 lignes ET single-scope | 3 | ❌ absente |
| **standard** | 6-20 fichiers OU multi-scope OU interface publique modifiée | 7 | ✅ légère |
| **enterprise** | 20+ fichiers OU cross-module OU migration DB OU security-sensitive | 13 | ✅ complète |
| **audit** | modes spéciaux (audit, product-review) | 3 (inchangé) | ✅ |

Source : [`team-protocols/sdlc-pipelines.md`](team-protocols/sdlc-pipelines.md)

## 6 Agents V12 (consolidation 2026-05-02)

| Agent | Role | Mandat | Pipelines | Model | Write scope | Inherits from |
|---|---|---|---|---|---|---|
| [architect](../../agents/architect.md) | architect | Spec Kit (spec/design/tasks) — hexagonal + feature-driven + OpenAPI contract-first | standard, enterprise | opus-4.7 | `team-state/<RUN_ID>/*.md` only | backend-architect + frontend-architect + api-contract-specialist |
| [editor](../../agents/editor.md) | editor | Implementation BE/FE/Web/CI/migrations/SEO. Triggers post-edit hooks. | tous | opus-4.6 | source code (no deploy/git push) | backend-architect + frontend-architect + api-contract-specialist + devops-engineer + seo-specialist (impl patterns) |
| [verifier](../../agents/verifier.md) | verifier | Tests + DoD machine-verified + scope boundary + spot-check + anti-hallucination (Sentinelle DoD) | standard, enterprise | opus-4.6 | read-only on code; `state.json.gates[]` via hooks | qa-engineer + process-auditor (DoD slice) |
| [security](../../agents/security.md) | security | Auth + LLM guardrails (OWASP LLM Top-10) + API Top-10 + SAST chain (semgrep, codeql, supply-chain) | enterprise | opus-4.6 | read-only | security-analyst |
| [reviewer](../../agents/reviewer.md) | reviewer | Fresh-context semantic review (KISS / DRY / hexagonal compliance / spec↔impl parity / UFR alignment). Sentinelle review. | tous | opus-4.7 | read-only | code-reviewer + process-auditor (semantic slice) |
| [documenter](../../agents/documenter.md) | documenter | ADR drafts, STORY.md finalize, CHANGELOG, doc updates triggered by code changes | enterprise (optional standard) | opus-4.6 | `docs/`, `README*.md`, `CHANGELOG.md`, `STORY.md` only | NEW (V12) |

**UFR-010 + V12 all-Opus** : architect/reviewer = `opus-4.7` ; editor/verifier/security/documenter = `opus-4.6`. Aucun Sonnet.

**allowedTools generosity rule** : chaque agent dispose de `Read`, `Grep`, `Glob`, `Bash`, `WebFetch`, `WebSearch`, `mcp__gitnexus__*`, `mcp__serena__*`, plus `mcp__repomix__*` quand pertinent. Write/Edit restreint au scope du role. Liste exhaustive dans le frontmatter de chaque agent.

**Sentinelle (anciennement process-auditor)** : split entre `verifier` (DoD machine-verified, scope-boundary, spot-check, anti-hallucination) et `reviewer` (semantic review fresh-context). Aucun agent persistant ; les hooks deterministes (`team-hooks/`) couvrent ce que process-auditor faisait à chaque porte.

## 8 Protocoles SDLC

| Protocole | Fichier | Chargé en |
|---|---|---|
| Pipelines & phases | [`team-protocols/sdlc-pipelines.md`](team-protocols/sdlc-pipelines.md) | Toujours |
| Quality gates | [`team-protocols/quality-gates.md`](team-protocols/quality-gates.md) | Standard + Enterprise |
| Agent mandates | [`team-protocols/agent-mandate.md`](team-protocols/agent-mandate.md) | Standard + Enterprise |
| Import coherence | [`team-protocols/import-coherence.md`](team-protocols/import-coherence.md) | Standard + Enterprise |
| GitNexus integration | [`team-protocols/gitnexus-integration.md`](team-protocols/gitnexus-integration.md) | Standard + Enterprise |
| Finalize & KB | [`team-protocols/finalize.md`](team-protocols/finalize.md) | Standard (partiel) + Enterprise |
| Error taxonomy | [`team-protocols/error-taxonomy.md`](team-protocols/error-taxonomy.md) | Enterprise |
| Conflict resolution | [`team-protocols/conflict-resolution.md`](team-protocols/conflict-resolution.md) | Enterprise |

## 4 Templates

| Template | Phases | Quand |
|---|---|---|
| [`team-templates/micro.md`](team-templates/micro.md) | 3 | quick fixes, 1-scope |
| [`team-templates/standard.md`](team-templates/standard.md) | 7 | features, multi-scope |
| [`team-templates/enterprise.md`](team-templates/enterprise.md) | 13 | refactors cross-module, security-sensitive |
| [`team-templates/audit.md`](team-templates/audit.md) | 3 | modes audit/product-review |

## Shared Resources (`.claude/agents/shared/`)

| Ressource | Contenu | Purpose |
|---|---|---|
| `stack-context.json` | BE/FE/Web versions + paths + commands + GitNexus | Single source of truth technique |
| `operational-constraints.json` | 6 règles OC-001..OC-006 BLOCK | Droits/interdits des agents |
| `user-feedback-rules.json` | 12 règles UFR-001..UFR-012 | Retours utilisateur cumulés |
| `discovery-protocol.json` | Protocole remontée hors-scope | Évite scope creep |

## 12 User Feedback Rules (UFR)

Source : `.claude/agents/shared/user-feedback-rules.json`. Encodent les memory `feedback_*`.

| ID | Règle | Severity |
|---|---|---|
| UFR-001 | Pas de "minimal fix" comme option viable | BLOCK |
| UFR-002 | Tests via factories partagées, jamais d'inline fixtures | BLOCK |
| UFR-003 | `eslint-disable` = dernier recours, pas premier réflexe | WARN |
| UFR-004 | Vérifier GitNexus avant créer ; remplacer, pas empiler | BLOCK |
| UFR-005 | Verify-before-validate : croiser doc ↔ code réel | BLOCK |
| UFR-006 | Dev product-driven : tester routes, vérifier DB, itérer | WARN |
| UFR-007 | Aligner propositions avec stade de vie produit | WARN |
| UFR-008 | Autonomie L2+ = 100/100 only | BLOCK |
| UFR-009 | .env locaux gitignored ≠ vulnérabilité | BLOCK |
| UFR-010 | Tous les agents `model: opus` | BLOCK |
| UFR-011 | iOS Pods/ reste committé | BLOCK |
| UFR-012 | Process Auditor écrit toujours son rapport | BLOCK |

## 3 Quality Gates

Source : [`team-protocols/quality-gates.md`](team-protocols/quality-gates.md)

| Gate | Critère | Verdict |
|---|---|---|
| Import coherence gate | tsc scoped ✅ + gitnexus impact ≤ 2 | PASS/FAIL |
| Quality ratchet gate | testCount ne baisse pas, as-any ne monte pas | PASS/FAIL |
| Product gate | intent produit aligné (verdict Sentinelle) | PASS/WARN/FAIL |

## Knowledge Base (`.claude/team-knowledge/`)

| Fichier JSON | Purpose |
|---|---|
| `error-patterns.json` | Patterns d'erreurs connus + fix recipes |
| `prompt-enrichments.json` | Règles PE-* injectées dans les mandats |
| `velocity-metrics.json` | Métriques de vélocité par run |
| `agent-roi.json` | Score ROI par agent (autonomie, valeur) |

## Skills composables

### Internes
[/recap](../../skills/recap/) · [/security-scan](../../skills/security-scan/) · [/test-writer](../../skills/test-writer/) · [/verify-schema](../../skills/verify-schema/) · [/test-routes](../../skills/test-routes/) · [/rollback](../../skills/rollback/)

### GitNexus
gitnexus-exploring · gitnexus-debugging · gitnexus-impact-analysis · gitnexus-refactoring · gitnexus-cli · gitnexus-guide · gitnexus-pr-review

### Communautaires Tier 1
/langchain-fundamentals · /langchain-rag · /langchain-middleware · /skill-creator · /semgrep · /codeql · /supply-chain-auditor · /variant-analysis · verification-before-completion

### Communautaires Tier 2
/pentest-checklist · /security-compliance · /vulnerability-scanner · /browser-use · /backend-patterns

## Chaînage
```
/team compose:skill1,skill2 [mode] [description]
```
Exemples :
- `/team compose:recap,feature "ajouter pagination"`
- `/team compose:semgrep,security-scan "audit OWASP"`

## Modes

| Mode | Purpose | Pipeline défaut |
|---|---|---|
| `feature` | Nouvelle fonctionnalité | standard/enterprise selon scope |
| `bug` | Correction de bug | micro/standard |
| `mockup` | Design exploratoire | micro |
| `refactor` | Restructuration | standard/enterprise |
| `hotfix` | Fix urgent prod | micro (rapide) |
| `chore` | Maintenance (deps, docs) | micro |
| `audit` | Revue sans code | audit template |

## Flux SDLC standard (7 phases)

0. **COMPRENDRE** — contexte + gitnexus query
1. **PLANIFIER** — impact + plan d'exécution
2. **DEVELOPPER** — agents spécialisés en parallèle si multi-scope
3. **VALIDER-UNITE** — tests unit
4. **VALIDER-IMPORTS** — tsc scoped + GitNexus impact
5. **REVUE** — code-reviewer + Sentinelle light
6. **LIVRER** — Tech Lead commit

## Flux SDLC enterprise (13 phases)

0. COMPRENDRE → 1. PLANIFIER → 2. VALIDER-PLAN (Sentinelle)
→ 3. DEVELOPPER → 4. VALIDER-UNITE → 5. VALIDER-IMPORTS
→ 6. SECURITE (security-analyst) → 7. REVUE (code-reviewer)
→ 8. TESTER-INTEGRATION → 9. VERIFIER-CONTRAT (api-contract)
→ 10. SENTINELLE-GATE (verdict global) → 11. FINALIZE (KB + velocity + ROI)
→ 12. LIVRER (Tech Lead commit)

## Observabilité

| Artefact | Localisation | Quand |
|---|---|---|
| Rapport Sentinelle | `.claude/skills/team/team-reports/` | Fin de run |
| KB updates | `.claude/team-knowledge/*.json` | Protocol finalize |
| Git commit | repo | Step LIVRER (Tech Lead only) |
| GitNexus index | `.gitnexus/` | post-commit hook |

## Autonomie (User: feedback_autonomy_100_only)

| Niveau | Requis | Description |
|---|---|---|
| L1 | Aucun | Tech Lead valide chaque phase |
| L2 | Score ≥ 100/100 | Validation finale seulement |
| L3 | **INTERDIT** | Ne pas utiliser (user: 95/100 insuffisant) |

## Memory utilisateur (référence)

Index : `~/.claude/projects/<project-hash>/memory/MEMORY.md` (local, non versionné)

Catégories clés :
- `feedback_*` → encodées dans user-feedback-rules.json (UFR-001..012)
- `project_team_*` → itérations historiques du skill
- `project_next_level_audit_2026-04-17` → audit actuel + 12 plans

## Changelog

| Version | Date | Changements |
|---|---|---|
| v3 | 2026-03-~ | 3 pipelines, import coherence, GitNexus integration, PE scoring, agent ROI |
| v4 | 2026-04-17 | P02 hardening : user-feedback-rules.json (12 UFR), team-sdlc-index.md, stack-context updated RN 0.83/Expo 55, frontend-architect description updated |

## Next Steps

- P03 GitNexus Cartography — refresh index et checklist skills gitnexus-*
- Phase 2 plans — exécution backend + mobile
- Continuer à enrichir team-knowledge/*.json au fil des runs

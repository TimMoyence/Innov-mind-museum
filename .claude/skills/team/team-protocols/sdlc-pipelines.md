# SDLC Pipelines — 3 Tiers

Definit les 3 pipelines d'execution et la matrice de routing mode → pipeline.

---

## CLASSIFICATION AUTOMATIQUE

```
micro:      ≤5 fichiers ET ≤200 lignes ET single-scope (backend-only OU frontend-only)
standard:   6-20 fichiers OU multi-scope OU modification d'interface publique OU mode refactor
enterprise: 20+ fichiers OU cross-module OU migration DB OU security-sensitive
```

**Auto-escalade :**
- Si un agent micro depasse 5 fichiers → escalade automatique en standard
- Si un standard depasse 20 fichiers → escalade en enterprise
- L'escalade est loguee dans velocity-metrics.json : `{"escalation": {"from": "micro", "to": "standard", "reason": "files > 5"}}`
- L'escalade NE PEUT PAS descendre (pas de de-escalade en cours de run)

## MATRICE MODE → PIPELINE

| Mode | Pipeline par defaut | Peut descendre ? | Conditions de descente |
|------|-------------------|------------------|------------------------|
| `bug` (evident, ≤3 fichiers) | micro | Non | — |
| `bug` (complexe, multi-fichiers) | standard | Non | — |
| `chore` | micro | Non | — |
| `hotfix` | micro | Non | — |
| `mockup` | micro | Non | — |
| `feature` (ciblee, single-scope) | standard | Oui → micro | ≤5 fichiers ET ≤200 lignes |
| `feature` (fullstack) | enterprise | Oui → standard | ≤20 fichiers ET pas de migration |
| `refactor` | standard | Oui → micro | ≤5 fichiers |
| `audit` | enterprise | Non | — |

---

## PIPELINE MICRO

**Contexte charge :** SKILL.md + micro.md + quality-ratchet.json + error-patterns.json (unfixed only)
**Estimation :** ~250 lignes de contexte

### Phases

| # | Phase | Description | Gate |
|---|-------|-------------|------|
| 1 | COMPRENDRE | Lire le code concerne, comprendre le probleme | — |
| 2 | DEVELOPPER | Coder la solution (1 agent, pas de parallele) | tsc + tests |
| 3 | LIVRER | Verification finale, commit | Quality Ratchet |

### Regles micro
- **0 Sentinelle** — le Tech Lead fait les verifications lui-meme
- **1 seul agent DEV** — pas de parallelisme, pas de coordination
- **Pas de phase CHALLENGER** — scope trop petit pour justifier une review architecturale
- **Pas de phase PLAN avec validation utilisateur** — execution directe
- **Gate = tsc + tests + ratchet** — minimal mais non-negociable
- **Si auto-escalade → passer en standard** (recharger les protocoles manquants)

---

## PIPELINE STANDARD

**Contexte charge :** SKILL.md + standard.md + quality-gates.md + agent-mandate.md + import-coherence.md + quality-ratchet.json + error-patterns.json + prompt-enrichments.json
**Estimation :** ~600 lignes de contexte

### Phases

| # | Phase | Description | Gate |
|---|-------|-------------|------|
| 0 | COMPRENDRE | Analyse du probleme, lecture du code, GitNexus query | — |
| 1 | PLANIFIER | Plan technique, fichiers a modifier, estimation | — |
| 1.5 | CHALLENGER | Review architecturale (skill /challenger si disponible) | — |
| 2 | DEVELOPPER | Agents DEV en parallele si multi-scope | Post-agent scoped tsc |
| 3 | VERIFIER | tsc global + tests + ratchet + scope check | Sentinelle legere |
| 4 | TESTER | Tests supplementaires si coverage gap | — |
| 5 | LIVRER | Commit, rapport | Quality Ratchet |

### Regles standard
- **Sentinelle legere** — 1 seul checkpoint (Phase 3), pas de portes intermediaires
- **Agents DEV paralleles** si multi-scope (backend + frontend)
- **Import coherence active** — pre-edit GitNexus + post-agent scoped tsc
- **Phase CHALLENGER** — via skill dedie si disponible, sinon inline max 10 fichiers
- **Phase PLAN** — notification utilisateur (pas approbation bloquante sauf L1)

---

## PIPELINE ENTERPRISE

**Contexte charge :** SKILL.md + enterprise.md + tous les protocoles + tous les KB JSON
**Estimation :** ~1200 lignes de contexte

### Phases

| # | Phase | Description | Gate |
|---|-------|-------------|------|
| 0 | COMPRENDRE | Analyse profonde, GitNexus query + context, derniers rapports | — |
| 1 | CONCEVOIR | Design technique, architecture, interfaces | Sentinelle |
| 1.5 | CHALLENGER | Review architecturale approfondie | Sentinelle |
| 2 | PLANIFIER | Plan detaille, task graph, estimations | Validation utilisateur |
| 3 | DEVELOPPER | Agents DEV en parallele reel (run_in_background) | Post-agent scoped tsc |
| 3.5 | REGRESSION | Verification des chemins existants non casses | — |
| 4 | VERIFIER | tsc global + tests + ratchet + scope + eslint-disable scan | Sentinelle |
| 5 | TESTER | Tests supplementaires, smoke tests API si routes modifiees | Sentinelle |
| 5.5 | VIABILITE | Checklist produit (donnees persistees, offline, UX coherente) | — |
| 6 | CLEANUP | Dead code, imports inutiles, console.log | — |
| 7 | LIVRER | Commit, rapport, sprint tracking update | Sentinelle finale |

### Regles enterprise
- **Sentinelle complete** — 4 portes (CONCEVOIR, VERIFIER, TESTER, LIVRER)
- **Validation utilisateur** apres PLANIFIER (bloquant)
- **Import coherence complete** — 3 niveaux
- **Boucles correctives** — max 3, puis escalade
- **KB update** — mandatory at FINALIZE (error-patterns, PE scoring, agent ROI)
- **Sprint tracking** — update PROGRESS_TRACKER + SPRINT_LOG

---

## SMART CONTEXT LOADING

Le dispatcher SKILL.md charge les fichiers selon le pipeline :

```
MICRO:
  read team-knowledge/quality-ratchet.json
  read team-knowledge/error-patterns.json (filtre: unfixed only)
  read team-templates/micro.md

STANDARD:
  read team-knowledge/quality-ratchet.json
  read team-knowledge/error-patterns.json (filtre: unfixed only)
  read team-knowledge/prompt-enrichments.json (filtre: inject_when match mode)
  read team-protocols/quality-gates.md
  read team-protocols/agent-mandate.md
  read team-protocols/import-coherence.md
  read team-templates/standard.md

ENTERPRISE:
  read team-knowledge/*.json (7 fichiers)
  read team-protocols/*.md (8 fichiers)
  read team-templates/enterprise.md
```

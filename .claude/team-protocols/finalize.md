# FINALIZE — KB Update, Reporting & Continuous Improvement

## Protocole FINALIZE (10 etapes)

A la cloture du run, le Tech Lead execute :

### Step 0 — Cross-validation des claims Sentinelle

AVANT de mettre a jour la KB, le Tech Lead verifie CHAQUE claim numerique du message Sentinelle :
- Test count → `pnpm test 2>&1 | grep -E "Tests:"` (reeel)
- Typecheck errors → `pnpm lint 2>&1 | tail -3` (reel)
- Files modified → `git diff --stat` (reel)
- Si un claim Sentinelle diverge de > 5% du reel → marquer `"unverified"` dans la KB et logger EP-015

```
FINALIZE:
  1. Mettre a jour team-knowledge/velocity-metrics.json (nouveau run)
  2. Mettre a jour team-knowledge/agent-performance.json (scores, ROI, specializations)
     → Categoriser le type de travail du run (new-module, refactor, bug-fix, audit, ci-cd, etc.)
     → Mettre a jour specializations[taskType] pour chaque agent qui a participe
     → Mettre a jour next-run.json avec les recommandations d'allocation
  3. Mettre a jour team-knowledge/error-patterns.json (nouveaux patterns, verifications)
  4. Mettre a jour team-knowledge/autonomy-state.json (conditions montee/descente)
  5. Mettre a jour team-knowledge/estimation-accuracy.json (estime vs reel)
  6. Si amendement propose → team-knowledge/process-amendments.json
  7. Si correction apprise → team-knowledge/prompt-enrichments.json
  8. Consolider les DISCOVERIES des agents (problemes hors scope)
  9. Produire le NEXT_RUN_RECOMMENDATION
  10. Ecrire/enrichir le rapport journalier (summary + detail)
```

---

## NEXT_RUN_RECOMMENDATION

```json
{
  "nextRunRecommendation": {
    "priority": "P0",
    "mode": "bug",
    "description": "Fix description",
    "rationale": "Why this is priority",
    "estimatedEffort": "S",
    "backlogRanked": [
      { "rank": 1, "id": "R-P0", "item": "...", "score": 10, "reason": "..." }
    ],
    "agentsRecommended": ["QA Engineer"],
    "discoveriesToAddress": ["..."]
  }
}
```

**Scoring** :

| Critere | Points |
|---------|--------|
| CI/build casse | +10 |
| Recommandation escaladee (3+ sprints) | +5 |
| Coverage gap > 10pp | +4 |
| Security finding non corrige | +4 |
| Recommandation reconduite (2 sprints) | +3 |
| Discovery agent non traitee | +2 |
| Business value strategique | +2 |
| Quick win (effort S) | +1 |

---

## Context Efficiency Protocol

### Rapport Journalier — Format Compact

Chaque rapport (`team-reports/YYYY-MM-DD.md`) DOIT commencer par un **Executive Summary** (max 60 lignes).

```markdown
# YYYY-MM-DD — Executive Summary

> **N runs | Score moyen: N/100 | Tests: N→N (+N) | Coverage: N%→N%**

| Run | Mode | Score | Commit | Delta cle |

### Decisions cles
[max 5 bullet points]

### Recommandations actives
| ID | Recommandation | Depuis | Sprints | Statut |

### Quality Ratchet
| Metrique | Debut | Fin | Delta |

### Prochaine etape
[1 phrase]

---
<!-- DETAIL REFERENCE ci-dessous — archive consultable -->
```

### Regles de Contexte
1. Le summary est autonome (90% de l'info)
2. Max 60 lignes pour le summary
3. Detail = reference sous `<!-- DETAIL REFERENCE -->`
4. KB JSON = source de verite permanente
5. Conversation fraiche par run — KB + MEMORY.md + CLAUDE.md suffisent
6. Pas de duplication KB ↔ rapport
7. Compaction J-1 — seul le summary fait foi

### Smart Context Loading (au demarrage)
```
1. KB JSON (source de verite)           — team-knowledge/*.json
2. Recommandations actives              — du summary du dernier rapport
3. Dernier commit log (5 derniers)      — git log --oneline -5
4. Pre-flight baseline                  — execute en live
```

---

## Institutional Learning

### Regles Codifiees (IL-N)

| ID | Regle | Application |
|----|-------|-------------|
| IL-1 | Post-rewrite diff check | Tout agent qui reecrit un fichier entier |
| IL-2 | Spec-first pour features > 8h | Phase Design pour features > 8h |
| IL-3 | Integration-first apres ceiling | Phase Test quand coverage unit stagne |
| IL-4 | Typecheck = gate pre-test | Verification Pipeline: TYPE avant TEST |
| IL-5 | Edition chirurgicale > reecriture | Tout agent dev |
| IL-6 | Discovery croisee code-vs-config | Chore infra/config |
| IL-7 | Feature existence check — Avant de planifier, verifier que la feature/le composant n'existe pas deja dans le code. Eviter le double travail. | Phase 1 ANALYSE |
| IL-8 | KB FINALIZE mandatory — A chaque fin de run, les 7 fichiers KB DOIVENT etre mis a jour. Pas de shortcut. | FINALIZE |

### Mecanisme d'ajout
1. Sentinelle detecte pattern (2+ occurrences)
2. Propose regle IL-N (amendement MINOR)
3. Ajoutee a cette table + `prompt-enrichments.json`
4. Monitoring 2 runs. Si probleme → auto-revert.

### Prompt Enrichments

Stockees dans `team-knowledge/prompt-enrichments.json`. Le Tech Lead injecte les enrichissements pertinents dans les mandats.

Format :
```json
{
  "id": "PE-XXX",
  "rule": "description de la regle",
  "source": "evidence d'origine",
  "inject_when": "condition d'injection",
  "severity": "HIGH|CRITICAL|MEDIUM"
}
```

---

## Auto-Amendement du Process

### Types

| Type | Scope | Approbation |
| ---- | ----- | ----------- |
| MINOR | Instruction agent, ajout check | Applique + monitore 2 runs |
| MAJOR | Flow, phase, gate | Approbation utilisateur |
| CRITICAL | Quality gates, regles absolues | Approbation utilisateur + justification |

### Garde-fous
- Un seul amendement MINOR par run
- Jamais de modification quality gates sans utilisateur
- Auto-revert automatique si 2 runs suivants moins bons
- Amendement tracable (git diff, raison documentee)

---

## Niveaux d'Autonomie

| Niveau | Nom | Comportement | Condition d'acces |
| ------ | --- | ------------ | ----------------- |
| **L1** | Supervise | Validation utilisateur a chaque Plan | Defaut |
| **L2** | Semi-autonome | Autonome sur `bug`, `chore`, `hotfix` | 5 runs >= 85/100, 0 FAIL post-DEV |
| **L3** | Autonome | Autonome sauf features DB/securite | 10 runs >= 85/100, 0 regression Ratchet |
| **L4** | Pleine autonomie | Autonome sur tout | Validation explicite utilisateur |

### Descente automatique
- Score < 75/100 → retour L1
- Quality Ratchet viole → retour L1
- 3+ boucles correctives → descente d'un niveau
- Utilisateur dit "je veux valider" → retour au niveau demande

---

## Detection Proactive

| Signal | Seuil | Action |
| ------ | ----- | ------ |
| Coverage baisse 3 runs | -2pp cumules | Proposer run refactor coverage |
| `as any` hausse 2 runs | +10 cumulees | Proposer run refactor types |
| Score moyen < 80 sur 3 runs | — | Alerter + audit process |
| Agent < 6/10 sur 3 runs | — | Amender ou remplacer |
| Recommandation ignoree 3+ sprints | — | Escalade bloquante |
| Estimation hors cible | < 60% sur 5 runs | Recalibrer S/M/L |
| Boucles correctives = 0 sur 20+ runs | 20 runs consecutifs | Audit process obligatoire — verifier gate leniency, executer meta-test MT-003 |

---

## Escalade des Recommandations

| Sprints ignores | Action Sentinelle |
| --------------- | ----------------- |
| 1 sprint | Rappel — reconduite avec WARN |
| 2 sprints | **Escalade** — OBLIGATOIRE, FAIL si non appliquee |
| 3+ sprints | **Bloqueur permanent** — FAIL systematique |

---

## KB Rules

- Format JSON obligatoire — structuree, append-only, requetable
- Mise a jour a chaque fin de run via FINALIZE
- Donnees factuelles — pas d'opinions
- Retention : 20 derniers runs. Au-dela, agreger en moyennes
- Source de verite permanente — survit aux conversations

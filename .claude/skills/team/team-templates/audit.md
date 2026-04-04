# Template: Audit

Mode d'audit structurel du projet. Aucune modification de code — lecture seule + rapport.

---

## TASK GRAPH

```
T1: SCAN          (blockedBy: rien)     ← 4 agents en parallele
T2: CONSOLIDATE   (blockedBy: T1)       ← merge + cross-validate
T3: REPORT        (blockedBy: T2)       ← rapport structure
```

## PHASES ACTIVES

| Phase | Type | Description |
|-------|------|-------------|
| SCAN | PARALLEL | 4 agents specialises scannent le projet |
| CONSOLIDATE | SEQUENTIAL | Fusion des findings, cross-validation, dedup |
| REPORT | SEQUENTIAL | Redaction du rapport structure |

**Phases inactives :** DESIGN, DEV, SHIP — aucune modification de code.

---

## PHASE 1 — SCAN (parallele)

### Agents

| Agent | Role | Scope |
|-------|------|-------|
| `repo-scanner` | Structure du repo, deps, config, CI/CD | package.json, tsconfig, docker, .github/ |
| `code-quality` | Lint, typecheck, code smells, complexite | src/, ESLint, tsc --noEmit |
| `feature-verify` | Verification fonctionnelle, routes, coverage | tests/, routes, OpenAPI spec |
| `cleanup` | Fichiers morts, deps inutilisees, TODO stales | Tout le repo |

### Mandat commun

```
MODE: AUDIT (lecture seule)
Tu ne DOIS PAS modifier de fichiers.
Tu DOIS retourner tes findings dans un format structure:

{
  "agent": "<ton-role>",
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "<categorie>",
      "file": "<chemin>",
      "line": <numero|null>,
      "description": "<description precise>",
      "recommendation": "<action suggeree>"
    }
  ],
  "summary": "<resume en 2-3 phrases>",
  "score": <1-10>
}
```

### Mandats specifiques

**repo-scanner :**
```
Analyse la structure du repo:
- Coherence des deps (versions, duplicats, deps inutilisees)
- Configuration (tsconfig, eslint, jest, docker)
- CI/CD (workflows, secrets references, coverage gates)
- Documentation (README, CLAUDE.md, docs/)
- Git hygiene (branches stales, .gitignore)
```

**code-quality :**
```
Analyse la qualite du code:
- Resultats tsc --noEmit (0 erreurs attendu)
- ESLint warnings/errors restants
- Complexite cyclomatique (fonctions > 10)
- Fichiers trop longs (> 300 lignes)
- eslint-disable non justifies (cf. allowlist CLAUDE.md)
- Patterns anti-DRY, code duplique
```

**feature-verify :**
```
Verifie les fonctionnalites:
- Toutes les routes declarees ont des tests
- Couverture de tests (unit + integration + e2e)
- Contrat OpenAPI a jour vs implementation
- Factories de test utilisees partout (pas d'inline)
- Pas de tests skipped sans raison
```

**cleanup :**
```
Identifie le code mort:
- Exports non importes
- Fichiers non references
- Variables/fonctions non utilisees
- Deps package.json non importees dans le code
- TODO/FIXME/HACK stales (> 30 jours)
- Fichiers temporaires ou de debug
```

---

## PHASE 2 — CONSOLIDATE

Le Tech Lead (pas un agent) consolide les resultats:

```
1. Collecter les 4 rapports agents
2. Cross-valider: un finding mentionne par 2+ agents = severity +1
3. Dedupliquer les findings identiques
4. Calculer le score global: moyenne ponderee des 4 scores agents
   - critical finding: -2 points
   - high finding: -1 point
   - medium finding: -0.5 points
5. Categoriser par axe:
   - Structure & Config
   - Code Quality
   - Test Coverage
   - Technical Debt
   - Security (si findings)
```

---

## PHASE 3 — REPORT

Ecrire le rapport dans `team-reports/YYYY-MM-DD.md` :

```markdown
# Audit Report — YYYY-MM-DD

## Executive Summary
Score global: X/10
Findings: N critical, N high, N medium, N low, N info

## Axes

### Structure & Config (X/10)
[findings...]

### Code Quality (X/10)
[findings...]

### Test Coverage (X/10)
[findings...]

### Technical Debt (X/10)
[findings...]

### Security (X/10)
[findings si applicable...]

## Top 5 Actions Prioritaires
1. [action + severity + effort estime]
2. ...

## Detail des Findings
[table complete triee par severity]
```

---

## QUALITY GATE

Le rapport est valide si:
- Tous les 4 agents ont rendu leurs findings
- Chaque axe defini dans le mandat est couvert dans le rapport
- Le score global est calcule et justifie
- Les actions prioritaires sont classees par impact/effort

**Pas de porte Sentinelle sur la phase SHIP** — un audit ne livre pas de code.

---

## DoD (Definition of Done)

- [ ] 4 agents SCAN ont complete
- [ ] Findings consolides et cross-valides
- [ ] Rapport ecrit dans team-reports/
- [ ] Score global calcule
- [ ] Top 5 actions identifiees
- [ ] team-knowledge/ mis a jour (velocity-metrics, agent-performance)

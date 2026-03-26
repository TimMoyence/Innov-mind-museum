# Process Auditor Report — R10 — Amelioration Team

> **Date**: 2026-03-25 | **Mode**: chore (process audit) | **Scope**: SKILL.md + 9 agents + KB | **Score maturite process**: 3.8/5

---

## PARTIE 1 — Analyse du SKILL actuel

### 1.1 Ce qui fonctionne bien (observe R1-R9)

| Force | Evidence |
|-------|----------|
| **Cycle iteratif Sentinelle** | 6 runs consecutifs PASS, 0 boucles correctives, first-pass rate 100% |
| **Mandats formels agents** | Tous les agents recoivent un mandat structure avec KB injection. Score moyen agents 9.3/10 |
| **Verification Pipeline** | tsc --noEmit + tests comme gates non-negociables. 0 regression typecheck introduite |
| **Quality Ratchet** | as any 64 -> 0 maintenu sur 4 runs. Tests count jamais baisse |
| **Waves paralleles** | R3 (4 agents 3 waves), R5-R6 (2 agents par run) — efficaces, 0 conflit |
| **Niveaux d'autonomie** | L1 -> L2 promotion meritee (5/5 runs >= 85). Mecanisme clair |
| **Context Efficiency** | Executive Summary + KB JSON. Chaque run demarre proprement |
| **Agent Mandate Pattern** | Discovery Protocol fonctionne — F1 (auth types) detecte par Sentinelle en spot-check |
| **Error Patterns lifecycle** | EP-001 -> EP-012, fix appliques et verifies. Escalade EP-007 (3 runs) |
| **Prompt Enrichments** | PE-001 a PE-007 actifs. PE-001 et PE-004 valides en R4 |

### 1.2 Ce qui ne fonctionne pas bien (patterns observes R4-R9)

| Faiblesse | Evidence | Impact |
|-----------|----------|--------|
| **KB non mise a jour R7-R9** | velocity-metrics.json ne contient que R1-R6. R7, R8, R9 absents | Perte de tracabilite. Tendances faussees |
| **FINALIZE saute** | R7-R9 n'ont pas de trace KB. Pas de FINALIZE formel | Le mecanisme d'apprentissage est casse |
| **Sprint tracking non mis a jour** | PROGRESS_TRACKER et SPRINT_LOG pas mis a jour par les derniers runs | La DoD "feature" et "SHIP gate" exigent pourtant ca |
| **Estimation inexacte** | R9 a montre que 6/14 items etaient deja implementes — estimation du scope fausse | Travail inutile, confusion, mauvais signal |
| **Runs "aller vite" sans cycle complet** | Certains runs semblent sauter DESIGN ou REVIEW pour aller plus vite | Perte de la discipline iterative |
| **AM-001 monitoring incomplet** | process-amendments.json montre AM-001 "EN_OBSERVATION" avec monitoring R4+R5, mais status jamais mis a jour dans ce fichier (bien que estimation-accuracy.json dit CONFIRMED) | Inconsistance inter-fichiers KB |
| **estimation-accuracy.json incomplet** | Seulement R1-R5. R6 absent | Meme probleme que velocity-metrics |
| **Agents "Explore" non retires** | 4 agents "Explore (audit-*)" dans agent-performance.json avec 1 run chacun, non retires | Bruit dans la KB |

### 1.3 Ce qui manque

| Manque | Justification |
|--------|---------------|
| **Check "feature-exists?"** | R9 a montre que 6/14 items etaient deja implementes. Aucun mecanisme de verification pre-sprint |
| **Protocole de merge multi-agents** | Quand 2+ agents modifient le meme fichier dans la meme wave, pas de protocole formel au-dela de "le premier prend priorite" |
| **i18n completeness check** | Les i18n keys doivent etre dans TOUS les fichiers locales (8 langues). Pas de verification automatisee |
| **TanStack Query / cache pattern** | Le frontend n'a pas de pattern de cache. Pas mentionne dans le SKILL ni dans frontend-architect.md |
| **museum-web dans les agents** | Aucun agent n'a de contexte specifique a museum-web (Next.js 15). Le "Frontend Architect" est React Native only |
| **Diff inter-fichiers KB** | Pas de mecanisme pour detecter les inconsistances entre fichiers KB (ex: AM-001 status) |
| **Backlog formal** | Les findings R4 (37), les discoveries, les recommendations — tout est eparpille dans les rapports. Pas de backlog structure |

---

## PARTIE 2 — Analyse des agents

### 2.1 Clarte des instructions

| Agent | Clarte | Commentaire |
|-------|--------|-------------|
| **Backend Architect** | 9/10 | Instructions tres claires. Architecture hexagonale, conventions, composition root, tout est documente |
| **Frontend Architect** | 8/10 | Bon mais manque le contexte museum-web (Next.js 15). Ne couvre que React Native |
| **Code Reviewer** | 9/10 | Checklist exhaustive. Read-only. Clair |
| **QA Engineer** | 9/10 | Pyramide de tests, PE obligatoires, conventions mock — excellent |
| **API Contract Specialist** | 8/10 | Workflow clair. Manque le contexte des 20 routes manquantes (EP-011) |
| **DevOps Engineer** | 8/10 | Complet pour le deploy actuel. Manque le contexte museum-web (Dockerfile, nginx) |
| **Security Analyst** | 8/10 | OWASP aligne. Manque les findings R4 non resolus dans ses instructions |
| **Mobile UX Analyst** | 7/10 | Trop generique. Pas de patterns specifiques Musaium au-dela de la checklist |
| **Process Auditor (Sentinelle)** | 9/10 | Le plus detaille (19.7K). Protocoles INIT/FINALIZE clairs. KB maintenance bien definie |

### 2.2 Contexte codebase dans les agents

| Agent | Connait museum-backend | Connait museum-frontend | Connait museum-web |
|-------|:-----:|:-----:|:-----:|
| Backend Architect | OUI | NON | NON |
| Frontend Architect | NON | OUI | NON |
| Code Reviewer | OUI | OUI | NON |
| QA Engineer | OUI | PARTIEL | NON |
| API Contract Specialist | OUI | OUI | NON |
| DevOps Engineer | OUI | PARTIEL | NON |
| Security Analyst | OUI | NON | NON |
| Mobile UX Analyst | NON | OUI | NON |
| Sentinelle | OUI | OUI | NON |

**Constat** : **museum-web** (Next.js 15) est absent de tous les agents. Les R5-R6 ont fonctionne grace a des mandats ad hoc, mais les agents n'ont pas de connaissances institutionnelles sur museum-web.

### 2.3 Agents sous-utilises ou redondants

| Agent | Constat | Recommandation |
|-------|---------|----------------|
| **Mobile UX Analyst** | 0 run en tant qu'agent spawne formel (pas dans velocity-metrics) | Fusionne ou integre dans Frontend Architect pour l'instant. Reactive pour les reviews UX dediees |
| **Code Reviewer** | Spawne seulement quand le Tech Lead ne review pas lui-meme | Pertinent. Garder comme optionnel |
| **Explore (audit-*)** | 4 agents one-shot de R1. Plus jamais utilises | Retirer de la KB (deja couvert par les agents formels specialises) |

---

## PARTIE 3 — Amendements formels

### AM-002 — Feature Existence Check (MAJOR)

**Type**: MAJOR (modification du flow Phase 1 ANALYSE)
**Evidence**: R9 — 6/14 items deja implementes. Travail planifie sur du code existant.
**Risque de regression**: Faible. Ajoute un check, ne retire rien.

**Fichier**: `.claude/skills/team/SKILL.md`
**Section**: Phase 1 — ANALYSE, Actions

**Avant** (actions actuelles):
```
1. Executer le Pre-flight Check
2. Lire les fichiers impactes
3. Scanner le sprint context
4. Lire le dernier rapport Sentinelle
5. Si le scope est large -> spawner les agents specialises
6. Resumer
```

**Apres** (ajouter entre les etapes 2 et 3):
```
1. Executer le Pre-flight Check
2. Lire les fichiers impactes
3. **FEATURE EXISTENCE CHECK** — Pour chaque item du scope:
   a. Verifier si le code/la feature existe deja (grep, read des fichiers cibles)
   b. Si existant: marquer comme "DEJA IMPLEMENTE" et retirer du plan
   c. Si partiellement existant: identifier le delta exact (ce qui manque)
   d. Reporter: "N/M items deja implementes, scope reduit a [liste]"
4. Scanner le sprint context
5. Lire le dernier rapport Sentinelle
6. Si le scope est large -> spawner les agents specialises
7. Resumer (inclure le resultat du Feature Existence Check)
```

**Monitoring**: R11, R12

---

### AM-003 — KB FINALIZE Mandatory (MAJOR)

**Type**: MAJOR (modification d'un quality gate)
**Evidence**: R7-R9 n'ont pas de traces dans velocity-metrics.json. La KB est la source de verite permanente — sans FINALIZE elle perd sa valeur.
**Risque de regression**: Faible. Force le respect d'une regle existante.

**Fichier**: `.claude/skills/team/SKILL.md`
**Section**: REGLES ABSOLUES (en haut du document)

**Avant** (6 regles absolues):
```
1. NE JAMAIS avancer a la phase suivante sans validation Sentinelle
2. La Sentinelle est spawnee une seule fois en arriere-plan
3. Tu reviews aussi le travail des agents
4. Le deploy se fait en fin de feature
5. Excellence operationnelle — tous les agents opus
6. Si une boucle se repete 3 fois, escalader
```

**Apres** (ajouter regle 7):
```
7. **KB FINALIZE OBLIGATOIRE** — Chaque run DOIT se terminer par un FINALIZE qui met a jour
   les 7 fichiers KB (velocity-metrics, agent-performance, error-patterns, autonomy-state,
   estimation-accuracy, process-amendments, prompt-enrichments). Un run sans FINALIZE est
   un run incomplet. Si le run est interrompu, le Tech Lead fait un FINALIZE partiel.
```

**Fichier additionnel**: `.claude/agents/process-auditor.md`
**Section**: COMMENT TRAVAILLER > A la cloture (FINALIZE)

**Ajouter apres l'etape 6**:
```
7. **VALIDATION KB**: Verifier que les 7 fichiers KB ont ete mis a jour. Si un fichier
   n'est pas pertinent pour ce run (ex: pas d'amendement -> process-amendments.json
   ne change pas), documenter "N/A — no change" dans le rapport.
   Un FINALIZE incomplet est un FAIL de la Sentinelle.
```

**Monitoring**: R11, R12

---

### AM-004 — Sprint Tracking Gate (MAJOR)

**Type**: MAJOR (ajout d'un check dans SHIP gate)
**Evidence**: Plusieurs runs n'ont pas mis a jour PROGRESS_TRACKER ni SPRINT_LOG, malgre la DoD feature qui l'exige.
**Risque de regression**: Faible. Enforce une regle existante.

**Fichier**: `.claude/agents/process-auditor.md`
**Section**: EVALUATION PAR PORTE > Porte finale — SHIP

**Avant** (checklist automatisee actuelle):
```
- [ ] Typecheck backend PASS
- [ ] Typecheck frontend PASS
- [ ] Tests backend 0 fail
- [ ] Tests frontend 0 fail
- [ ] Build backend PASS
- [ ] Quality Ratchet respecte
- [ ] Sprint tracking mis a jour (PROGRESS_TRACKER + SPRINT_LOG)
- [ ] Rapport complet produit
```

**Apres** (rendre le sprint tracking verifiable):
```
- [ ] Typecheck backend PASS
- [ ] Typecheck frontend PASS
- [ ] Tests backend 0 fail
- [ ] Tests frontend 0 fail
- [ ] Build backend PASS
- [ ] Quality Ratchet respecte
- [ ] **Sprint tracking VERIFIED** — Sentinelle verifie via grep que les items du run
      sont coches dans PROGRESS_TRACKER.md ET qu'une entree SPRINT_LOG existe pour ce run.
      FAIL si absent. Commande de verification:
      ```bash
      grep -c "\[x\]" docs/V1_Sprint/PROGRESS_TRACKER.md  # doit augmenter
      grep "[date du run]" docs/V1_Sprint/SPRINT_LOG.md    # doit matcher
      ```
- [ ] Rapport complet produit (avec Executive Summary)
- [ ] **KB FINALIZE COMPLETE** — les 7 fichiers KB sont a jour
```

**Monitoring**: R11, R12

---

### AM-005 — Institutional Learning IL-7 et IL-8 (MINOR)

**Type**: MINOR (ajout de regles IL dans le SKILL)
**Evidence**: Patterns observes R7-R9. Feature existence check et KB FINALIZE sont des corrections permanentes.
**Risque de regression**: Aucun (ajout, pas de modification).

**Fichier**: `.claude/skills/team/SKILL.md`
**Section**: INSTITUTIONAL LEARNING > Regles codifiees

**Ajouter**:
```
| IL-7 | **Feature existence check** — Avant d'implementer un item, verifier si le code existe deja dans le codebase. Grep + read des fichiers cibles. | R9: 6/14 items deja implementes, travail inutile evite | Phase Analyse pour chaque item du plan |
| IL-8 | **KB FINALIZE mandatory** — La Sentinelle DOIT mettre a jour la KB meme si le run est rapide ou interrompu. Un FINALIZE partiel vaut mieux que pas de FINALIZE. | R7-R9: KB gaps (velocity-metrics, estimation-accuracy, agent-performance manquent R7-R9) | Fin de chaque run, sans exception |
```

**Application**: Immediate (MINOR). Monitore R11-R12.

---

### AM-006 — museum-web Context dans les agents (MINOR)

**Type**: MINOR (ajout de contexte dans les agents existants)
**Evidence**: R5-R6 ont cree un package museum-web (Next.js 15) mais aucun agent ne le connait.
**Risque de regression**: Aucun (ajout de connaissances).

**Fichiers**: 3 agents concernes

**1. `.claude/agents/frontend-architect.md`** — Ajouter section:
```
## museum-web (Next.js 15)

Le projet inclut aussi `museum-web/`, un site web public + admin en Next.js 15:
- App Router (file-based routing)
- i18n FR/EN via middleware + dictionnaires JSON
- Server Components par defaut, Client Components pour l'interactivite
- Standalone output (Docker-ready)
- Path alias: `@/` -> `./`
- Shared auth via refresh token interceptor porte de museum-admin
```

**2. `.claude/agents/devops-engineer.md`** — Ajouter sous Docker:
```
### museum-web
- Dockerfile multi-stage: `museum-web/deploy/Dockerfile.prod`
- CI: `.github/workflows/ci-web.yml` (lint + typecheck + build)
- Deploy: `.github/workflows/deploy-web.yml` (Docker + GHCR + VPS)
- Nginx: `/` -> museum-web, `/api/` -> backend
```

**3. `.claude/agents/code-reviewer.md`** — Ajouter dans Architecture Attendue:
```
### museum-web — Next.js 15 App Router
- Server Components par defaut
- Client Components extraites dans fichiers separes
- i18n via `[locale]/` layout segment + dictionnaires JSON
- Admin pages sous `/[locale]/admin/`
```

**Application**: Immediate (MINOR). Monitore R11-R12.

---

### AM-007 — Retire Explore Agents from KB (MINOR)

**Type**: MINOR (cleanup KB)
**Evidence**: 4 agents "Explore (audit-*)" dans agent-performance.json avec 1 run chacun, jamais reutilises. Leurs rôles sont couverts par les agents specialises (Backend Architect, QA Engineer, DevOps Engineer, Security Analyst).
**Risque de regression**: Aucun.

**Fichier**: `.claude/team-knowledge/agent-performance.json`
**Action**: Marquer les 4 agents Explore comme `retired: true` avec raison "Superseded by dedicated specialist agents in R4+".

---

### AM-008 — process-amendments.json Sync (MINOR)

**Type**: MINOR (correction d'inconsistance KB)
**Evidence**: AM-001 est marque "EN_OBSERVATION" dans process-amendments.json mais "CONFIRMED" dans estimation-accuracy.json.
**Risque de regression**: Aucun.

**Fichier**: `.claude/team-knowledge/process-amendments.json`
**Action**: Mettre a jour AM-001 status de "EN_OBSERVATION" a "CONFIRMED" avec les resultats R4 (N/A) et R5 (ratio 1.3x confirme).

---

## PARTIE 4 — Prompt Enrichments a ajouter

### PE-008 — Feature Existence Check

```json
{
  "id": "PE-008",
  "rule": "Avant d'implementer un item feature/refactor, verifier si le code/la feature existe deja dans le codebase (grep + read). Si existant, retirer du scope.",
  "source": "R9: 6/14 items deja implementes, travail inutile planifie",
  "inject_when": "Tech Lead prepare le plan d'un run feature ou refactor",
  "severity": "HIGH"
}
```

### PE-009 — i18n Completeness

```json
{
  "id": "PE-009",
  "rule": "Les cles i18n doivent etre presentes dans TOUS les fichiers de locale (8 langues pour museum-frontend, 2 pour museum-web). Apres ajout d'une cle, verifier tous les fichiers locales.",
  "source": "R5-R6: cles ajoutees en EN/FR mais pas verifiees dans les autres langues",
  "inject_when": "agent ajoute ou modifie des cles de traduction",
  "severity": "MEDIUM"
}
```

### PE-010 — KB FINALIZE Non-Optional

```json
{
  "id": "PE-010",
  "rule": "Le FINALIZE KB est OBLIGATOIRE a chaque fin de run. Mettre a jour les 7 fichiers team-knowledge/*.json. Un run sans FINALIZE est un run incomplet.",
  "source": "R7-R9: KB gaps — velocity-metrics, estimation-accuracy, agent-performance manquent 3 runs",
  "inject_when": "Sentinelle recoit le message FINALIZE",
  "severity": "CRITICAL"
}
```

### PE-011 — museum-web Server Components First

```json
{
  "id": "PE-011",
  "rule": "Dans museum-web (Next.js 15), les composants sont Server Components par defaut. N'ajouter 'use client' que pour l'interactivite (useState, useEffect, onClick). Extraire les parties client dans des fichiers separes.",
  "source": "R5-R6: pattern etabli — LoginForm client extrait de page.tsx server",
  "inject_when": "agent cree ou modifie des fichiers dans museum-web/",
  "severity": "MEDIUM"
}
```

---

## PARTIE 5 — Score de maturite du process

### Evaluation par dimension (1-5)

| Dimension | Score | Justification |
|-----------|:-----:|---------------|
| **Cycle iteratif** | 4.5/5 | Fonctionne. 6 runs PASS, 0 boucles. Flow clair. |
| **Quality gates** | 4/5 | Non-negociables respectes. Typecheck + tests = gates effectives. Manque: sprint tracking non enforce |
| **Knowledge base** | 3/5 | Structure excellente (7 fichiers JSON). Contenu incomplet (3 runs manquants). Inconsistances inter-fichiers |
| **Agent definitions** | 3.5/5 | Claires mais manquent le contexte museum-web. Certains agents sous-utilises (Mobile UX Analyst) |
| **Institutional learning** | 4/5 | IL-1 a IL-6 actifs et utiles. PE-001 a PE-007 actifs. Manque: le mecanisme d'ajout n'est pas toujours suivi |
| **Autonomie** | 4/5 | L2 atteint meritairement. Conditions L3 claires. Mecanisme de confiance bien concu |
| **Estimation** | 3/5 | AM-001 (1.3x factor) confirme. Mais l'estimation du SCOPE (quoi faire) est pire que l'estimation de l'EFFORT (combien de fichiers) |
| **Context efficiency** | 4/5 | Executive Summary + KB JSON = bon modele. Mais les runs sans FINALIZE cassent le modele |
| **Detection proactive** | 3.5/5 | EP escalade (EP-007 a 3 runs) fonctionne. Alertes proactives definies mais pas toujours executees |
| **Process improvement** | 3.5/5 | Auto-amendement defini formellement. Mais AM-001 est le seul amendement en 9 runs. Le process est stable mais n'evolue pas assez |

### Score global: 3.8/5

Le process est **fonctionnel et fiable** pour les runs individuels (scores 88-97). Sa faiblesse principale est le **suivi inter-runs** : KB incomplete, sprint tracking non enforce, estimation de scope (pas juste d'effort) non verifiee. Le mecanisme d'apprentissage institutionnel existe mais n'est pas systematiquement applique.

---

## PARTIE 6 — Recommandations pour demain (2026-03-26)

### Priorite 1 — Rattrapage KB

Avant tout nouveau run, combler les trous dans la KB :
- Ajouter R7, R8, R9 dans `velocity-metrics.json` (meme retro-activement)
- Ajouter R6 dans `estimation-accuracy.json`
- Sync AM-001 dans `process-amendments.json`
- Retirer les agents Explore de la KB

### Priorite 2 — Appliquer les amendements MAJOR

Soumettre AM-002 (Feature Existence Check), AM-003 (KB FINALIZE Mandatory), AM-004 (Sprint Tracking Gate) a validation utilisateur et les integrer dans le SKILL.

### Priorite 3 — Mettre a jour les agents pour museum-web

Appliquer AM-006 pour que les agents connaissent museum-web.

### Priorite 4 — Premier run avec les nouveaux gardes-fous

Lancer un run feature (W3 museum-web) en appliquant les nouveaux checks :
1. Feature Existence Check dans ANALYSE
2. FINALIZE obligatoire
3. Sprint tracking verifie dans SHIP

Cela validera ou invalidera les amendements.

### Priorite 5 — Sprint tracking catchup

Mettre a jour PROGRESS_TRACKER et SPRINT_LOG avec les items de R4-R9 avant de continuer.

---

## Resume des livrables

| # | Livrable | Status |
|---|----------|--------|
| 1 | Rapport d'analyse SKILL (forces/faiblesses/manques) | FAIT (Parties 1-2) |
| 2 | 7 amendements formels (AM-002 a AM-008) | FAIT (Partie 3) |
| 3 | 4 nouveaux PE (PE-008 a PE-011) | FAIT (Partie 4) |
| 4 | Score maturite process: 3.8/5 | FAIT (Partie 5) |
| 5 | Recommandations pour 2026-03-26 | FAIT (Partie 6) |

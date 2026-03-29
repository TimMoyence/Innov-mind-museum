# Agent Mandate Pattern

## Template de Mandat Formel

**Chaque agent spawne** recoit un mandat formel. Un agent sans mandat = agent non fiable.

```
## Mandat Agent — [Nom]

### Scope
[Exactement ce que l'agent doit faire — pas plus, pas moins]

### Livrables attendus
[Liste precise de ce que l'agent doit produire]

### Contraintes
- Respecter le plan valide (pas de scope creep)
- tsc --noEmit doit passer sur chaque fichier modifie
- Les tests existants ne doivent pas casser
- [Recommandations Sentinelle actives a respecter]

### SCOPE BOUNDARY (whitelist obligatoire)

L'agent est autorise a modifier UNIQUEMENT les fichiers listes ci-dessous. Tout fichier hors-liste = STOP + Discovery.

**Fichiers autorises** :
[Tech Lead renseigne la liste ici au moment du mandat]

**Modules en scope** :
[Tech Lead renseigne ici]

> Si tu veux modifier un fichier non liste : STOP, signale-le comme Discovery. Le Tech Lead decidera.

### YOUR TRACK RECORD (auto-peuple par le Tech Lead)

Le Tech Lead injecte ici tes metriques depuis `agent-performance.json`:

- **Score moyen** : [X.X/10 sur N runs]
- **ROI** : [X.X/5.0]
- **Faiblesses passees** :
  [Liste des weaknessHistory entries — ex: "R11: scope creep (FlashList outside mandate)"]
- **Points forts** :
  [Liste des strengths]

> Tu DOIS porter une attention particuliere a tes faiblesses passees. Si une faiblesse est "scope creep", verifie DOUBLEMENT ta whitelist avant chaque Edit.

### Patterns connus (injection KB automatique)
[Auto-filtres depuis error-patterns.json et prompt-enrichments.json par le Tech Lead]
- [EP-XXX] [pattern] → fix: [fix connu]
- [PE-XXX] [regle apprise] → respecter obligatoirement

### Community Skills (injectes par le Tech Lead selon scope)
Le Tech Lead selectionne les skills communautaires pertinents (cf. context-loading.json > community_skills) :
- [skill-name] : [quand l'utiliser dans ce mandat]

### Criteres de viabilite
AVANT de coder, verifier que ta solution repond a :
- [ ] [criteres adaptes au scope — cf. section Viabilite ci-dessous]

### Criteres de succes
[Comment le Tech Lead verifiera que le travail est conforme]

### Hors scope
[Ce que l'agent ne doit PAS faire — items specifiques au mandat]

**Restrictions operationnelles universelles** (toujours incluses) :
- NE PAS executer git add/commit/push
- NE PAS ecrire dans .claude/team-knowledge/*.json
- NE PAS ecrire dans .claude/team-reports/*.md
- NE PAS mettre a jour docs/V1_Sprint/
- NE PAS executer le protocole FINALIZE
- Ces actions sont reservees au Tech Lead et a la Sentinelle
```

**Le Tech Lead DOIT** remplir `Patterns connus` en consultant `error-patterns.json` et `prompt-enrichments.json` AVANT de spawner l'agent.

---

## Criteres de Viabilite

Chaque mandat DOIT inclure une section viabilite que l'agent verifie AVANT de coder :

```
### Criteres de viabilite
AVANT de coder, verifier que ta solution repond a :
- [ ] Les donnees survivent-elles a un changement de vue/ecran/navigation ?
- [ ] Les etats sont-ils persistes correctement (pas juste en memoire locale) ?
- [ ] Un utilisateur qui ferme et rouvre l'app retrouve-t-il son travail ?
- [ ] Le comportement est-il coherent pour un utilisateur reel ?
- [ ] Les edge cases utilisateur (offline, timeout, permissions refusees) sont-ils geres ?
```

**Pourquoi** : Les agents codent ce qu'on demande mais ne pensent pas "produit". Les criteres forcent la reflexion utilisateur avant l'implementation.

---

## Agents Disponibles

Tous les agents utilisent **model: opus**.

| Agent                  | Role                                                    | Fichier                                     | Quand spawner                                              |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Backend Architect      | Architecture hexagonale, TypeORM, Express 5, LangChain  | `agents/backend-architect.md`               | Changement architecture backend, nouveau module/endpoint   |
| Frontend Architect     | React Native 0.79, Expo 53, Expo Router, feature-driven | `agents/frontend-architect.md`              | Changement architecture frontend, nouveau composant        |
| Mobile UX Analyst      | Patterns RN, accessibilite, perf mobile, UX tactile     | `agents/mobile-ux-analyst.md`               | Feature UI, mockup, review UX                              |
| API Contract Specialist| OpenAPI spec, contract-first, type generation            | `agents/api-contract-specialist.md`         | Nouveau/modifie endpoint, drift spec/types                 |
| QA Engineer            | Jest, Node test runner, contract tests, e2e              | `agents/qa-engineer.md`                     | Tests a ecrire, coverage a verifier                        |
| DevOps Engineer        | Docker, GitHub Actions, EAS Build, migrations, deploy    | `agents/devops-engineer.md`                 | CI/CD, Docker, migration, deploy                           |
| Security Analyst       | Auth, guardrails LLM, sanitization, OWASP                | `agents/security-analyst.md`                | Auth, LLM pipeline, input validation, OWASP                |
| Code Reviewer          | Conventions, hexagonal compliance, naming                | `agents/code-reviewer.md`                   | Review de code apres implementation                        |
| Product Owner          | Requirements, user stories, AC, prioritisation           | `agents/product-owner.md`                   | Features complexes, analyse produit                        |
| SEO Specialist         | Next.js 15, CWV, structured data, Server Components     | `agents/seo-specialist.md`                  | Fichiers museum-web/ dans le scope                         |
| Sentinelle             | CTO virtuel, verdicts bloquants, amelioration continue   | `agents/process-auditor.md`                 | TOUJOURS — background, du debut a la fin                   |

---

## Intelligence d'Allocation

| Situation | Bonne pratique | Mauvaise pratique |
| --------- | -------------- | ----------------- |
| Bug simple 1 fichier | Tech Lead corrige directement | Spawner Backend Architect + QA |
| Feature full-stack complexe | Backend + Frontend en parallele | Un seul agent pour tout |
| Review petit fix | Tech Lead review seul | Spawner Code Reviewer + Security |
| Nouveau endpoint API | Backend Architect + API Contract | Backend seul (oubli contrat) |
| Refactor architecture | Backend Architect puis Code Reviewer | Les deux en parallele |
| Feature museum-web | Frontend Architect + SEO Specialist | Frontend seul (oubli SEO) |
| Feature chat/LLM | Backend Architect + langchain-skills | Backend seul (oubli patterns LLM) |
| Audit securite complet | Security + ToB (semgrep/codeql) + pentest + compliance | Security seul (oubli SAST) |
| Feature museum-web E2E | Frontend + QA + browser-use | Frontend seul (pas de smoke test) |
| Nouvelle dependance npm | DevOps + supply-chain-auditor | DevOps seul (oubli audit deps) |
| Requirements complexes | Product Owner en ANALYSE | Deviner les requirements |

---

## Waves Paralleles

Quand taches independantes → execution en waves paralleles via Agent Teams.

**Conditions de parallelisme** :
- Aucun fichier en commun
- Modules differents
- Pas de dependance fonctionnelle

**Limite** : max 3 waves paralleles.

**Gestion conflits inter-waves** :
1. Premiere wave mergee prend priorite
2. Deuxieme wave re-execute Verification Pipeline
3. Si conflit → protocole standard (cf. `conflict-resolution.md`)

# Protocole de Conflit

Quand deux parties sont en desaccord (agent vs agent, Sentinelle vs Tech Lead, recommandation vs demande utilisateur).

## Etape 1 — Resolution par l'Evidence

Tenter de resoudre objectivement :

| Critere objectif | Gagnant |
| ---------------- | ------- |
| Le code compile, l'autre non | Celui qui compile |
| Une approche passe les tests, l'autre non | Celle qui passe |
| Une approche respecte la spec OpenAPI | Celle qui respecte |
| Une approche a un meilleur score Quality Ratchet | Celle avec le meilleur score |

Si l'evidence tranche → conflit resolu. Pas d'arbitrage.

## Etape 2 — Cross-validation (3 agents)

Si l'evidence ne tranche pas (decision subjective, choix architecture, compromis qualite/complexite) :

1. **Spawner 3 agents independants** :
   - 1 agent du meme domaine (ex: Backend Architect)
   - 1 agent adjacent (ex: Code Reviewer ou Security Analyst)
   - 1 agent perspective produit/QA (ex: QA Engineer ou Product Owner)

2. Chaque agent recoit :
   - Contexte du conflit
   - Les deux positions
   - Evidence disponible
   - Instruction : verdict argumente (A / B / C alternative)

3. Deliberation **independante** (pas en parallele pour eviter le biais).

## Etape 3 — Synthese Sentinelle

La Sentinelle recoit les 3 verdicts :

- **Unanimite (3-0)** → verdict applique
- **Majorite (2-1)** → majoritaire applique, minorite notee
- **Pas de majorite (3 differents)** → escalade utilisateur

## Etape 4 — Escalade Utilisateur

```
## Conflit non resolu — Escalade

### Sujet
[description du conflit]

### Position A (agent X)
[argument + evidence]

### Position B (agent Y)
[argument + evidence]

### Verdicts cross-validation
- Agent 1: [verdict + raison]
- Agent 2: [verdict + raison]
- Agent 3: [verdict + raison]

### Synthese Sentinelle
[analyse + recommandation]

Quelle direction prends-tu ? (A / B / autre)
```

## Cas Speciaux

### Sentinelle vs Tech Lead
- Sentinelle doit fournir evidence verifiable (code erreur, fichier:ligne, metrique)
- Evidence fausse → Tech Lead override, score Sentinelle baisse
- Evidence correcte → verdict Sentinelle tient
- Doute → cross-validation

### Recommandation vs Demande Utilisateur
- L'utilisateur a **toujours** le dernier mot
- Sentinelle note la deviation et tracke les consequences
- Si deviation cause probleme futur → Sentinelle peut le signaler comme evidence

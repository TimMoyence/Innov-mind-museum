# Conflict Resolution — Protocole de resolution

Quand le Tech Lead et un agent (ou l'utilisateur et un agent) ont des conclusions contradictoires.
Charge **Toujours** (mode unique UFR-022).

> Les collisions d'edition agent-vs-agent sont structurellement impossibles : sous REGLE 12 tous les writes sont serialises (parallelisme read-only uniquement, max 5 agents). Ce protocole ne couvre donc que les disputes humain/Tech-Lead vs agent + les overrules de gate.

---

## PROCEDURE

```
1. EVIDENCE — Chaque partie presente ses preuves (code, tests, metriques)
2. CROSS-VALIDATION — Le Tech Lead fait sa propre verification independante
3. SYNTHESE — Determiner quelle approche est correcte basee sur les faits
4. ESCALADE — Si impossible de trancher → demander a l'utilisateur
```

## CAS COURANTS

### Agent (Green) pense qu'un test est faux
Frozen-test (REGLE 16) : l'agent NE touche PAS le test. Il emet `BLOCK-TEST-WRONG <file>:<line> <reason>` → re-spawn fresh phase Red avec le finding.

### Agent en desaccord avec le plan / la review
Pas de plan-tweak ad-hoc ni de re-execution in-context. La review route via la **reviewer rejection loop ILLIMITEE** (REGLE 14) : `CHANGES_REQUESTED` → re-spawn fresh la phase pointee (spec/plan/red/green). Zero cap, zero warning. Si le reviewer rejette N fois c'est qu'il y a raison.

### Gate verifier/reviewer FAIL conteste par le Tech Lead
```
1. Le Tech Lead doit fournir une justification ecrite
2. La justification est loguee dans le rapport de run
3. Le run peut continuer avec un WARN (pas PASS)
4. L'overrule est enregistre dans velocity-metrics pour suivi
```

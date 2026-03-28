# Meta-Tests du Process

## Meta-Tests Protocol

### MT-001 — Anti-Hallucination Verification
**Status**: PENDING
**Design**: Envoyer FIN DE RUN avec metriques manquantes. Verifier que Sentinelle ecrit "N/A" au lieu de fabriquer.
**Success criteria**: 0 valeurs fabriquees dans le message Sentinelle.

### MT-002 — Scope Boundary Enforcement
**Status**: PENDING
**Design**: Introduire deliberement 1 fichier hors-scope dans le prochain run DEV. Verifier que Sentinelle detecte SCOPE_BOUNDARY_VIOLATION.
**Success criteria**: Sentinelle FAIL au Gate 3 avec le bon code erreur.

### MT-003 — Gate Leniency Calibration
**Status**: PENDING
**Design**: Introduire 1 defaut mineur (test sans assertion, ou `as any` dans test) dans 3 prochains runs. Tracker detection rate.
**Success criteria**: Detection rate > 80% (detecte dans 2+ des 3 runs).

# Template: Micro

Pipeline leger pour les taches simples (bug evident, chore, hotfix, mockup).

**Criteres :** ≤5 fichiers, ≤200 lignes, single-scope.
**Contexte :** ~250 lignes chargees.

---

## TASK GRAPH

```
T1: COMPRENDRE     (blockedBy: rien)
T2: DEVELOPPER      (blockedBy: T1)
T3: LIVRER          (blockedBy: T2)
```

## PHASES

### Phase 1 — COMPRENDRE

```
1. Lire les fichiers concernes (max 5)
2. Comprendre le probleme / la demande
3. Si le scope depasse 5 fichiers ou 200 lignes → AUTO-ESCALADE vers standard
   - Message: "Scope depasse micro (N fichiers / N lignes). Escalade vers standard."
   - Recharger: quality-gates.md + agent-mandate.md + import-coherence.md + standard.md
```

### Phase 2 — DEVELOPPER

```
1. 1 seul agent DEV (pas de parallelisme)
2. Mandat minimal: objectif + fichiers autorises + contraintes techniques
3. Pas de PE/EP injection (micro = contexte minimal)
4. L'agent code, teste mentalement, rend son travail
```

**Gate post-DEV :**
```bash
# Backend (si scope backend)
cd museum-backend && pnpm lint 2>&1 | tail -5
cd museum-backend && pnpm test 2>&1 | tail -5

# Frontend (si scope frontend)
cd museum-frontend && npm run lint 2>&1 | tail -5
cd museum-frontend && npm test 2>&1 | tail -5
```

Si FAIL → 1 correction par le meme agent. Si 2e FAIL → escalade standard.

### Phase 3 — LIVRER

```
1. gitnexus_detect_changes({scope: "staged"}) → verifier que seuls les fichiers attendus sont modifies
2. Verifier quality-ratchet.json (pas de regression)
3. tsc final (backend et/ou frontend selon scope) — non-negociable
4. Tests final — 0 regression tolere
5. git add + commit
6. Pas de rapport Sentinelle (micro)
7. Pas de sprint tracking update (chore/hotfix)
8. Si bug/feature → noter dans velocity-metrics.json: {pipeline: "micro", duration, files, escalated: false}
```

## DoD

- [ ] gitnexus_detect_changes: scope verifie
- [ ] tsc PASS (backend et/ou frontend selon scope)
- [ ] Tests PASS — 0 regression (non-negociable)
- [ ] Quality Ratchet: pas de regression
- [ ] Code commite

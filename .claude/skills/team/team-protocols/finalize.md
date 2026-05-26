# Finalize — Protocole de cloture de run (Step 9)

Execute par le Tech Lead a la fin de chaque run, mode unique UFR-022.
Plus de tiers STANDARD/ENTERPRISE — un seul chemin de finalize pour tout run.

> Reference canonique : `SKILL.md` § "Step 9 — Finalize (Tech Lead)".
> Ce fichier resume la sequence ; consulter SKILL.md pour le detail complet (variables, fail-open contracts, KR cibles).

---

## Pure-doc skip fastpath (UFR-022)

Si `team-state/$RUN_ID/pure-doc-skip.marker` existe (Step 0 §8 a detecte une edit pure-doc) :
JUMP directement au §6 (git add), skip §1-§5. Le run est marque `mode: "pure-doc-skip"`, `status: "completed"`, et l'utilisateur commit normalement.

---

## Sequence (7 substeps, ordre imperatif)

```
1. Update KB
   - team-knowledge/velocity-metrics.json
   - team-knowledge/agent-performance.json
   - team-knowledge/error-patterns.json (si nouveau pattern)

2. Cost delta (T1.1 ROADMAP_TEAM — KR1)
     ACT=$(.claude/skills/team/lib/cost-aggregate.sh $RUN_ID)
     EST=$(cat .claude/skills/team/team-state/$RUN_ID/cost-estimate.json)
     .claude/skills/team/lib/cost-history.sh "$RUN_ID" "$MODE" "$PIPELINE" "$EST" "$ACT"
   - Append a team-state/cost-history.json.
   - Update state.json telemetry.{tokensTotalIn,tokensTotalOut,costUSD} depuis $ACT.
   - KR1 : |deltaPct| <= 30% sur 10 runs glissants.

3. Status flip — state.json `status: "completed"` + telemetry summary
   - **CRITICAL ORDERING** : le flip DOIT avoir lieu ICI, AVANT le lesson hook (§4),
     sinon le guard du hook (`state.json.status == "completed"`) est inatteignable.
     Reviewer cycle 2026-05-03 a bloque l'ordre inverse.

4. Lesson capture (T2.1 — KR4), fail-open
     RUN_ID=$RUN_ID .claude/skills/team/team-hooks/post-complete-lesson-capture.sh
   - Exit non-0 ne bloque JAMAIS le finalize (R10).
   - Skip silencieux si status != "completed" (R3) — toujours "completed" car §3 l'a deja flip.
   - Output : team-knowledge/lessons/<RUN_ID>.md.
   - state.json gates[] gagne un verdict `lesson-capture` (PASS | WARN).

5. Roadmap tick proposal (T1.6) — JAMAIS auto-commit, JAMAIS auto git add
     RUN_ID=$RUN_ID DESCRIPTION="$DESCRIPTION" MODE=$MODE \
         .claude/skills/team/team-hooks/post-cycle-roadmap-update.sh
   - Lit team-state/$RUN_ID/roadmap-context.json (produit par Step 0 §9).
   - MATCH      → affiche le patch (roadmap-tick.patch) + DEMANDE a l'user de l'appliquer.
   - AMBIGUOUS  → affiche top 5 candidats scores ; user pick ou skip.
   - NO_MATCH / SKIP / WARN → log only, pas de prompt.
   - Fail-open : non-bloquant, finalize continue.

6. Tech Lead git add + commit (jamais les agents) — inclut le fichier lesson ecrit au §4.

7. Optionnel : promote run → team-reports/ archive si milestone.
```

---

## Notes KB (detail conserve depuis le scoring pre-v13)

Ces fichiers KB du dossier `team-knowledge/` sont mis a jour par les hooks/Tech Lead ;
le scoring detaille n'est plus inline dans le finalize mais reste pilote par les hooks deterministes.

- `prompt-enrichments.json` — score PE (moyenne glissante sur 3 runs). Score < 2 sur 3+ runs → `reformulate` ; score 0 sur 5+ runs → `retired`.
- `agent-performance.json` — score qualite agent (compile 1er essai, tests sans correction, scope respecte, import coherence, decouvertes utiles), avgScore glissant, weaknessHistory.
- `estimation-accuracy.json` — calibration estimation vs reel (ratio fichiers/lignes/duration), avgRatio.
- `next-run.json` / `autonomy-state.json` — recommandations + niveau autonomie (cf. SKILL.md, hors sequence Step 9).

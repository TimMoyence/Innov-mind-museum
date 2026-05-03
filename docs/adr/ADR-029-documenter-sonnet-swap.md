# ADR-029 — Documenter agent swap to Sonnet 4.6

- **Status** : Accepted (2026-05-03)
- **Ticket** : ROADMAP_TEAM T1.3
- **Supersedes** : N/A
- **Amends** : UFR-010 (`feedback_all_agents_opus`)

## Context

UFR-010 (2026-04-19) imposait `model: opus` à TOUS les agents `/team`, en réaction au feedback utilisateur "operational excellence, pas économie de tokens". Cette règle a tenu pendant le hardening V12 ; à 2026-05-02, l'audit `cost-history.json` montre que :

- 5 agents (architect, editor, verifier, security, reviewer) consomment ~95% du budget tokens d'un run /team standard.
- Le 6e (documenter) ne fait que de la synthèse formatée : ADR template, STORY.md append, CHANGELOG bullets.
- Documenter ne décide PAS d'architecture (architect a déjà décidé) ni ne touche au code (editor seul écrit dans `src/`).
- Sonnet 4.6 fournit la qualité de prose nécessaire à ce type de tâche, à ~3× moins cher en input ($3/M vs $15/M Opus, pricing 2026-05).

## Decision

Documenter agent passe à `model: claude-sonnet-4-6`. UFR-010 est amendée avec un mécanisme `exceptions[]` listant explicitement le rôle `documenter` comme seule dérogation autorisée.

Tous les autres agents restent Opus :

| Agent | Modèle | Justification |
|---|---|---|
| architect | opus-4.7 | Raisonnement architectural complexe, EARS spec, design trade-offs |
| editor | opus-4.6 | Écriture de code production, hexagonal patterns, edge cases |
| verifier | opus-4.6 | Anti-hallucination, scope-boundary, DoD machine-verified |
| security | opus-4.6 | Threat modeling, taint analysis, OWASP coverage |
| reviewer | opus-4.7 | Fresh-context semantic review, 5-axis scoring |
| **documenter** | **claude-sonnet-4-6** | **Synthèse formatée, pas de raisonnement nouveau** |

## Consequences

**Positives** :
- Économie ~3× sur le budget tokens documenter (mineur en absolu, mais cumulatif sur ~50 runs/sprint).
- Latence plus faible sur la phase finalize (Sonnet ~2× plus rapide que Opus 4.6).
- Pattern d'exception explicite ouvre la voie à futures dérogations chirurgicales (refusées par défaut).

**Négatives / risques** :
- Possible régression qualité ADR / CHANGELOG sur cas-limites (multilingue, jargon métier).
- Schema state.json étendu (`sonnet-4.6` ajouté à enum) — minor breaking pour outils externes parsant le schema.
- Risque pédagogique : si la dérogation s'élargit sans contrôle, retour case départ "Opus only".

## Verification protocol (deferred — T1.3.R6)

Comparer 5 runs Documenter Sonnet vs 5 runs Documenter Opus sur les mêmes inputs :

1. Sélectionner 5 runs `/team` finalisés (mix mode = feature/bug/refactor) avec STORY.md complet.
2. Re-jouer la phase finalize avec Sonnet ET Opus en parallèle (model override flag).
3. Comparer 4 axes :
   - **Fidélité** : la doc reflète-t-elle ce que l'editor a fait ? (lecture diff vs STORY.md écrit)
   - **Concision** : ratio info-utile / longueur (CHANGELOG bullets denses vs verbeux)
   - **Format** : respect template ADR / STORY headings ?
   - **Couverture** : a-t-il oublié une décision majeure (ADR) ou un fichier (CHANGELOG) ?
4. Verdict :
   - Sonnet ≥ Opus sur 4 axes → confirmer (pas d'action).
   - Sonnet régresse sur ≥1 axe → revert agent à `opus` + retirer exception UFR-010.

User exécute manuellement (pas faisable in-session — nécessite plusieurs cycles /team complets espacés). Tracker via 3e checkbox T1.3 dans `docs/ROADMAP_TEAM.md`.

## Rollback

Single-step :
1. `.claude/agents/documenter.md` ligne 2 : `model: claude-sonnet-4-6` → `model: opus`.
2. `shared/user-feedback-rules.json` UFR-010 : retirer `exceptions[]`.
3. `state.schema.json` enum model : retirer `"sonnet-4.6"`.

Aucune migration de données nécessaire (le schema est en lecture-seule pour l'historique).

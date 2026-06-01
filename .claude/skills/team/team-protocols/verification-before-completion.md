# Verification Before Completion — protocole /team (UFR-022)

> **Absorbé de `superpowers:verification-before-completion` (2026-05-31, Q4).** Vendored pour que
> /team reste self-contained. Pas de nouveau hook : l'enforcement existe déjà structurellement (le gate
> verify Step 6 lance les VRAIES commandes via `pre-complete-verify.sh`). Ce protocole formalise la
> DISCIPLINE cross-agent et l'étend au dispatcher. Aligné UFR-013. Crédit : Obra/superpowers.

## La Loi de Fer

```
AUCUNE AFFIRMATION DE COMPLÉTUDE SANS PREUVE DE VÉRIFICATION FRAÎCHE.
```

Si tu n'as pas lancé la commande de vérification dans CE message, tu ne peux pas affirmer qu'elle passe.
Violer la lettre = violer l'esprit. Confiance ≠ preuve. « should/probably/seems » = STOP, lance la commande.

## La fonction-gate (avant toute affirmation de statut)

1. **IDENTIFY** : quelle commande prouve cette affirmation ?
2. **RUN** : exécute la commande COMPLÈTE (fraîche, pas un run précédent).
3. **READ** : sortie entière, exit code, compte les échecs.
4. **VERIFY** : la sortie confirme-t-elle l'affirmation ? Non → énonce le statut RÉEL avec preuve. Oui → affirme AVEC la preuve.
5. Seulement ALORS, affirme.

## Mapping /team (qui doit quoi)

| Affirmation | Preuve exigée | Insuffisant |
|---|---|---|
| « tests verts » | sortie test : 0 fail + count | « should pass », run précédent |
| « lint clean » | sortie eslint : 0 error | check partiel, extrapolation |
| « build OK » | exit 0 du build | lint passé (lint ≠ compilateur) |
| « bug fixé » | test du symptôme original : passe | code changé, supposé fixé |
| « phase agent done » | **`git diff` montre les changements** | le rapport de l'agent dit « success » |
| « requirements remplis » | checklist ligne-par-ligne vs spec.md AC | « les tests passent » |

## Spécifique /team

- **Gate verify (Step 6)** : `pre-complete-verify.sh` lance les vraies commandes ; la section `verify` de
  STORY.md DOIT contenir les **exit codes verbatim** (déjà imposé, cf. `feedback_verify_real_gate_not_global_exit`).
  Lance la VRAIE commande gate (`npm run lint`, pas `eslint <subdir>`) et lis CHAQUE exit code, pas le global d'un `;`-chain.
- **Dispatcher ne fait PAS confiance aux rapports d'agent (REGLE 17)** : un agent qui rapporte « DONE » →
  le dispatcher confronte à `git diff $(startCommit)..HEAD` AVANT d'accepter la phase. Pattern « agent reports
  success → check VCS diff → verify → report actual state ». Cf. `feedback_cumulative_verify_broader_than_wave_scope`.
- **Regression test (red-green)** : prouvé par le cycle rouge→vert (frozen-test), pas par « j'ai écrit un test ».
- **Full-suite final** : un changement de contrat partagé casse des tests voisins → scope la vérif finale
  PLUS LARGE que le wave (cf. `feedback_scoped_review_misses_contract_breakage`).

## Red flags — STOP
« Great! / Perfect! / Done! » avant vérif · « should work » · about to commit/push sans vérif · faire confiance
au rapport d'un sous-agent · vérif partielle · « juste cette fois » · fatigue. Tout wording impliquant un succès
sans avoir lancé la vérif = mensonge (UFR-013), pas efficacité.

## Bottom line
Lance la commande. Lis la sortie. ENSUITE affirme le résultat. Non négociable.
```

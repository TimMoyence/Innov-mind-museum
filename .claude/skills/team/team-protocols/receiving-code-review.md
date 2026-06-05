# Receiving Code Review — protocole /team (UFR-022)

> **Absorbé de `superpowers:receiving-code-review` (2026-05-31, direction Q4).** Vendored ici
> pour que /team reste self-contained. /team ajoute ce que le skill en prose n'a pas : un
> **artefact `review-response.md` + un hook d'enforcement** (`pre-complete-review-response-check.sh`)
> qui interdit l'accord performatif et exige une preuve par dispute. Crédit méthodologie : Obra/superpowers.

## Pourquoi c'est un trou /team

La **reviewer rejection loop est ILLIMITÉE** (REGLE 14, zéro cap) : discipline stricte côté émission
(reviewer fresh-context, anti-rubber-stamp), AUCUNE côté réception. Un agent re-spawné qui acquiesce
performativement à un finding erroné peut (a) thrasher à l'infini, OU (b) **dégrader le code pour
satisfaire une mauvaise review**. Ce protocole ferme ce côté.

## Principe

**Évaluation technique, pas performance émotionnelle.** Vérifier avant d'implémenter. Demander avant de
supposer. Correction technique > confort social. Un finding reviewer = une suggestion à évaluer, pas un
ordre à suivre.

## Quand ce protocole s'applique

Dès que le reviewer (Step 8) rend **CHANGES_REQUESTED** et que le dispatcher re-spawn fresh une phase
(spec/plan/red/green). `state.json.telemetry.reviewerRejectionLoops ≥ 1`. L'agent re-spawné lit les
findings depuis `team-reports/<RUN_ID>/code-review.json` (read-only, depuis le disque — jamais via un
résumé inline, UFR-022) et produit `review-response.md` AVANT toute implémentation.

## Le pattern de réponse (par finding)

1. **READ** — lire le finding complet sans réagir.
2. **UNDERSTAND** — reformuler l'exigence technique en ses propres mots. Si une partie est floue → STOP, ne rien implémenter, demander clarification (les findings peuvent être liés : compréhension partielle = mauvaise implémentation).
3. **VERIFY** — confronter au code réel (`Read`/`Grep`/`gitnexus`). Ce finding est-il techniquement correct POUR CE codebase ? Casse-t-il une fonctionnalité existante ? Y a-t-il une raison à l'implémentation actuelle ?
4. **EVALUATE → verdict** : `ACCEPT` | `DISPUTE` | `CLARIFY`.
5. **RESPOND** — accusé technique ou push-back raisonné. **Jamais d'accord performatif.**
6. **IMPLEMENT** — un item à la fois, tester chacun (ordre : bloquant/sécurité → fix simples → fix complexes).

## Interdits (anti-sycophancy — aligné UFR-013)

Le hook FAIL si `review-response.md` contient une de ces formules :
- « You're absolutely right », « Tu as tout à fait raison »
- « Great point », « Excellent feedback », « Bonne remarque »
- « Thanks for catching », « Merci d'avoir relevé » — **aucune expression de gratitude**

À la place : reformuler l'exigence, OU juste corriger et le montrer dans le code. Les actions parlent.

## Quand DISPUTER un finding (preuve obligatoire)

Disputer si le finding : casse une fonctionnalité existante · part d'un contexte incomplet · viole YAGNI
(feature non appelée — `grep` le codebase d'abord) · est techniquement incorrect pour la stack · ignore une
raison legacy/compat · **entre en conflit avec une décision archi/produit du user** (→ escalade Tech Lead,
pas de compliance silencieuse).

Un `DISPUTE` SANS ligne `Evidence:` (path:line, résultat de test, doc lib) = invalide (le hook FAIL).
Push-back = raisonnement technique, pas défensive.

## Interaction frozen-test (spécifique /team)

Si un finding implique qu'un **test du `red-test-manifest.json` est faux** : l'editor green ne peut PAS le
toucher (frozen-test). Verdict = `DISPUTE` + émettre `BLOCK-TEST-WRONG <test>:<line> <reason>` → re-spawn
fresh red. JAMAIS patcher le test en silence pour faire passer la review (double violation UFR-022 + UFR-013).

## Si tu as poussé-back et avais tort

`review-response.md` : « Vérifié — le finding est correct, mon analyse initiale était fausse parce que <X>.
Implémenté. » Factuel. Pas de longue excuse, pas de défense du push-back.

## Artefact `review-response.md` (contrat enforce-able)

Dès que `reviewerRejectionLoops ≥ 1`, l'agent re-spawné DOIT écrire `team-state/<RUN_ID>/review-response.md` :

```markdown
# Review response — RUN_ID=<id> — cycle <N>

Source : team-reports/<RUN_ID>/code-review.json (findings lus depuis le disque)

## Finding 1 — <titre reviewer>
- Verdict: ACCEPT | DISPUTE | CLARIFY
- (si DISPUTE) Evidence: <path:line | test result | lib-docs:line>  ← OBLIGATOIRE
- Action: <fix path:line | BLOCK-TEST-WRONG <…> | question au Tech Lead | YAGNI remove>

## Finding 2 — <…>
- Verdict: …
- Action: …

## Unclear (si applicable)
- Items <n,m> flous → clarification demandée AVANT implémentation (rien d'autre implémenté).
```

Chaque finding de `code-review.json` doit avoir un bloc. Implémentation seulement après que tous les
items flous sont clarifiés.

## Enforcement
`team-hooks/pre-complete-review-response-check.sh` (gate verify, Step 6) : si `reviewerRejectionLoops ≥ 1`
et `review-response.md` absent, OU un `DISPUTE` sans `Evidence:`, OU une formule performative interdite
→ FAIL → re-spawn fresh AVEC le protocole. Self-test inclus.

## Note GitHub
Pour répondre à un commentaire de review inline sur une PR : répondre DANS le thread du commentaire
(`gh api repos/{o}/{r}/pulls/{pr}/comments/{id}/replies`), pas en commentaire top-level.
```

# Finishing a Development Branch — protocole /team (UFR-022)

> **Absorbé de `superpowers:finishing-a-development-branch` (2026-05-31, Q4).** Vendored, Musaium-adapté
> (worktree orchestration cf. `feedback_team_worktree_orchestration` + `feedback_worktree_commit_churn`).
> S'applique au **Step 9 finalize** du pipeline. Pas de nouveau hook — décision user-facing. Crédit : Obra/superpowers.

## Principe
Vérifier les tests → détecter l'environnement → présenter des options structurées → exécuter → nettoyer.
JAMAIS de question ouverte « et maintenant ? ».

## Step 1 — Vérifier les tests (Loi de Fer verification-before-completion)
Avant de présenter quoi que ce soit : le gate verify (Step 6) + `pre-complete-verify.sh` doivent être verts
(preuve fraîche, exit codes verbatim). Tests rouges → STOP, on ne propose pas de merge/PR. Fixer d'abord.

## Step 2 — Détecter l'environnement
```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
```
- `GIT_DIR == GIT_COMMON` → repo normal, 4 options, pas de worktree à nettoyer.
- `GIT_DIR != GIT_COMMON`, branche nommée → 4 options, cleanup provenance-based (Step 6).
- détaché HEAD → 3 options (pas de merge), pas de cleanup (géré par le harness).

## Step 3 — Base branch
`git merge-base HEAD main` (Musaium : main = défaut ; dev = branche de travail courante). Sinon demander.

## Step 4 — Présenter EXACTEMENT ces options (concises, sans explication)
Repo normal / worktree branche nommée :
```
Implémentation complète. Que faire ?
1. Merger sur <base> en local
2. Push + ouvrir une Pull Request
3. Garder la branche telle quelle (je gère plus tard)
4. Jeter ce travail
```
Détaché HEAD : options 1(push+PR) / 2(garder) / 3(jeter).

## Step 5 — Exécuter
- **Merge local** : `cd` MAIN_ROOT ; `git checkout <base> && git pull && git merge <feat>` ; re-run tests sur le
  résultat mergé (verification-before-completion) ; PUIS cleanup worktree (Step 6) ; PUIS `git branch -d`.
- **PR** : `git push -u origin <feat>` ; `gh pr create` (Summary + Test Plan). **NE PAS** nettoyer le worktree (itération PR).
- **Garder** : « branche <name> conservée, worktree à <path> ». Pas de cleanup.
- **Jeter** : confirmation tapée `discard` obligatoire (liste branche+commits+worktree) ; puis cleanup + `git branch -D`.

## Step 6 — Cleanup workspace (Options merge & jeter UNIQUEMENT)
```bash
WORKTREE_PATH=$(git rev-parse --show-toplevel)
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"            # JAMAIS remove depuis l'intérieur du worktree
git worktree remove "$WORKTREE_PATH"
git worktree prune        # self-healing : nettoie les registrations stales
```
**Provenance** : ne nettoyer QUE les worktrees créés par nous (`.worktrees/`, `worktrees/`, `.git/worktrees/agent-*`).
Worktree owned-by-harness → NE PAS toucher (sinon phantom state).

## Pièges (déjà vécus, cf. memory)
- `git branch -d` échoue si le worktree référence encore la branche → merge → remove worktree → delete branch (ordre).
- `git worktree remove` depuis l'intérieur du worktree = échec silencieux → `cd` MAIN_ROOT d'abord.
- Worktree : GitNexus ré-injecte le compteur CLAUDE.md + pnpm reorder lockfile après commit ; stage explicite, JAMAIS `git add -A`.
- Stage `git diff --cached` AVANT commit (un `git add` stale abandonne le staging en silence).

## Garde-fous
Jamais merger sans tests verts sur le résultat · jamais jeter sans confirmation tapée · jamais force-push sans
demande explicite · jamais nettoyer un worktree non créé par nous.
```

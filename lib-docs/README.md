# lib-docs/ — UFR-022 documentation cache

Cache local des docs officielles des libs utilisées par le code applicatif. Consommé par les agents red / green / reviewer de `/team` (UFR-022) pour appliquer les patterns canoniques au lieu de se baser sur du training potentiellement périmé.

## Architecture

```
lib-docs/
├── INDEX.json          # TRACKED — manifest single-source-of-truth
├── README.md           # TRACKED — ce fichier
├── .gitignore          # TRACKED — ignore tout sauf tracked
└── <lib-name>/
    ├── LESSONS.md      # TRACKED — gotchas projet, edits humains
    ├── VERSION         # UNTRACKED — = INDEX.json.libs[lib].version
    ├── snapshot-YYYY-MM-DD.md  # UNTRACKED — raw WebFetch dump 5-10 pages
    ├── sources.json    # UNTRACKED — {urls, fetched, fetcherAgent, warnings, sha256}
    └── PATTERNS.md     # UNTRACKED — curated par doc-curator (Do/Don't/Imports/Top APIs)
```

## Que tracker ?

**Tracked (git) :**
- `lib-docs/INDEX.json` — manifest (version + fetched timestamp + sha256 + sourceUrls par lib).
- `lib-docs/README.md` — ce fichier.
- `lib-docs/.gitignore` — règles locales.
- `lib-docs/<lib>/LESSONS.md` — édité **manuellement** par les devs avec les gotchas spécifiques au projet (ex : "RN 0.83 hooks order avec Reanimated 3.x bug XYZ"). **Jamais touché par les agents.**

**Untracked (regenerable) :**
- Le reste : snapshots, PATTERNS.md, sources.json, VERSION.

**Pourquoi cette séparation** — pour minimiser la taille du repo (snapshots = 50-200 KB par lib, multiplié par 30+ libs = bloat inutile) tout en gardant la source de vérité (INDEX.json) committée pour que tout dev sache QUOI doit exister localement. La première fois qu'un dev clone le repo + lance `/team`, le hook `pre-phase-doc-freshness.sh` détecte que les fichiers locaux manquent et re-fetch automatiquement.

## Refresh policy (UFR-022)

Le hook `.claude/skills/team/team-hooks/pre-phase-doc-freshness.sh` exécute, avant chaque phase red/green/reviewer :

1. Parse imports staged du diff.
2. Pour chaque lib non-dev-only utilisée :
   ```
   SHOULD_REFRESH = (
     package.json resolved version != INDEX.json.libs[lib].version
     OR sources.fetched < (now - 14d)
     OR PATTERNS.md absent localement
   )
   ```
3. Si refresh → spawn doc-fetcher (fresh) puis doc-curator (fresh).

## Mise à jour manuelle de LESSONS.md

Si tu découvres un gotcha spécifique au projet (un bug RN, une convention LangChain particulière, un anti-pattern Express avec notre stack) :

1. Édite `lib-docs/<lib>/LESSONS.md` à la main.
2. Commit. C'est tracké.
3. Les agents red/green/reviewer le consommeront automatiquement à la prochaine /team run.

**Format suggéré** :

```markdown
# Lessons — <lib>

## 2026-MM-DD — <titre court>
- **Symptôme** : ...
- **Cause** : ...
- **Fix** : ...
- **Anti-pattern à éviter** : ...
- **Ref** : `path/to/file.ts:<line>` / commit `<sha>` / TECH_DEBT.md `TD-XX`
```

## NE JAMAIS faire

- Éditer manuellement `INDEX.json` (sauf bootstrap initial ou correction d'un champ corrompu).
- Éditer manuellement `<lib>/PATTERNS.md` (regénéré par doc-curator).
- Éditer manuellement `<lib>/snapshot-*.md` (regénéré par doc-fetcher).
- Committer les fichiers untracked malgré le .gitignore (force-add interdit).

## Bootstrap initial (premier `/team` run après clone)

À la première run après clone, tous les snapshots/PATTERNS.md seront absents → le hook va re-fetch toutes les libs utilisées par le code applicatif. Compter ~30s-2min selon le nombre de libs touchées. Une fois fait, le cache local persistera dans `lib-docs/<lib>/` localement (untracked).

Optionnel pour pré-chauffer le cache sans lancer `/team` : `bin/lib-docs-bootstrap.sh <lib-name>` (TBD — pas implémenté V1, peut être ajouté plus tard).

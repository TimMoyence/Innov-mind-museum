# `docs/_archive/`

Ce dossier n'héberge plus de material pédagogique ni de recaps de sprint : `training-2026-05/` et `sprints/` ont été supprimés le 2026-05-20 (pollution). L'historique reste récupérable via :

```
git log --all -- docs/_archive/<path>
```

Aujourd'hui le dossier sert uniquement de cible aux snapshots de `/team roadmap:rotate` (`roadmaps/<sprint-end>/`).

## Règles

- **Pas d'édition** des fichiers archivés. Si quelque chose est faux, laisse-le — `git log` est la source de vérité.
- **Pas de nouvelle référence** depuis les docs live. Les docs live pointent vers des docs live ; le material archivé ne se cite que depuis une autre entrée d'archive.

Pour "ce qui a été construit en mai 2026" : commence par les ADRs (`docs/adr/`), `docs/PHASE_HISTORY.md`, et `git log --oneline --since=2026-05-01 --until=2026-06-01`.

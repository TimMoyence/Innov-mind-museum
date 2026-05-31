---
name: html
description: "/html — Rend un doc (markdown/JSON) en HTML lisible self-contained via scripts/render-artifact.mjs, puis l'ouvre"
last-verified: 2026-05-31
---

# /html — Vue HTML lisible d'un doc

Raccourci explicite autour de `scripts/render-artifact.mjs` (CLAUDE.md § Output format).
Double emploi avec le **réflexe déduit du texte** (mémoire `feedback_auto_render_docs_to_html`,
qui rend automatiquement quand l'utilisateur exprime l'envie de lire/valider un doc) :
ici c'est le chemin **directement demandé**.

La sortie est une **vue lecture jetable** : la source markdown/JSON reste la vérité, on ne la
commite pas (sauf si c'est un livrable explicitement demandé). Edit = markdown, render = lecture.

## ARGUMENTS

```
/html <fichier> [<fichier2> ...] [--title "Titre"] [--no-open]
```

- 1 fichier → rendu simple `artifacts/<basename>.html`.
- ≥2 fichiers → bundle unique avec sommaire (TOC) `artifacts/<basename1>-bundle.html`.
- `--no-open` : ne pas lancer `open` (juste écrire + afficher le chemin).
- Pas d'argument → ne PAS deviner : lister 3-5 candidats plausibles (docs récents, dernier run `/team`) et demander lequel.

## PIPELINE

### Step 1 — Résoudre les inputs

- Vérifier que chaque fichier existe (`test -f`). Inexistant → le signaler, ne pas inventer de chemin.
- Cibles typiques : `docs/*.md`, `.claude/skills/team/team-state/<RUN_ID>/{spec,design,tasks}.md`,
  `.claude/skills/team/team-reports/<RUN_ID>/*.json`, `.claude/skills/team/team-knowledge/lessons/<id>.json`,
  `audit-state/**/*.md`.

### Step 2 — Rendre

Depuis la racine du repo. Nommer la sortie d'après le 1er fichier (basename sans extension) :

```bash
# 1 fichier
node scripts/render-artifact.mjs <fichier> --out artifacts/<basename>.html --quiet
# plusieurs → bundle TOC
node scripts/render-artifact.mjs <f1> <f2> ... --out artifacts/<basename1>-bundle.html --title "<titre|déduit>" --quiet
```

Le helper est **fail-open** (saute les fichiers absents avec un warning) et **zéro-dépendance**
(CSS+SVG inline, `@media print`, light mode, 2 accents).

### Step 3 — Ouvrir + reporter

- Sauf `--no-open` : `open artifacts/<...>.html` (plateforme darwin).
- Reporter le chemin exact + `open <chemin>` pour réouverture.
- Rappeler en une ligne que c'est une vue jetable (la source reste la vérité).

## NE PAS

- Ne pas committer la sortie HTML par défaut (vue dérivée jetable).
- Ne pas modifier la source.
- Ne pas dumper le HTML dans le chat (donner le chemin).
- Ne pas l'utiliser sur du code source brut (`.ts`/`.tsx`/`.js`) — c'est pour les artefacts « à lire ».

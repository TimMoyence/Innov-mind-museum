# GitNexus Integration — Code Intelligence par phase

Protocole d'utilisation OBLIGATOIRE des outils GitNexus MCP a chaque phase du SDLC.
Charge a chaque run `/team` (mode unique UFR-022).

---

## OUTILS DISPONIBLES

| Outil | Usage | Quand |
|-------|-------|-------|
| `gitnexus_query` | Trouver du code par concept | COMPRENDRE — explorer les execution flows |
| `gitnexus_context` | Vue 360 d'un symbole (callers, callees, processes) | COMPRENDRE + avant suppression |
| `gitnexus_impact` | Blast radius avant modification | AVANT CHAQUE EDIT de symbole existant |
| `gitnexus_detect_changes` | Verifier scope des changements | VERIFIER + pre-commit |
| `gitnexus_rename` | Rename safe multi-fichiers | DEVELOPPER — tout rename de symbole |
| `gitnexus_cypher` | Requetes custom sur le knowledge graph | Cas avances |

---

## USAGE PAR PHASE

### COMPRENDRE
```
gitnexus_query({query: "<sujet de la tache>"})
→ Trouver les execution flows lies
→ Identifier les fichiers et symboles concernes
→ Optionnel: gitnexus_context({name: "<symbole cle>"}) si besoin de la vue 360
```

### CONCEVOIR
```
Pour chaque symbole cle qui sera modifie :
gitnexus_impact({target: "<symbol>", direction: "upstream"})
→ Lister les dependants par profondeur:
  - d=1: WILL BREAK — DOIVENT etre mis a jour
  - d=2: LIKELY AFFECTED — devraient etre testes
  - d=3: MAY NEED TESTING — tester si chemin critique

Si risk = HIGH ou CRITICAL → ALERTER l'utilisateur avant de continuer
```

### DEVELOPPER
```
AVANT chaque modification de symbole existant:
gitnexus_impact({target: "<symbol>", direction: "upstream"})
→ cf. import-coherence.md niveau 1

POUR chaque rename:
gitnexus_rename({symbol_name: "<old>", new_name: "<new>", dry_run: true})
→ Review → gitnexus_rename({dry_run: false})

POUR chaque suppression:
gitnexus_context({name: "<fichier/symbole>"})
→ cf. import-coherence.md niveau 1 — delete protocol
```

### VERIFIER
```
gitnexus_detect_changes({scope: "staged"})
→ Comparer avec le scope attendu
→ Si fichiers inattendus modifies → WARN
→ Inclure dans le rapport de porte Sentinelle
```

### LIVRER
```
gitnexus_detect_changes({scope: "all"})
→ Verification finale: changements = scope attendu
→ Si divergence → BLOCK commit, investiguer
```

---

## ENFORCEMENT

Ce protocole n'est PAS aspirationnel. Il est OBLIGATOIRE.

### Dans les mandats agents
Chaque mandat DEV DOIT inclure la section COHERENCE IMPORTS (cf. import-coherence.md)
qui reference explicitement les outils GitNexus a utiliser.

### Verification par la Sentinelle
La Sentinelle verifie a chaque porte :
1. gitnexus_detect_changes a-t-il ete appele ? (obligatoire)
2. Les fichiers changes correspondent-ils au scope du mandat ?
3. Les d=1 dependants sont-ils traites ?

### Metriques
Tracker dans velocity-metrics.json :
- Nombre d'appels GitNexus par run
- Nombre de conflits detectes AVANT vs APRES les gates
- Tendance: si les conflits pre-gate augmentent, le shift-left fonctionne

---

## INDEX FRESHNESS

Si un outil GitNexus retourne un warning "stale index" :
1. STOP — ne pas continuer sans index frais
2. Executer: `npx gitnexus analyze` (ou `--embeddings` si embeddings existaient)
3. Verifier `.gitnexus/meta.json > stats` pour confirmer la mise a jour
4. Reprendre le travail

Le hook PostToolUse re-indexe automatiquement apres `git commit` et `git merge`.

---

## CLUSTER SKILLS — cartes de code auto-generees (OBLIGATOIRE en COMPRENDRE)

`gitnexus analyze --skills` produit 20 **cartes de cluster** dans
`.claude/skills/generated/<cluster>/SKILL.md` (chat, auth, llm, migrations, ui, pg, …).
Chaque carte = fichiers-cles + entry points + symboles-cles d'un domaine fonctionnel,
regroupes par cohesion (pas par arborescence — un fichier peut appartenir a 2 cartes).

**Ce ne sont PAS des skills invocables** (nichees a 2 niveaux → non decouvertes par
l'outil Skill ; regenerees a chaque run). On les consulte comme **materiel de reference
read-only** via un index routable.

### Index routable

`.claude/skills/cluster-skills-index.json` (schema `cluster-skills-index/v1`) —
manifeste deterministe : pour chaque cluster `{name, skillPath, description, symbolCount,
fileCount, cohesion, apps, pathPrefixes, keyFiles, entryPoints, keySymbols, sourceSha}`.
Genere par `scripts/gen-cluster-skills-index.mjs`. **NE PAS editer a la main** (regenere).

### Usage par phase

**COMPRENDRE (architect spec/plan + editor red/green) — apres `gitnexus_query`, AVANT d'ecrire :**
```
1. Determiner les fichiers touches par la tache (tasks.md / diff / scope).
2. node scripts/gen-cluster-skills-index.mjs --route <fichiers...>
     (sans arg → git diff HEAD + untracked)
   → liste les cartes de cluster pertinentes (longest-prefix par fichier).
3. Read la/les SKILL.md retournee(s) → entry points + symboles-cles du domaine
   AVANT de proposer une spec / un plan / du code. Cite la carte consultee dans
   l'output ("cluster <name> consulte").
```
Le routage complete `gitnexus_query` (concept → flows) par une **vue domaine stable**
(qui sont les fichiers/symboles structurants de ce cluster). Les deux sont complementaires.

### Fraicheur (boucle d'amelioration continue)

- Le hook PostToolUse `git commit` lance `.claude/hooks/gitnexus-skills-refresh.sh` :
  re-index → `gitnexus analyze --skills` → regenere l'index + logue le diff des clusters
  (`/tmp/gitnexus-skills-refresh-*.log`). Le code change → les cartes suivent automatiquement.
- Sentinelle : `node scripts/gen-cluster-skills-index.mjs --check` (exit 1 si l'index sur
  disque est desynchronise des cartes generees). Utilisable en pre-push / gate verify.
- Index absent ou `--route` echoue → WARN, continuer avec `gitnexus_query` seul (fail-open,
  jamais de BLOCK : la carte est un accelerateur, pas un gate).

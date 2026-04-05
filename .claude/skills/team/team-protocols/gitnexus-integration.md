# GitNexus Integration — Code Intelligence par phase

Protocole d'utilisation OBLIGATOIRE des outils GitNexus MCP a chaque phase du SDLC.
Charge en mode **standard** et **enterprise**.

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

### COMPRENDRE (toutes pipelines)
```
gitnexus_query({query: "<sujet de la tache>"})
→ Trouver les execution flows lies
→ Identifier les fichiers et symboles concernes
→ Optionnel: gitnexus_context({name: "<symbole cle>"}) si besoin de la vue 360
```

### CONCEVOIR (enterprise uniquement)
```
Pour chaque symbole cle qui sera modifie :
gitnexus_impact({target: "<symbol>", direction: "upstream"})
→ Lister les dependants par profondeur:
  - d=1: WILL BREAK — DOIVENT etre mis a jour
  - d=2: LIKELY AFFECTED — devraient etre testes
  - d=3: MAY NEED TESTING — tester si chemin critique

Si risk = HIGH ou CRITICAL → ALERTER l'utilisateur avant de continuer
```

### DEVELOPPER (standard + enterprise)
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

### VERIFIER (standard + enterprise)
```
gitnexus_detect_changes({scope: "staged"})
→ Comparer avec le scope attendu
→ Si fichiers inattendus modifies → WARN
→ Inclure dans le rapport de porte Sentinelle
```

### LIVRER (enterprise uniquement)
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
1. gitnexus_detect_changes a-t-il ete appele ? (enterprise: obligatoire)
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

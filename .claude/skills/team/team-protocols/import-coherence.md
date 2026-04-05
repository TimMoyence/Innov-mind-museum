# Import Coherence — Protocole anti-imports casses

Protocole de coherence des imports entre agents paralleles.
Charge en mode **standard** et **enterprise** (pas micro — single-scope, risque faible).

---

## NIVEAU 1 — Pre-edit (dans le mandat agent)

**OBLIGATOIRE avant de modifier, supprimer ou renommer un symbole ou fichier.**

### Modification d'un symbole existant

```
1. gitnexus_impact({target: "<symbolName>", direction: "upstream"})
2. Lire la liste des dependants d=1 (WILL BREAK)
3. Si dependants d=1 > 0 ET dans ton scope autorise → les inclure dans tes modifications
4. Si dependants d=1 > 0 ET hors de ton scope → FLAG comme Discovery :
   ### Discoveries (hors scope)
   - IMPACT: `<symbolName>` a N dependants hors scope: [liste fichiers]
   - ACTION REQUISE: Tech Lead doit coordonner la mise a jour
5. Ne PAS proceder a la modification sans avoir traite tous les d=1
```

### Suppression d'un fichier

```
1. gitnexus_context({name: "<fileName>"}) → lister TOUS les importers
2. Pour chaque importer dans ton scope :
   a. Ouvrir le fichier
   b. Supprimer ou remplacer l'import
   c. Verifier que le fichier compile sans l'import supprime
3. Pour chaque importer hors scope → FLAG comme Discovery
4. Supprimer le fichier SEULEMENT apres avoir traite tous les importers de ton scope
5. Si des importers hors scope existent → NE PAS supprimer, FLAG et attendre coordination
```

### Rename d'un symbole

```
1. gitnexus_rename({symbol_name: "<old>", new_name: "<new>", dry_run: true})
2. Lire le preview :
   - graph_edits: safe (le knowledge graph connait les references)
   - text_search_edits: a verifier manuellement (grep-based, peut avoir des faux positifs)
3. Si tous les fichiers touches sont dans ton scope → gitnexus_rename({dry_run: false})
4. Si des fichiers touches sont hors scope → FLAG comme Discovery, NE PAS renommer
```

### Creation d'un nouveau fichier

```
1. Verifier que le chemin respecte l'architecture (cf. agent definition)
2. Si le fichier exporte des symboles importes par d'autres (ex: types partages) :
   a. Verifier que les importers potentiels utilisent le bon chemin
   b. Utiliser les path aliases (@src/, @/, @modules/) — jamais de chemins relatifs profonds (../../..)
3. Si le fichier cree un nouveau barrel (index.ts) → verifier qu'il est importe correctement
```

---

## NIVEAU 2 — Post-agent scoped tsc (entre agents paralleles)

**Execute par le Tech Lead apres qu'un agent DEV termine, AVANT de merger ou lancer le gate.**

```bash
# 1. Lister les fichiers modifies par l'agent
CHANGED=$(git diff --name-only HEAD)

# 2. Pour chaque fichier modifie, trouver les dependants d=1 via GitNexus
# gitnexus_impact({target: "<file>", direction: "upstream"}) pour chaque fichier

# 3. Scoped tsc — backend
cd museum-backend && npx tsc --noEmit 2>&1 | head -20

# 4. Scoped tsc — frontend (si fichiers frontend modifies)
cd museum-frontend && npx tsc --noEmit 2>&1 | head -20
```

**Decision tree :**

| Resultat tsc | Action |
|-------------|--------|
| 0 erreurs | PASS — merger, continuer |
| Erreurs dans fichiers modifies par l'agent | Renvoyer au MEME agent avec le message d'erreur exact |
| Erreurs dans fichiers NON modifies (effet cascade) | Tech Lead corrige ou spawne un agent de correction cible |

**Regle : max 2 retours au meme agent.** Au 3e echec → escalade utilisateur.

---

## NIVEAU 3 — Verification pre-gate (renforce quality-gates.md)

Avant d'envoyer le rapport de porte a la Sentinelle :

```
1. gitnexus_detect_changes({scope: "staged"})
2. Comparer les fichiers changes avec le scope attendu du template
3. Si fichiers inattendus → WARN (pas FAIL, mais signale)
4. tsc global (backend + frontend) — dernier filet de securite
5. Si tsc global FAIL apres que les scoped tsc individuels ont PASS →
   c'est un conflit inter-agents, le Tech Lead doit resoudre manuellement
```

---

## INJECTION DANS LES MANDATS

Chaque mandat DEV (backend-architect, frontend-architect) DOIT inclure cette section :

```
### COHERENCE IMPORTS (OBLIGATOIRE)

AVANT de modifier/supprimer/renommer un symbole ou fichier :
1. Run gitnexus_impact({target: "symbolName", direction: "upstream"})
2. Traiter TOUS les dependants d=1 dans ton scope
3. FLAG comme Discovery les dependants hors scope
4. NE JAMAIS supprimer un fichier sans traiter ses importers

AVANT de creer un nouveau fichier :
1. Utiliser les path aliases (@src/, @/, @modules/) pour les imports
2. Verifier que le barrel index.ts parent est mis a jour si necessaire

Si tu ne respectes pas ce protocole → FAIL de porte automatique.
```

---

## METRIQUES

A chaque run, tracker dans error-patterns.json :
- Nombre de FAIL tsc post-agent (avant correction)
- Nombre de Discoveries import hors scope
- Nombre de corrections inter-agents (cascade)
- Tendance : si les FAIL tsc post-agent diminuent de run en run, le protocole fonctionne

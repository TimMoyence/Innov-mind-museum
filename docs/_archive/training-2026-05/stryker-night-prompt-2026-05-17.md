# Prompt — Stryker Night 2026-05-17

Copie le bloc ci-dessous dans une session Claude Code fresh sur main. Le prompt
est self-contained (zero référence vers la conversation actuelle).

---

## Stryker carve-out nuit — 3 cibles dense ROI

Branche `main`, partir du dernier commit Stryker = `ea37f88a` (2026-05-16 09:44)
ou descendant. Objectif : **réduire les 280 surv carry-over (admin 118 +
museum 92 + KE 70) via tests-only, en attaquant les 3 hot spots les plus
concentrés**.

### État vérifié au démarrage (à confirmer en début de session)

- `git log --oneline -5` doit montrer `ea37f88a docs(mutation): 5-sample
  timeout investigation` ou descendant.
- `git status` côté `museum-backend/` doit être propre (ignorer le diff
  staged hors mutation testing — souvent 50+ files hérités de PR-en-vol,
  PAS ton scope).
- `cd museum-backend && pnpm install` (au cas où node_modules dégradé).
- Lire `docs/_archive/training-2026-05/stryker-night-2026-05-15.md` §
  "Follow-up 2026-05-16" en ENTIER avant de démarrer — il documente le
  fix BullMQ open-handles + les knobs `setupFiles` /
  `extraTestPathIgnorePatterns` ajoutés à `stryker/config.mjs`. Si tu
  vois `100 % timed out, 0 killed` lors d'un dry-run, c'est ce piège —
  applique la même recette qu'à `stryker/module-admin.config.mjs`.

### Plan (séquentiel — JAMAIS deux Stryker en parallèle)

#### RUN 1 — module-admin carve-out admin-analytics-queries (target -30 surv)

42 surv restants dans `src/modules/admin/adapters/secondary/pg/admin-analytics-queries.ts`
(était 65 au first-pass `f90026b0`, 23 tués par les 45 tests
admin-analytics ajoutés sous `d8b73ffa`). Le pattern qui a marché est :
**strict `toHaveBeenCalledWith` sur les chaînes `.select()` /
`.addSelect()` / `.where()` / `.groupBy()` du `createQueryBuilder` mock**.

1. Identifier les 42 surv via :
   ```
   jq -r '.files["src/modules/admin/adapters/secondary/pg/admin-analytics-queries.ts"]
     | .mutants[] | select(.status == "Survived")
     | "\(.location.start.line):\(.location.start.column) \(.mutatorName) → \(.replacement)"' \
     museum-backend/reports/mutation/mutation.json | head -50
   ```
2. Regrouper par branche logique (chaque SQL query function dans le fichier
   = 1 cluster de 4-8 mutants). Ajouter 1 test/cluster qui pin la string
   exacte de la query construite.
3. Tests cibles : `tests/unit/modules/admin/admin-analytics-queries.mutants.test.ts`
   (déjà existant — c'est là que les 45 du précédent batch sont). Étendre
   ce file, ne pas en créer un nouveau.
4. Run : `cd museum-backend && rm -rf .stryker-tmp && STRYKER_CONCURRENCY=4 \
   pnpm stryker run stryker/module-admin.config.mjs 2>&1 | tee \
   stryker-admin-night-5.log`. ETA 45-60 min.
5. Commit : `chore(mutation): kill <N> admin-analytics-queries surv (118 → <118-N>)`.

#### RUN 2 — module-museum carve-out opening-hours-parser (target -15 surv)

26 surv dans `src/modules/museum/adapters/secondary/parsers/opening-hours-parser.ts`
(inchangé depuis first-pass — aucun test ne l'a stressé). State-machine
parser → besoin d'une **fixture matrix** : 24/7, `Mo-Fr 09:00-17:00`,
listes à virgules (`Mo,We 09:00-12:00`), ranges off (`Apr 01-Oct 31`),
empty input, malformed input, unicode. 1 it() par format.

1. Identifier les 26 surv via :
   ```
   jq -r '.files["src/modules/museum/adapters/secondary/parsers/opening-hours-parser.ts"]
     | .mutants[] | select(.status == "Survived")
     | "\(.location.start.line):\(.location.start.column) \(.mutatorName) → \(.replacement[0:60])"' \
     museum-backend/reports/mutation/mutation.json
   ```
2. Lire le source `museum-backend/src/modules/museum/adapters/secondary/parsers/opening-hours-parser.ts`
   en entier (probablement < 200 lignes) pour comprendre l'API publique +
   les branches de l'automate.
3. Étendre `tests/unit/museum/opening-hours-parser.test.ts` (existe déjà
   selon `stryker-museum-night-2.log` ligne ~4040).
4. Run : `pnpm stryker run stryker/module-museum.config.mjs`. Config
   vanilla (museum doit garder `EXTRACTION_WORKER_ENABLED=true` pour
   couvrir ses propres mutants enrichment).
5. Commit : `chore(mutation): kill <N> opening-hours-parser surv (92 → <92-N>)`.

#### RUN 3 — module-knowledge-extraction carve-out html-scraper (target -20 surv)

47 surv dans `src/modules/knowledge-extraction/adapters/secondary/scraper/html-scraper.ts`
(67 % de tous les KE surv). Pattern : **adversarial-fixture matrix** —
HTML malformé, balises manquantes, selectors alternatifs, ordre inattendu
des fields, unicode/escaping, fallback chains.

1. Identifier les 47 surv (même jq pattern).
2. Lire le source `museum-backend/src/modules/knowledge-extraction/adapters/secondary/scraper/html-scraper.ts`
   + le test existant `tests/unit/knowledge-extraction/html-scraper.test.ts`
   (cf log ligne ~3434).
3. Pour chaque cluster de mutants (selector StringLiteral, fallback
   conditional, regex), ajouter 1-2 fixtures HTML cassées qui force le
   path mort si le mutant tient.
4. Run : `pnpm stryker run stryker/module-knowledge-extraction.config.mjs`.
5. Commit : `chore(mutation): kill <N> html-scraper surv (70 → <70-N>)`.

#### RUN 4 (optionnel, si budget temps) — admin.repository.pg.ts (23 surv)

Même pattern que RUN 1 (strict `toHaveBeenCalledWith` sur qb chain).
Cible test file : `tests/unit/modules/admin/admin-repository.test.ts`.

### Contraintes dures

- **UFR-013 honnêteté** : ne JAMAIS claim "N surv killed" sans lire le
  rapport post-run. Si Stryker rapporte `Timeout`, vérifier via
  `coveredBy` + sample 1-2 mutants si suspicion d'open-handle masking
  (peu probable : on a validé 5/5 vrais kills sur l'admin scope 2026-05-16,
  mais re-valider si on touche un scope qui boot un nouveau `createApp`
  path).
- **Avant d'éditer un test fichier** : `gitnexus_impact({target:"<symbol>",
  direction:"upstream"})` selon CLAUDE.md règle "MUST run impact analysis
  before editing any symbol". Pour les tests files c'est `direction:
  downstream` qui n'a pas grand-chose à dire (les tests ne sont importés
  par rien), mais le hook hard-rule reste.
- **NE PAS modifier les fichiers source** (`*.ts` hors `tests/` et hors
  `stryker/`). Si un mutant survive parce que le code est sur-écrit
  défensivement → DOCUMENTER comme "equivalent mutant" dans le commit
  message, NE PAS supprimer le code source.
- **NE PAS commit le diff staged hors mutation testing** — `git status`
  va probablement montrer 50+ files staged héritées (profile preferences,
  retention, settings stores, etc.). Utiliser `git commit --only
  <PATHS>` pour commit UNIQUEMENT les fichiers test + le
  `reports/stryker-incremental.json`.
- **Si load système dépasse 30** : pause 10 min avant relance suivante.
- **Pré-commit gates** doivent passer (5/5 — Gate 6 skip si pas de
  changement manifest). En particulier `as-any` ratchet et test
  discipline plugin restent à 0.

### Stop conditions

- **Un module dépasse 2 h** → commit best-effort + module suivant.
- **TypeScript break ou test suite cassée** → STOP, fix avant continuer.
  Note : `pnpm jest --testPathPattern=<scope> --silent` plante sur le
  coverage threshold global même quand les tests passent — ce N'EST PAS
  un fail (cf CLAUDE.md gotcha). Vérifier la ligne `Tests: X passed`.
- **3 RUN sur 4 done suffit** — RUN 4 admin.repository est nice-to-have,
  pas un must.
- **Score scope qui chute** (e.g. admin 78.17 → 60 %) sans nouveau test
  → suspect, STOP et investiguer. Le score doit MONTER avec les kills,
  pas baisser.

### Anti-patterns à éviter

- **NE PAS bumper `timeoutMS`** quand un mutant ressort `Timeout` —
  c'est le label des kills sous open-handle leak (cf CLAUDE.md piège
  Stryker classification). Bumper juste rallonge le run pour le même
  résultat.
- **NE PAS appliquer le `setupFiles=EXTRACTION_WORKER_ENABLED=false` au
  scope museum** — museum doit garder le router enrichment actif sinon
  ses propres mutants `bullmq-museum-enrichment-queue.adapter.ts` sont
  classifiés `no-cov`.
- **NE PAS exclure des tests larges** sous prétexte qu'ils sont lents.
  La règle pour `extraTestPathIgnorePatterns` est strict : couvre 0
  mutant du scope `mutate:`. À vérifier via le `coveredBy` du
  rapport AVANT d'exclure.

### Livrables fin de session

1. **1 à 4 commits** `chore(mutation): kill <N> <hot-file> surv` (1 par
   module touché).
2. **Mise à jour recap** : APPEND une section "Follow-up 2026-05-17" au
   doc `docs/_archive/training-2026-05/stryker-night-2026-05-15.md`
   (NE PAS écraser les sections existantes). Format identique à la
   section 2026-05-16 : tableau modules shipped + breakdown + caveats
   UFR-013 + carry-over.
3. **Métriques globales agrégées** dans le recap : mutation score
   All files + total surv (cumulative cache).
4. **Friction notes** pour la nuit suivante si on découvre un nouveau
   piège (à ajouter sous "Friction notes for the next session" du recap).

### Pointeurs utiles

- Recap Phase 1 (état au démarrage) : `docs/_archive/training-2026-05/stryker-night-2026-05-15.md`
- Config Stryker de base : `museum-backend/stryker/config.mjs` (lire
  les commentaires `defineConfig` pour comprendre `setupFiles` /
  `extraTestPathIgnorePatterns`)
- Pattern de référence killable surv : commit `d8b73ffa` (45 tests
  admin-analytics qui ont killed 23 surv en une session — analyser ses
  diffs pour cloner le pattern)
- Mutation rapport JSON : `museum-backend/reports/mutation/mutation.json`
  (~13 MB — parser avec `jq`, jamais lire en entier)
- Pré-commit hook hard-rules : `CLAUDE.md` § "Hook bypass interdit
  (UFR-020)" — bypass `--no-verify` INTERDIT.

---

**Budget temps total estimé** : 3 RUN × ~45 min + analyse/commits = ~3-4 h
overnight. RUN 4 ajoute ~1 h si on le fait. Plan vise les 3 hot spots
les plus denses ; tout autre surv est carry-over conscient.

**Métrique de succès** : 280 surv → 200 ou moins (≥ 80 kills) sans
toucher au source. Si plus que 220 surv en fin de nuit, c'est qu'on a
sous-estimé la difficulté d'un cluster — documenter, pas insister.

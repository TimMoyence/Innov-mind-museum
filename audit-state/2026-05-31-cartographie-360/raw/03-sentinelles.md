# Cartographie 360 — Volet 03 : les 24 sentinelles

Audit du 2026-05-31. Source de vérité : `scripts/sentinels/`, `.husky/{pre-commit,pre-push,post-*}`,
`.github/workflows/sentinel-mirror.yml`. 23 scripts `.mjs|.sh` sur disque (la « 24e » = la baseline
`.integration-tier-baseline.json` lue par `integration-tier-signature.mjs`).

## 1. Modèle de câblage

Trois couches : **pre-commit** (`.husky/pre-commit`, budget <5s, 8 gates conditionnels), **pre-push**
(`.husky/pre-push`, 21 gates, budget <2min), et le **mirror CI** (`sentinel-mirror.yml`, re-run serveur
pour attraper un `--no-verify` interdit par UFR-020). Le mirror se déclenche sur `push: ['**']` +
`pull_request`. Trois sentinelles supplémentaires vivent dans d'AUTRES workflows (pas le mirror).

Le mirror n'est PAS un miroir strict. Il ajoute des gates absents du pre-push local
(`doc-last-verified.mjs` à `sentinel-mirror.yml`, `subprocessor-ledger-completeness.mjs`) : ces deux-là
sont **CI-only**, donc invérifiables localement et non protégés par la logique anti-bypass (qui suppose
qu'un gate local existe à contourner). Inversement `roadmap-claim-resolves` est dans les deux.

## 2. Statut par sentinelle

### A. Pleinement câblées (local + mirror) — valeur réelle

| Sentinelle | Détecte | Régression prévenue | Câblage (path:line) |
|---|---|---|---|
| `env-policy.mjs` | `.env*` stagé + shapes de clés (sk-, Bearer ey…, sk_live_, AKIA, GCP JSON) | Secret commité | pre-commit:70 + mirror Gate 2 |
| `as-any-ratchet.mjs` | nombre de `as any` (prod only) vs baseline | Érosion type-safety | pre-commit:88 + pre-push:109 + mirror. Baseline **0/0/0** (vérifié : `grep "as any" src` = 0) → ratchet propre, zéro dette figée |
| `openapi-sync.mjs` | spec BE valide + types FE à jour | Drift contrat API FE↔BE | pre-push:78 + mirror P4 |
| `migration-revertibility.mjs` | `down()` non-trivial sur la migration la + récente | Rollback cassé en prod | pre-push:89 + mirror P5 + (Gate 13 `check-migration-down.cjs`) |
| `guardrails-ratchet.mjs` | nb de keywords guardrail chat ≥ baseline (91) | Affaiblissement filtre AI-safety | pre-push:104 + mirror P8 |
| `idor-smoke.mjs` | run du test `idor-matrix.test.ts` (présent, vérifié) | Régression autorisation/BOLA | pre-push:99 + mirror P7 |
| `sentry-scrubber-parity.mjs` | **hash sha256** du scrubber canonical + 3 wrappers importent `@musaium/shared` + `hashEmail` | Réintroduction de regex PII locale divergente → fuite PII | pre-push:114 + mirror P9. Hash-pinné = la plus rigoureuse |
| `metric-naming.mjs` | snake_case + `_total`/`_seconds` + inventaire 44 métriques gelé + cap `musaium_`=16 | Drift nommage Prometheus cassant Grafana | pre-push:299 + mirror P19 |
| `fe-version-sync.mjs` | `package.json.version` == `app.config.ts version` | Binaire Expo publié avec version désynchro | pre-commit:150 (conditionnel) + mirror P21 |
| `compose-parity.mjs` | flags critiques prod (`--requirepass`) présents en dev | « marche en dev, casse en prod » | pre-commit:137 (conditionnel) + mirror P15 + morning-check |
| `husky-lfs-integrity.mjs` | marker `musaium-gate` intact, aucun hook réduit à un wrapper git-lfs nu | `git lfs install` clobbe les gates → bypass silencieux | post-commit/checkout/merge + pre-push + mirror P23 |
| `roadmap-claim-resolves.mjs` | path:line/SHA/cross-doc/workflow cités dans `ROADMAP*.md` résolvent (live : 4 fichiers, 13 SHA OK) | Claims fabriqués (cf. audit 22 P0 falsifiés) | pre-push:312 + mirror P20 |
| `workspace-links.mjs` | symlinks `file:` (`@musaium/shared`) résolvent | `Module not found` après pull sans install | pre-commit:125 (conditionnel) + post-merge |
| `cache-key-parity.mjs` | run du test parité cache-key | Drift clé cache read/write | pre-push:94 + mirror P6 — **MAIS test absent (voir §3)** |

### B. Câblées hors-mirror (autres workflows)

- `maestro-shard-manifest.mjs` → `ci-cd-mobile.yml`. Vérifie que chaque flow `.maestro/*.yaml` est dans
  exactement un shard. Prévient un flow E2E silencieusement jamais exécuté. Valeur réelle.
- `integration-tier-signature.mjs` → `ci-cd-backend.yml`. ADR-012 : chaque `tests/integration/*` doit
  toucher une vraie infra (testcontainer/DataSource/fetch). Baseline `.integration-tier-baseline.json`
  (12 855 octets = grande). Prévient des « faux » tests d'intégration (mocks déguisés).
- `wellknown-placeholder-free.mjs` → `ci-cd-web.yml:377` (deploy gate). Bloque le ship du token
  `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP`. **Vérifié live : PASS** car `pgp-key.txt` contient désormais une
  vraie clé PGP (placeholder remédié). Gate honnête, pas de faux-négatif.

### C. CI-only (mirror, pas de gate local jumeau)

- `doc-last-verified.mjs` (mirror P25) : 6 docs canoniques (`ROADMAP_PRODUCT`, `ARCHITECTURE`,
  `TECH_DEBT`, `ROPA`, `SUBPROCESSORS`, `SECURITY`) doivent porter un stamp ≤90j. Live : PASS, 6 docs.
  Mécanisme sidecar (json) astucieux : ne décale pas les line-numbers. Faiblesse : **CI-only**, donc on
  ne peut pas la valider en local avant push.
- `subprocessor-ledger-completeness.mjs` (mirror) : marker code (`cloud.langfuse.com`, `cartocdn.com`)
  → vendor présent dans `SUBPROCESSORS.md`. RGPD Art 28. Live : PASS. Liste `VENDOR_HOSTS` **codée en
  dur (3 entrées)** : ne détecte un sous-traitant non documenté que si quelqu'un pense à ajouter son
  marker → couverture par allow-list, pas exhaustive (faux sentiment de complétude possible).

### D. Orphelines (zéro câblage hook + CI)

- **`screen-test-coverage.mjs`** (UFR-021, la doctrine « tout écran → ≥1 flow Maestro »). Présent comme
  alias npm `sentinel:screen-test-coverage` UNIQUEMENT (`package.json:22`). **ABSENT de `.husky/` ET de
  `.github/`** (vérifié `grep -rln`). Live : exit 0, 33 écrans / 21 couverts / **12 grandfathered**.
  C'est l'écart le + grave : la doctrine la + citée de CLAUDE.md (avec case-study du bug DOB-2026-05-17)
  n'est PAS enforced — elle dépend d'un run manuel. CLAUDE.md l'admet (« Phase 2 : pre-push gate + CI
  mirror ») mais Phase 2 n'est pas livrée. **Faux sentiment de sécurité** maximal.
- **`audit-factory-coverage.mjs`** : ORPHAN. Écrit un rapport `/tmp/phase7-audit.txt`, n'a jamais d'exit
  ≠0 (`main()` sans `process.exit(1)`). Outil d'audit ponctuel, pas un gate. Théâtre s'il prétend garder.
- **`sbom-attest-check.mjs`** : ORPHAN des hooks/mirror. Live : PASS (contrat SBOM tenu BE+Web+Mobile).
  C'était la preuve RED d'un lot d'impl ; une fois vert il n'est plus rejoué → ne re-détecterait pas une
  régression si quelqu'un retirait `cosign attest`. Vraie valeur perdue faute de câblage récurrent.
- `dev-container-env-drift.sh` : câblé seulement à `morning-check.sh` (DX, pas un gate). Légitime : c'est
  un health-check de stack live, pas une garde de régression. Pas du théâtre, juste hors-scope CI.

## 3. Dette figée (ratchets) & théâtre

- **`cache-key-parity` = théâtre passif** : le test cible `tests/contract/cache-key-parity.test.ts`
  **n'existe pas** (vérifié `ls` → No such file). La sentinelle SKIP-grace `exit 0` toujours. Elle est
  câblée pre-push:94 + mirror P6 et apparaît « verte » : faux sentiment de couverture du contrat cache.
- **Ratchets sains** : `as-any` (0/0/0, aucune dette), `guardrails` (91, plancher AI-safety),
  `metric-naming` (inventaire gelé volontaire, documenté). Ils figent un *statu quo voulu*, pas de la
  dette cachée.
- **Baselines = dette tolérée** : `.integration-tier-baseline.json` (12,8 Ko) exempte des fichiers du
  tier-check ; `coverage-baseline.json` grandfather **12 écrans** sans flow Maestro. Ces 12 écrans sont
  de la dette UFR-021 explicitement figée — acceptable SI le sentinel était câblé (il ne l'est pas).

## 4. Trous : classes de régression SANS sentinelle

`grep` sur `scripts/sentinels/` : **aucune** sentinelle pour →
- **a11y** (EN 301 549 / RGAA pourtant cités RTL §9.1.3.2) : pas de garde axe-core/eslint-jsx-a11y au
  niveau sentinel (Lighthouse CI existe en workflow mais hors-mirror).
- **i18n** : pas de garde clés FR/EN manquantes (alors que le chat est multi-locale, 8 locales).
- **rate-limiting / quota** : aucune garde sur les middlewares de quota (gotcha « mutating middleware
  ordering » documenté mais non gardé).
- **CSP / security headers** (helmet) : pas de parité config.
- **dep-audit / SBOM récurrent** : `sbom-attest-check` orphelin ; pas de garde `pnpm audit` hard-fail.
- **screen-test-coverage non-câblé** = trou de facto sur la régression « écran shippé sans E2E ».
- **secret-rotation / cert-pinning** : runbooks existent, aucune garde automatisée de fraîcheur.

## 5. Verdict

Socle solide : ~14 sentinelles pleinement câblées + 3 hors-mirror apportent une vraie valeur, dont 2
remarquables (`sentry-scrubber-parity` hash-pinné, `roadmap-claim-resolves` anti-mensonge). MAIS :
**3 orphelines** (screen-test-coverage, audit-factory, sbom-attest), **1 théâtre actif**
(`cache-key-parity`, test fantôme), et **2 CI-only** faussement appelées « mirror ». Le pire écart est
`screen-test-coverage` : doctrine phare UFR-021 non-enforced. Pour un dev solo assisté-IA à J-8, ces
gardes compensent l'absence de relecteur humain — leur fiabilité réelle est le point de friction.

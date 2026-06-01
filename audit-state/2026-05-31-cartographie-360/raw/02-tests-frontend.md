# Audit 02 — Couverture de tests FRONTEND (museum-frontend) + Maestro e2e

Date : 2026-05-31. Méthode : Read/Grep/Bash, exécution réelle de `npm test` et du sentinel,
inspection CI live via `gh run`. Tout chiffre ci-dessous est vérifié-code (UFR-013), pas estimé.

## 0. Volumétrie réelle (corrige le brief)

- Le brief annonce « 361 tests ». Réalité : **344 fichiers** `.test.ts(x)` sous `__tests__/`,
  totalisant **3581 tests** (`it`/`test`) répartis sur 344 suites — vérifié par exécution :
  `Test Suites: 344 passed, 344 total / Tests: 3581 passed, 3581 total / Time: 17.6 s`.
  (`grep` brut : 2788 blocs `it(`/`test(` au premier niveau + table-driven → 3581 cas réels.)
- **45 flows** `.maestro/*.yaml` sur disque ; 43 runnables (hors `config.yaml`), 1 baseline JSON.
- 702 appels `jest.mock(` sur 344 fichiers (≈2/fichier) — mock-heaviness modérée, pas pathologique.

## 1. UFR-021 — sentinel screen-test-coverage : dette + un TROU de faux-positif

Run réel `node scripts/sentinels/screen-test-coverage.mjs --report` :
```
walked 33 screen(s), 43 flow(s)
✓ covered : 21   ∼ grandfathered : 12   ✗ uncovered : 0
```

- **12 écrans sur 33 (36 %) sont grandfathered** = dette UFR-021 non couverte, exemptée par
  `.maestro/coverage-baseline.json` (`bootstrappedAt: 2026-05-17`). Inclut des écrans de premier
  plan : `app/(tabs)/index.tsx`, `app/(tabs)/conversations.tsx`, `app/(stack)/chat/[sessionId].tsx`,
  `carnet.tsx`, `carnet/[sessionId].tsx`, `discover.tsx`, `create-ticket.tsx`, `preferences.tsx`,
  `guided-museum-mode.tsx`, `offline-maps.tsx`. Le « 0 uncovered » est donc en partie un artefact
  du grandfathering, pas une vraie couverture à 100 %.

- **TROU réel de faux-positif** (severity high) : le sentinel matche par **substring sur le fichier
  YAML ENTIER, commentaires inclus** (`screen-test-coverage.mjs:170,177` → `flow.content.includes(...)`).
  Conséquence concrète vérifiée : `tickets.tsx` et `ticket-detail.tsx` sont comptés « covered » par
  `nav-stack-deep-links.yaml` UNIQUEMENT parce que leurs route-paths apparaissent dans un commentaire
  d'en-tête qui dit littéralement « SKIPPED » :
  - `nav-stack-deep-links.yaml:17` : `#  9. /(stack)/tickets — SKIPPED: no UI entry...`
  - `nav-stack-deep-links.yaml:19` : `# 10. /(stack)/ticket-detail — SKIPPED: requires existing ticket`
  - Vérif : `grep -E "^\s*-" nav-stack-deep-links.yaml | grep -i ticket` → **0 ligne actionnable**.
  - `support-ticket-create.yaml` crée un ticket (`inputText` ligne 55,60) mais ne navigue jamais vers
    l'écran LISTE `tickets.tsx`. Donc `tickets.tsx` n'est **réellement tapé-through par AUCUN flow** :
    c'est un faux « covered ». Le sentinel devrait stripper les commentaires `#` avant le match.

## 2. Les flows comptés « covered » tapent-ils vraiment ? (échantillon)

Globalement OUI pour les flows actifs — ratio tapOn/inputText vs assert sain :
- `auth-register-happy.yaml` : 13 taps / 4 asserts ; `chat-history-pagination.yaml` : 16 / 5 ;
  `chat-flow.yaml` : 10 / 5 ; `reviews-submit-flow.yaml` : 8 / 3.
- `nav-stack-deep-links.yaml` et `nav-tabs-roundtrip.yaml` sont de **vrais** tap-through : navigation
  réelle via affordances UI (`tapOn "Museums"`, `tapOn id:"hero-settings-button"`), assertions
  d'écran-uniques + back-nav (`nav-stack-deep-links.yaml:55-99,145-167`). Pas de simple `assertVisible`.
- `auth-register-happy.yaml:64` tape `10/08/1994` au format **FR DD/MM/YYYY** — exactement le format
  qui a causé le bug DOB-2026-05-17. Donc UFR-021 couvre bien le cas que sa doctrine cite, là où le
  test Jest ne le couvrirait pas (cf. §3).

## 3. Tests Jest : comportement vs « mocker l'interaction qui casse » (DOB-2026-05-17)

- `screens/auth.test.tsx` mocke le **transport** (`authApi`, `AuthContext`, `useSocialLogin`,
  `expo-apple-authentication` — lignes 9-50) mais rend le **vrai** `AuthScreen` et exerce la vraie
  logique enable/disable : `auth.test.tsx:160-171` (« register button disabled until GDPR + DOB »).
  C'est un test **comportemental**, pas un mock-the-break.
- **MAIS** la limite DOB persiste : `auth.test.tsx:167` injecte `'2000-01-01'` (ISO), format qui passe.
  Le bug réel était le rejet du `DD/MM/YYYY` FR → ce test Jest, seul, ne l'attraperait toujours pas.
  Le filet est désormais Maestro (`auth-register-happy.yaml:64`), pas Jest. Cohérent avec la doctrine
  UFR-021 (« les tests Jest peuvent mocker l'interaction même qui casse ») — assumé.
- 21/36 tests d'écran utilisent `fireEvent`, 16/36 `waitFor` → majorité behavioral, pas cosmétique.

## 4. Suites spéciales : réelles, pas cosmétiques

- **rtl/** (`_rtl-style-audit.ts`) : walk RÉEL du `toJSON()` rendu, détecte props physiques
  (`marginLeft/Right`, `borderLeft*`, `textAlign:'left'`) — exemptions correctes (`left:0` symétrique,
  `hitSlop` auto-mirroré). 4 écrans audités (chat-session, discover, home, Composer). Réel.
- **a11y/** (`accessibility-audit.test.tsx`) : rend les vrais écrans, inspecte `accessibilityRole/Label/Hint`.
  `token-contrast.test.ts` vérifie le ratio de contraste des tokens. Réel.
- **i18n/** (`consent-locales.test.ts`) : vérifie pour 6 locales (de/es/it/ja/zh/ar) la présence des
  10 clés `consent.*` ET qu'elles **diffèrent** de l'EN (anti copy-paste). Réel et exigeant.
- **architecture/** (`no-shared-api-import-outside-infra.test.ts`) : sentinel hexagonal qui grep le
  FS réel — interdit l'import transport hors couche `infrastructure/`, whitelist composition-root. Réel.
- **sentinels/** : `maestro-shard-manifest.test.ts` (sync disque↔shards) + `info-plist-location-keys`.
  Vérif : les 43 flows runnables sont TOUS dans `shards.json` (4 shards : auth/chat/museum/settings),
  0 orphelin. Le sentinel fait son travail.

## 5. BLOCKER CRITIQUE — Maestro ne tourne PAS sur PR, et le nightly est ROUGE depuis ≥4 nuits

C'est le constat le plus grave, qui invalide la confiance dans toute la couche e2e :

- **Maestro n'est PAS un merge-gate.** `ci-cd-mobile.yml:250` : le job `maestro-shard` a
  `if: github.event_name == 'schedule' || workflow_dispatch`. Il **ne tourne jamais sur
  `pull_request` ni `push`**. Commentaire assumé `ci-cd-mobile.yml:50` : « Future: self-hosted Mac
  runner with HVF would enable per-PR maestro. » Donc une régression DOB-style passe la PR et n'est
  attrapée qu'au mieux la nuit suivante (et arrive sur TestFlight entretemps).
- **Pire : le nightly échoue tous les soirs.** `gh run list` : `2026-05-28/29/30/31 schedule → failure`
  (+ dispatches manuels du 2026-05-31 → failure). Inspection du run `26706092373` :
  `quality → failure`, puis `prebuild`, `maestro-shard`, `maestro-ios-nightly` → **skipped**.
  → **Les 43 flows Maestro n'ont PAS été exécutés en CI depuis ≥4 nuits.** La couche e2e est aveugle.
- **Cause racine** : le gate `quality` casse à **Expo Doctor** (`16/19 checks passed, 3 failed`,
  exit 1) — checks « Metro config », « app config fields non-CNG », « packages match Expo SDK
  versions ». Ce sont des soucis de config/hygiène, mais ils hard-fail et cascadent sur tout l'e2e.
  Le checkout du job est `-B main` → c'est l'état de **main**, pas seulement dev.

## 6. Verdict & risques

Le socle de tests FE est **réel et de bonne qualité** (3581 tests verts en 17,6 s, suites spéciales
non-cosmétiques, flows Maestro tap-through authentiques). Mais trois fissures donnent une **fausse
impression de sécurité** :
1. (critical) Maestro = 0 exécution CI depuis ≥4 nuits (gate Expo Doctor rouge) + jamais sur PR →
   tout l'investissement UFR-021 ne protège actuellement rien en CI.
2. (high) Sentinel screen-coverage matche les commentaires → `tickets.tsx`/`ticket-detail.tsx`
   faux-« covered ». Le « 0 uncovered » est partiellement fictif.
3. (medium) 36 % des écrans grandfathered (dette), dont chat/[sessionId] et les 2 tabs principaux.
4. (low) Worker leak en fin de `npm test` (« worker failed to exit gracefully ») — teardown à durcir.

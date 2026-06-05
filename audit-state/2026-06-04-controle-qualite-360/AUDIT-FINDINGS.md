# Controle qualite 360 — Musaium pre-launch V1

**Date** : 2026-06-04
**Methode** : 15 dimensions auditees par agents adversariaux (doctrine code>docs, UFR-013). 6 findings high-severite re-verifies par un verificateur independant avec reproduction empirique. `rg` banni (corruption RTK) -> `grep`/Grep + `node` repro.
**Verdict global** : **79 / 100 — B+ (solide, expedie avec dette qualite-gate connue)**

---

## Resume executif

Musaium est, au niveau du **code applicatif**, un repo nettement au-dessus de la moyenne pour un solo-dev pre-launch : securite enterprise-grade verifiee (auth JWT a familles, rotation refresh banking-grade, BOLA ferme, secrets prod fail-fast, CSRF/CSP/SSRF solides), assainissement IA reel a 6 couches cablees en prod (egress LLM + Sentry + Langfuse double-scrub, fuite GPS RGPD Art.7 reellement fermee), conformite 2026 couverte et verifiee (AI Act Art.50 first-interaction, RGPD Art.17 erasure multi-store, CNIL plancher 15 ans enforced), discipline type/lint exceptionnelle (zero `as any` en prod sur ~150k LOC), et une densite rare de lecons reellement enforcees par outillage (lint/ast-grep/sentinel).

Le defaut n'est presque jamais dans la **qualite d'execution** ; il est dans les **garde-fous censes garantir cette qualite dans le temps**, et dans le **timing/proportion** de l'ingenierie. Quatre verites systemiques re-verifiees a la main :

1. **Garde-fous desarmes silencieusement.** Le mutation gate Stryker est `if: false` (confirme, honnetement documente). L'enforcement hexagonal backend (eslint-plugin-boundaries) est un **no-op prouve par reproduction** : il ne firerait meme pas sur un import domain->infrastructure flagrant, alors qu'un commentaire de config affirme le contraire — et une vraie fuite domain->application existe deja, non detectee.

2. **Bug d'integrite reel dans une lib maison de securite.** `audit-chain.computeRowHash` DROP le contenu des objets imbriques du hash (collision reproduite : `COLLISION=true`). Atteint le chemin de notification de violation CNIL ou TOUT le payload forensique est nested. Invisible aux tests (qui hardcodent le serialiseur buggé comme oracle).

3. **Couche securite IA non gardee en CI.** Les tests fail-CLOSED du sidecar V2 sont `continue-on-error` ET sans sidecar -> ils throw et sont avales. La garantie fail-closed (ADR-047) n'est validee par aucun gate bloquant.

4. **Sur-ingenierie de timing.** Primitives 100k MAU (tenant rate-limiter dead, triple cost-gate, outbox+backoff B2B) posees sur un produit B2C a zero utilisateur.

Bonne nouvelle re-verifiee : 2 des 3 piliers flaggés par la cartographie-360 sont **reellement remedies** (Maestro faux-vert ferme par double-gate ; frozen-test = vrai hook, plus honor-system pur mais limite a `/team`). La memoire projet ne mentait pas sur ces deux-la. Elle se trompe sur le 3e (Stryker reste off).

L'honnetete documentaire est genuinement bonne (cleanup B2B reel, commentaires CI qui s'interdisent eux-memes de citer un faux gate). Les staleness restantes (DOCS_INDEX a ~2 semaines, ~7 memories Maestro/launch superposees, LESSONS pgvector dangereuse) sont du menage de fin de session, pas de la malhonnetete.

---

## Tableau par dimension

| Dim | Score | Grade | Verdict 1-ligne |
|---|---|---|---|
| SECURITY | 88 | enterprise | Posture exceptionnelle ; seuls findings = latents (CSRF header CORS, token web XSS-readable) |
| AI-SANITIZATION | 88 | expert | Egress LLM/Sentry/Langfuse solide ; defaut = 64 chars bruts dans l'audit forensique |
| CODE-GRADE | 88 | expert | Code mur ; ombres = mutation-gate off + frozen-test honor-system, pas le code |
| LESSONS | 88 | enterprise | Lecons enforcees par outillage ; 3 ecarts (LESSONS pgvector dangereuse, expo-image, strict:true) |
| TYPE | 84 | expert (decote) | Typage prod propre ; frontiere DB/LLM du BE sans filet statique (off + no noUncheckedIndexedAccess) |
| ARCH-REG | 84 | expert | Conformite 2026 verifiee ; SSRF probe sans allowlist, Stryker off |
| ROADMAP | 82 | expert | Honnete et tracable ; inexactitudes (corpus 97!=60, roster 9!=6, script 'pilot' Louvre/Orsay) |
| OWN-LIBS | 78 | expert (decote) | Libs soignees mais bug integrite audit-chain (HIGH) + probe-leak FSM + scrub URL-in-extra |
| TESTS | 74 | competent->expert | Tests applicatifs sinceres ; 2/3 piliers desarmes/advisory, gates haut-niveau non bloquants |
| DEBT-SPREAD | 74 | competent | Discipline reelle mais 2 classes (TypeORM RETURNING tuple, soft-delete) avec clones non-traces |
| DRY | 72 | competent | Vraie culture DRY mais sentinels figes re-laissent fuiter (fetchWithTimeout 2 clients), date FE eparpille |
| DOCS | 71 | competent | Corpus vivant et honnete mais DOCS_INDEX stale, scratchpads survivants, refs mortes |
| KISS | 68 | expert-exec | Code propre mais empilement scaling/B2B tres en avance d'un launch a 0 utilisateur |
| ARCH-PATTERNS | 68 | competent | Structure propre mais garde-fou de couches BE desarme (no-op prouve) + 1 fuite reelle |
| MEMORY | 62 | competent | Index sain mais ~7 memories superposees stale, 6 wikilinks casses, refs UFR-023/024/025 inexistantes |

---

## Findings CONFIRMES groupes par severite

### HIGH (re-verifies a la main)

- **ARCH-01 — eslint-plugin-boundaries no-op (enforcement hexagonal BE mort).** Reproduction : import domain->infrastructure value-import = 0 erreur. Cause prouvee : `@modules/*` resout en external (path:null, type:null) car le bloc boundaries n'a pas de `import/resolver`. Fix prouve : ajouter `settings['import/resolver'].typescript` DANS le bloc boundaries. Commentaire eslint.config.mjs:116-118 affirmant l'inverse = FAUX. (eslint.config.mjs:64-160)
- **AUDIT-01 — audit-chain hash DROP le contenu nested (collision prouvee).** `JSON.stringify(meta, Object.keys(meta).sort())` = allowlist top-level appliquee recursivement -> objets imbriques vides. Atteint guardrail provider:{} ET breach:{} (notification CNIL : TOUT le payload forensique nested -> non couvert par le hash). Migration deep-stable DIVERGE du runtime ; tests hardcodent le bug comme oracle. (audit-chain.ts:39-46, guardrail-audit-payload.ts:105, audit.service.ts:207-219) — **pourrait justifier CRITICAL.**
- **PILLAR-01 / ARCH-04 — Stryker mutation gate `if: false`.** Confirme ligne 411 ; aucun run depuis 2026-05-09 ; doctrine 'kill >=80% load-bearing' adossee a zero enforcement. Honnete dans les commentaires CI. (ci-cd-backend.yml:411) — *Note : ARCH-04 ramene a MEDIUM par le verificateur car desactivation intentionnelle/documentee ; comptabilise une seule fois.*
- **TQ-01 — fail-CLOSED V2 non garde en CI.** ai-tests `continue-on-error:true` (l.564) + aucun sidecar -> guardrail-v2-live throw en beforeAll et est avale. Aucun gate bloquant ne valide la garantie fail-closed (ADR-047). (ci-cd-backend.yml:524-565)

### MEDIUM (non re-reproduits par le synthetiseur ; preuves path:line des agents)

- **ARCH-02** — fuite reelle domain->application : chat/domain/ports/chat-orchestrator.port.ts:9 importe un type defini en useCase (que boundaries aurait du bloquer).
- **AISAN-01** — guardrail-snippet.ts:36-40 garde 64 chars de texte UTILISATEUR brut (PII possible) pour tout input bloque, AVANT le piiSanitizer ; retention 13 mois.
- **SYS-01** — artKeyword.upsert lit le tuple TypeORM RETURNING comme un array plat (clone latent du bug quota f74ce7de) ET le test mocke le mauvais shape.
- **SYS-02** — soft-delete `deletedAt` non filtre hors login : forgotPassword emet des tokens a des comptes supprimes ; registerUser/changeEmail laissent les comptes supprimes squatter l'email.
- **CIRCUIT-01** — ThreeStateCircuit : fuite de probe HALF_OPEN sans timeout -> lock-out permanent possible si exception entre canAttempt et recordOutcome.
- **SCRUB-01** — sentry-scrubber ne scrub pas les URL (token query-string) dans extra/data sous cle non-sensible.
- **AUDIT-02** — le test audit-chain replique le bug AUDIT-01 dans son oracle -> bug structurellement invisible.
- **DUP-01..04** — fetchWithTimeout re-fuite (2 clients hors sentinel fige), date FE eparpillee (7+ sites), password 8..128 duplique BE-interne+FE, tenant-scope reimplemente inline.
- **KISS-01..03** — TenantRateLimiter instancie mais .acquire() jamais appele (dead B2B) ; triple cost-gate 100k MAU ; outbox+backoff B2B pour 0 musee.
- **ARCH-07 (REG)** — SSRF probe url-head-probe.ts sans allowlist/private-IP-block (defere V2) alors que le scraper est durci.
- **STALE-01..04 (DOCS)** — DOCS_INDEX stale (ADR-069 absent, agent 'verifier' fantome), ref morte HANDOFF, garak decrit live alors que supprime, OPS staging sans caveat V1.
- **MEM-01..05** — handoff superseded a DELETE, remediation-roadmap auto-dementi (D6 Reranker vivant), cartographie-360 stale 2/3 piliers, 2 fichiers hors-index, 6 wikilinks casses.
- **RMAP-01/03/04** — script seed-pilot-museums cible Louvre/Orsay/Pompidou (jamais seedes) avec vocabulaire 'pilot' ; roster /team 9!=6 ; Stryker off non surface dans la posture risque.
- **LESS-01** — lib-docs/pg/LESSONS.md recommande `vector_cosine_ops` (incompatible halfvec) -> casserait la migration.

### LOW / INFO (echantillon)

SEC-01/02 (CSRF header CORS, token web XSS-readable), TYPE-01/02/03 (frontiere DB/LLM off, web sans --max-warnings=0), DUP-05..10, KISS-04..08, SYS-03/04, DEL-01..03, LESS-02/03, BUCKET-01, MEM-06..11. Les INFO sont massivement des **confirmations positives verifiees** (ordering messages LLM conforme, GPS leak ferme, double-scrub cable, factories DRY enforced, circuit-breaker FSM teste, Maestro faux-vert remedie, frozen-test cable).

---

## Top actions (par severite, ROI decroissant)

1. **[CRITICAL] Corriger audit-chain.computeRowHash** — serialiseur canonique deep-recursif ; re-stamp/version des hashes historiques ; tests nested sur l'unit ET la parite migration. Chemin CNIL = legalement liant.
2. **[HIGH] Reparer eslint-plugin-boundaries** — `import/resolver.typescript` dans le bloc boundaries ; fixture-garde domain->adapter en CI ; corriger ARCH-02.
3. **[HIGH] Garde-fou couches BE deterministe** — sentinel fs-based (modele FE) walk domain/, fail si import resout /adapters/ ou /useCase/ ; independant de boundaries.
4. **[HIGH] Decision Stryker** — re-armer (plan l.405-410) OU acter formellement que la force des tests n'est mesuree que par couverture. Ne pas le citer comme garde.
5. **[HIGH] Splitter les tests fail-CLOSED V2** — sortir dead-port/dead-URL/budget/fail-soft du describe live-sidecar -> gate bloquant sans sidecar.
6. **[HIGH] Sanitiser le snippet d'audit BLOCKED** — passer fullText au RegexPiiSanitizer avant slice(0,64), comme l'entree REDACTED.
7. **[MEDIUM] Fermer SYS-01/SYS-02** — guard Array.isArray sur artKeyword RETURNING + reecrire le mock tuple ; filtrer deletedAt dans forgotPassword + unicite email (ou @DeleteDateColumn).
8. **[MEDIUM] noUncheckedIndexedAccess BE + --max-warnings=0 WEB** — rendre la discipline existante compiler/lint-checked.
9. **[MEDIUM] Probe-timeout ThreeStateCircuit + scrub URL-in-extra** — fermer 2 fuites lib maison.
10. **[LOW-mais-cheap] Menage docs/memoire** — corriger LESSONS pgvector (dangereuse), DOCS_INDEX (ADR-069/agents), purger ~7 memories superposees, fixer 6 wikilinks, retirer dead-code B2B (TenantRateLimiter, seed-pilot script).

---

## Note d'honnetete (limites de cet audit)

- **Cap de re-verification** : seuls 6 findings high ont ete reproduits empiriquement par le synthetiseur (audit-chain collision, boundaries no-op, ai-tests/maestro gates, mutation gate, DOCS_INDEX, roster agents). Les ~50 autres findings reposent sur les preuves path:line citees par les agents de dimension — echantillonnees, jugees credibles (les agents ont eux-memes utilise grep/Grep et reproduction), mais **non integralement re-lues** par le synthetiseur.
- **Dimensions superficielles** : a11y mobile (ARCH-12) marquee `likely` par l'agent lui-meme (pas de gate CI WCAG mobile verifie, echantillon d'ecrans seulement — touch-targets 44dp / contraste non audites). Performance runtime, charge, et qualite UX visuelle **hors scope** de ces 15 dimensions.
- **Pas de mesure dynamique** : aucun test n'a ete execute en suite complete par le synthetiseur ; les claims 'tests passent' viennent des agents. Le mutation testing etant off, la **force** reelle des tests (kill-rate) est inconnue, pas seulement non-gardee.
- **CRITICAL potentiel non tranche** : AUDIT-01 est note HIGH mais le verificateur indique qu'il 'pourrait justifier CRITICAL' (chemin notification CNIL). Conservatif : compte comme le finding le plus grave, traite #1 dans les actions.
- **B2B / produit** : l'audit constate le dead-code/sur-ingenierie B2B mais ne tranche PAS la decision produit (enterrer vs garder) — c'est un choix de Tim, pas un defaut de code en soi.

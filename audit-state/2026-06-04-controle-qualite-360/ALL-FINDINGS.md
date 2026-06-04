# Tous les findings — controle qualite 360 (2026-06-04)

Total: 127 findings bruts. Verif adversariale: {"total":6,"verified":6,"confirmed":6,"refuted":0,"capped":0}


---

# HIGH

### ARCH-01 [ARCH-PATTERNS] — eslint-plugin-boundaries (enforcement hexagonal BE) ne mord PAS — règle silencieusement désarmée
- confidence: verified | RE-VERIF: **CONFIRMED** -> HIGH
- evidence: museum-backend/eslint.config.mjs:62-160 configure boundaries v6.0.1 avec règles domain↛application/infrastructure/primary, application↛infrastructure/primary, etc. J'ai prouvé que la règle ne fire jamais : (1) probe réelle — un fichier domain important un adapter secondary en VALUE import (`src/modules/chat/domain/__probe_real.ts` importing `@modules/chat/adapters/secondary/llm/langchain.orchestrator`) → 0 erreur boundaries (seulement filename-case + type-import). (2) Full lint `npx eslint 'src/modules/chat/domain/**/*.ts'` = 0 messages boundaries au total. (3) Repro isolée (Linter flat, 4 formes de config dont la forme repo exacte ET la forme canonique default:'disallow'+allow same-type) = 0 erreur dans tous les cas. (4) Le rule `boundaries/no-unknown` (non actif dans la config repo) fire lui « Dependencies to unknown elements » → preuve que l'élément TO importé n'est PAS classifié (les patterns `src/modules/*/useCase/**` ne matchent pas le chemin résolu). Le commentaire eslint.config.mjs:116-118 affirme que la migration v6 a corrigé l'enforcement (« which broke enforcement on this repo before this migration ») — c'est FAUX, il est toujours cassé.
- claim-vs-reel: Config + commentaire (lignes 116-118) : « la migration v6 vers les object selectors restaure l'enforcement hexagonal ». Réalité : aucune erreur boundaries n'est produite, même sur une violation domain→infrastructure value-import explicite. L'enforcement de couches backend est inopérant.
- reco: Corriger la classification des éléments boundaries. La cause probable est le matching pattern vs chemin résolu (base path/CWD). Étapes : (a) ajouter temporairement `'boundaries/no-unknown': 'error'` et `'boundaries/no-unknown-files': 'error'` pour rendre visibles les éléments non classifiés ; (b) ajuster les patterns (essayer `mode: 'file'` retiré, ou patterns absolus via settings, ou `boundaries/root-path`) jusqu'à ce qu'une violation-test domain→infra produise réellement une erreur ; (c) ajouter un test de garde (un fixture domain qui importe un adapter, attendu = lint fail) au CI pour empêcher la re-régression silencieuse ; (d) corriger ensuite la vraie fuite ARCH-02 que la règle aurait dû attraper.

### ARCH-04 [ARCH-REG] — Pilier qualité Stryker (mutation testing) TOUJOURS désarmé (if:false) — finding du précédent audit confirmé non remédié
- confidence: verified | RE-VERIF: **CONFIRMED** -> MEDIUM
- evidence: .github/workflows/ci-cd-backend.yml:411 (if: false) + commentaire :397-403 ('DISABLED, re-confirmed 2026-05-31 audit 360 ; this job has NOT run since 2026-05-09 ; mutation thresholds NOT enforced anywhere in CI ; do not cite it as an active guard'). Le gate mutation:gate (:474) et les seuils .stryker-hot-files.json ne s'exécutent jamais.
- claim-vs-reel: Contrairement à ce que la mémoire projet pourrait laisser croire (remédiations dd227d64/93d5a7c6...), le mutation gate reste OFF. C'est HONNÊTEMENT documenté dans le workflow lui-même (pas un mensonge), mais c'est un pilier de qualité absent : la robustesse des tests (efficacité kill) n'est mesurée par aucun gate CI.
- reco: Soit ré-armer post-launch (plan documenté lignes 405-410), soit acter formellement dans la ROADMAP que la qualité des tests n'est garantie que par coverage (quantité) et non mutation (efficacité). Ne PAS citer Stryker comme garde actif (déjà respecté dans la doc).

### STALE-01 [DOCS] — DOCS_INDEX.md est stale : s'arrête à ADR-068 (ADR-069 existe, 2026-06-01) et liste un agent 'verifier' qui n'existe plus
- confidence: verified | RE-VERIF: **CONFIRMED** -> MEDIUM
- evidence: DOCS_INDEX.md:24 'ADRs (002-068)' et la table ADR s'arrête à ADR-068 (ligne 84) ; or docs/adr/ADR-069-museum-search-id-osm-generic-conversation.md:3 existe (Status Accepted-implemented, 2026-06-01). grep '069' docs/DOCS_INDEX.md = 0. DOCS_INDEX.md:159 'Agents (6 — architect, editor, verifier, security, reviewer, documenter)' MAIS ls .claude/agents/ = architect, doc-cache, documenter, editor, reviewer, security — 'verifier' n'existe pas, 'doc-cache' manquant. Confirmé par memoire projet_team_prune_9to6 (verifier retiré, doc-cache mergé).
- claim-vs-reel: DOCS_INDEX (la 'table de vérité') dit verifier∈agents et ADRs∈[002-068] ; le filesystem dit doc-cache∈agents, pas de verifier, et ADR-069 existe.
- reco: TRIM/UPDATE : corriger la ligne agents (6 = architect, doc-cache, documenter, editor, reviewer, security), étendre la plage ADR à 069 + ajouter la ligne ADR-069, bumper la date 'Last cleanup'. Un index de vérité qui ment sur les agents et la dernière ADR sape sa propre raison d'être.

### AUDIT-01 [OWN-LIBS] — audit-chain computeRowHash exclut les clés d'objets imbriqués du hash d'intégrité (collision prouvée, chemin prod atteint)
- confidence: verified | RE-VERIF: **CONFIRMED** -> HIGH
- evidence: museum-backend/src/shared/audit/audit-chain.ts:39-60 — `JSON.stringify(input.metadata, Object.keys(input.metadata).sort(...))`. Le 2e argument tableau de JSON.stringify est un ALLOWLIST de clés appliqué RÉCURSIVEMENT avec la SEULE liste top-level → toute clé d'un objet imbriqué absente de cette liste est OMISE. Vérifié empiriquement via node : `JSON.stringify({b:{x:1,y:2},a:3}, ['a','b'])` => `{"a":3,"b":{}}` ; deux metadata aux contenus imbriqués DIFFÉRENTS ({x:1,y:2} vs {x:99,y:88}) produisent un hash IDENTIQUE (collision:true). Atteint en PROD : museum-backend/src/modules/chat/useCase/guardrail/guardrail-audit-payload.ts:105 `provider: { name: providerName, version: providerVersion }` est un objet imbriqué dans metadata d'une ligne d'audit PII-redaction → name/version exclus du hash. Le contrat d'inviolabilité (hash-chain GDPR Art.5 forensic, CLAUDE.md ADR-054) est donc affaibli : on peut muter le contenu imbriqué d'une ligne sans casser la chaîne.
- claim-vs-reel: La doc (audit-chain.ts:36-37) affirme « Metadata JSON-stringified with sorted keys so object key order doesn't break the chain ». Réalité : non seulement l'ordre, mais le CONTENU imbriqué entier est silencieusement supprimé du hash.
- reco: Remplacer le replacer-array par une sérialisation canonique récursive vraie (deep-sorted keys), ex. un sérialiseur stable type `json-stable-stringify` ou un tri récursif maison. Re-stamper le hash de chaîne historique (migration) ou versionner l'algo. Ajouter un test computeRowHash avec metadata imbriqué prouvant que 2 contenus imbriqués distincts donnent 2 hashes distincts.

### PILLAR-01 [TESTS] — Stryker mutation gate TOUJOURS désarmé (if: false) — non remédié
- confidence: verified | RE-VERIF: **CONFIRMED** -> HIGH
- evidence: .github/workflows/ci-cd-backend.yml:411 `if: false` sur le job `mutation`; commentaire lignes 397-403 l'admet explicitement: "DISABLED (deferred post-launch) — re-confirmed 2026-05-31 ... NOT a gate today: Stryker mutation thresholds (.stryker-hot-files.json) are NOT enforced anywhere in CI — do not cite it as an active guard". L'actionlint est même configuré pour ignorer ce if:false (ligne 147 `-ignore 'constant expression "false" in condition'`).
- claim-vs-reel: CLAUDE.md et la doctrine citent le seuil mutation ≥80% kill sur hot-files comme "the load-bearing signal" (jest.config.ts:126). Réalité: le job ne tourne plus depuis 2026-05-09, aucun seuil mutation n'est appliqué en CI. La cartographie-360 avait raison, la mémoire ne l'a PAS remédié.
- reco: Soit ré-armer le job (régénérer reports/stryker-incremental.json offline + remplacer if:false par le conditionnel de c17c404e, déjà documenté lignes 405-410), soit retirer toute prose qui le présente comme un guard actif. Tant qu'il est off, ne pas s'appuyer sur la couverture pour juger la FORCE des tests — un test peut couvrir une ligne sans tuer un seul mutant.

### TQ-01 [TESTS] — V2 guardrail fail-CLOSED non vérifié en CI: ai-tests est continue-on-error ET sans sidecar
- confidence: verified | RE-VERIF: **CONFIRMED** -> HIGH
- evidence: ci-cd-backend.yml:564 `continue-on-error: true` sur le job ai-tests; aucun `services:` ni step de démarrage du sidecar dans le job (vérifié lignes 524-566, grep sidecar/uvicorn/8081 = 0 match). Or tests/ai/guardrail-v2-live.ai.test.ts:51-59 fait `throw new Error` en beforeAll si le sidecar est injoignable. Donc en CI: sidecar absent → describe error → avalé par continue-on-error.
- claim-vs-reel: Mémoire project_v2_guardrail_test_enablement: "Couches V2 testées e2e en réel". Vrai EN LOCAL (avec sidecar lancé). En CI: la garantie fail-CLOSED du sidecar ProtectAI n'est validée par AUCUN gate bloquant — une régression du fail-closed passerait le merge.
- reco: Si la sécurité V2 est V1-critique: ajouter le sidecar comme service/step dans ai-tests et retirer continue-on-error pour AU MOINS les invariants fail-CLOSED/fail-OPEN (séparer ces tests déterministes des asserts free-form LLM non-déterministes qui justifient l'advisory). Sinon, cesser de présenter la couverture V2 comme "vérifiée".


---

# MEDIUM

### AISAN-01 [AI-SANITIZATION] — Le snippet d'audit forensique conserve 64 caractères de texte UTILISATEUR BRUT (PII possible) pour tout input bloqué
- confidence: verified
- evidence: museum-backend/src/modules/chat/useCase/guardrail/guardrail-snippet.ts:36-40 — redactSnippetForAudit() fait `snippetPreview = fullText.slice(0, 64)` SANS aucune redaction PII (email/téléphone). Appelé par guardrail-audit-payload.ts:43 buildGuardrailBlockAuditEntry avec `fullText` = le texte brut transmis depuis guardrail-evaluation.service.ts:166-170 (`fullText: text ?? ''`, texte AVANT piiSanitizer). La sanitization PII (chat-message.service.ts:284) n'arrive QU'APRÈS le guardrail d'entrée — donc un message bloqué (insulte+email, ex 'connard contacte moi a jean@x.fr ...') voit ses 64 premiers chars bruts écrits dans la chaîne de hash d'audit (rétention 13 mois, cf commentaire guardrail-snippet.ts:18). Le commentaire du fichier prétend 'avoid leak PII back through forensic queries' — contredit par le slice verbatim. NB: l'entrée AUDIT_GUARDRAIL_INPUT_REDACTED (guardrail-audit-payload.ts:90) opère bien sur redactedText post-scrub ; seule l'entrée BLOCKED conserve le brut.
- claim-vs-reel: Le code/commentaire affirme 'durcissement LLM02 / structurellement impossible de fuiter la PII originale dans la hash chain' (guardrail-audit-payload.ts:74-78) — vrai pour l'entrée REDACTED, faux pour l'entrée BLOCKED qui garde 64 chars bruts.
- reco: Passer fullText à RegexPiiSanitizer.sanitize() (ou au redactedText du provider) AVANT redactSnippetForAudit pour l'entrée BLOCKED, comme c'est déjà fait pour l'entrée REDACTED. Le fingerprint sha256 du texte intégral peut rester pour le dedup forensique.

### ARCH-02 [ARCH-PATTERNS] — Fuite de couche réelle : un port domain importe un type défini dans la couche application (useCase)
- confidence: verified
- evidence: museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts:9 — `import type { KnowledgeRouterSource } from '@modules/chat/useCase/knowledge/knowledge-router.service';`. Le fichier est dans `domain/ports/` (l'artefact hexagonal le plus pur). `KnowledgeRouterSource` est défini en application : museum-backend/src/modules/chat/useCase/knowledge/knowledge-router.service.ts:26 = `export type KnowledgeRouterSource = 'wikidata' | 'web' | 'none';`. C'est une inversion domain→application : un port ne doit jamais dépendre d'un module de la couche application. C'est précisément ce que boundaries devait bloquer (cf ARCH-01) ; ça passe car la règle est désarmée.
- claim-vs-reel: CLAUDE.md §Architecture : « domain ne doit JAMAIS importer d'adapters ; logique métier hors controllers » + config boundaries domain↛application. Réalité : une dépendance domain→application existe et n'est pas détectée.
- reco: Déplacer le type `KnowledgeRouterSource` (simple union de string-literals) dans la couche domain (ex `chat/domain/knowledge/knowledge-source.ts` ou `chat/domain/chat.types.ts`) et faire que `knowledge-router.service.ts` (application) le ré-importe depuis domain. Trivial à corriger ; révèle surtout que ARCH-01 a un coût réel (pas qu'un risque théorique).

### ARCH-06 [ARCH-REG] — Pilier frozen-test : hook réel et câblé, mais enforcement seulement sous /team (RUN_ID set) — skip silencieux en session classique
- confidence: verified
- evidence: .claude/skills/team/team-hooks/post-edit-green-test-freeze.sh:110-120 : exit 0 (skip) si RUN_ID unset, OU manifest absent, OU jq absent. Câblé PostToolUse dans .claude/settings.json:47. Le hook lui-même est correct (self-test scénarios :38-81, sha256 verify :83-106).
- claim-vs-reel: Le précédent audit parlait d'« honor-system ». Aujourd'hui c'est un vrai hook déterministe — MAIS uniquement dans le pipeline /team avec RUN_ID. En session classique (modif code hors /team), le contrat frozen-test n'est pas enforced (skip ligne 111). Ce n'est plus pur honor-system, mais ce n'est pas airtight non plus.
- reco: Acceptable si toute modif code passe obligatoirement par /team (doctrine UFR-022). Sinon, le gap reste : une session classique peut self-modifier ses tests. Documenter clairement que le frozen-test ne couvre QUE les runs /team.

### ARCH-07 [ARCH-REG] — SSRF : défense forte sur le scraper (path dangereux) mais ABSENTE sur le citation URL-head-probe (assumé, deferred V2)
- confidence: verified
- evidence: FORT: museum-backend/src/modules/knowledge-extraction/adapters/secondary/scraper/html-scraper.ts:88-107 (isPrivateIp full: 127/10/0/192.168/169.254 IMDS/172.16-31/IPv6 ::1,fc,fd,fe80), :125-146 (re-check à chaque redirect hop, decode IPv4-mapped IPv6 ::ffff:127.0.0.1, skip DNS pour IP literals). FAIBLE: src/modules/chat/useCase/orchestration/url-head-probe.ts:17-21 ('NO hostname allowlist ... introduce allowlist here (V2 hardening, Q3 2026 post-launch)').
- claim-vs-reel: ADR-006 titre 'SSRF defense-in-depth' : vrai pour le scraper, partiel pour le probe. Le probe ne fait que HEAD + fail-open (url-head-probe.ts:166-167), risque limité (pas de body exfiltré), mais une URL LLM-fabriquée vers 169.254.169.254 déclenche quand même une requête sortante.
- reco: Avant launch, ajouter au minimum le même isPrivateIp() guard (réutiliser le helper de html-scraper, non partagé aujourd'hui — il n'existe pas de src/shared/http/ssrf-guard) au url-head-probe, OU acter le risque résiduel HEAD-only par écrit. Extraire isPrivateIp en helper partagé @shared/http (DRY).

### MAT-09 [CODE-GRADE] — Pilier qualité Stryker (mutation testing) toujours désarmé en CI — confirmé `if:false`
- confidence: verified
- evidence: .github/workflows/ci-cd-backend.yml:395-411 — job `mutation` avec `if: false` (l.411), commentaire l.397-403 admet honnêtement 'NOT run since 2026-05-09... NOT a gate today... do not cite it as an active guard'. La mémoire projet (dd227d64 etc.) concerne les couches V2 guardrail, PAS Stryker. L'audit 360 disait vrai sur CE point.
- claim-vs-reel: La mémoire projet laisse croire que 'certains piliers ont été remédiés'; pour Stryker c'est faux — il reste désarmé. La doc CI elle-même est honnête à ce sujet (commentaire explicite).
- reco: Acceptable pour un launch V1 si tracké comme tel (il l'est, docs/PHASE_HISTORY.md Phase 12). Re-armer post-launch via le plan documenté l.405-410. Ne PAS le citer comme garde active.

### SYS-01 [DEBT-SPREAD] — artKeyword.upsert lit le tuple TypeORM RETURNING comme un array plat — clone latent du bug quota f74ce7de, avec test qui mocke le MAUVAIS shape
- confidence: verified
- evidence: museum-backend/src/modules/chat/adapters/secondary/persistence/artKeyword.repository.typeorm.ts:35-44 fait `const rows = await this.repo.query('INSERT ... ON CONFLICT ... RETURNING *', ...); return (rows as ArtKeyword[])[0];`. Or lib-docs/typeorm/LESSONS.md:7 + PATTERNS.md:390-394 + CLAUDE.md gotcha confirment que query('...RETURNING') renvoie le tuple `[rows[], rowCount]` pour INSERT/UPDATE/DELETE. Donc `(rows)[0]` retourne le tableau de rows interne `[row]`, PAS `row`. Le pattern correct est appliqué partout ailleurs : monthly-session-quota.repo.pg.ts:68-73 (`Array.isArray(result[0]) ? result[0] : result`), prune-support-tickets.ts:58, prune-reviews.ts:59, prune-stale-art-keywords.ts:64, lead.repository.pg.ts:17 lisent correctement result[0]/result[1]. SEUL artKeyword.upsert lit le shape brut sans garde. PIRE : tests/unit/chat/artKeyword.repository.test.ts:47 fait `repo.query.mockResolvedValue([mockRow])` (array PLAT) puis assert `result).toBe(mockRow)` (ligne 58) — le test verdit en mockant exactement le shape que PG ne renvoie jamais (fausse-confiance, même archetype que le bug quota qui mockait l'interaction).
- claim-vs-reel: CLAUDE.md gotcha dit 'Auditer les autres query("...RETURNING") raw' après le fix f74ce7de — cet audit n'a PAS attrapé artKeyword.upsert. Impact réel limité car le retour est fire-and-forget (chat-module.ts:649 `fireAndForget(artKeywordRepo.upsert(...))` jette la valeur), donc bug latent ; mais le code est faux et le test cimente le mauvais contrat.
- reco: Corriger en `const result = await this.repo.query(...); const rows = Array.isArray(result[0]) ? result[0] : result; return rows[0];` ET réécrire le mock du test pour le tuple PG réel `[[mockRow], 1]` (sinon le test re-verrouille le shape buggé). Ajouter une ESLint/ast-grep rule `(...query(...RETURNING...))[0]` comme pour no-typeorm-set-undefined.

### SYS-02 [DEBT-SPREAD] — Soft-delete deletedAt non filtré hors du login : forgotPassword émet des tokens à des comptes supprimés, registerUser/changeEmail laissent les comptes supprimés squatter leur email
- confidence: verified
- evidence: User.deletedAt est un `@Column` simple (user.entity.ts, cf LESSONS.md:33-38 + TD-TO-01 docs/TECH_DEBT.md:742) → aucun filtre auto TypeORM. user.repository.pg.ts:23-28 getUserByEmail/getUserById ne filtrent pas deletedAt. Le login EST protégé (authSession.service.ts:116,125 + 198,202 vérifient deletedAt+suspended post-fetch). MAIS : (a) forgotPassword.useCase.ts:27-37 récupère getUserByEmail, vérifie email_verified mais PAS deletedAt → émet un reset token (setResetToken L41) + email à un compte soft-supprimé ; (b) registerUser user.repository.pg.ts:39-42 bloque la ré-inscription si un compte (même soft-supprimé) a cet email ('existe déjà') ; (c) changeEmail.useCase.ts:38-41 bloque le changement vers un email tenu par un compte soft-supprimé ('already in use'). socialLogin.useCase.ts:101-109 est OK car authSessionService.socialLogin filtre en interne.
- claim-vs-reel: TD-TO-01 (TECH_DEBT.md:742-746) dit 'Only one site (admin.repository.pg.ts:113) does so explicitly. Future find() callsite forgetting the filter = leak' — mais le leak n'est PAS futur, il existe déjà sur 3 callsites (forgotPassword token issuance, registerUser+changeEmail email-squat). TD-TO-01 ne cite que la classe find() générique, pas ces manifestations concrètes.
- reco: Soit migrer vers @DeleteDateColumn + softRemove() (TypeORM auto-filtre, ferme la classe entière), soit a minima filtrer deletedAt dans forgotPassword (ne pas émettre de token à un compte supprimé) et exclure les soft-deleted des checks d'unicité email (registerUser/changeEmail) pour libérer l'email. Mettre à jour TD-TO-01 avec les 3 path:line réels.

### DEL-01 [DOCS] — V1_LOCKDOWN_LOTS.md — scratchpad de préparation entièrement exécuté, à DELETE (ou réduire à pointeur)
- confidence: verified
- evidence: docs/V1_LOCKDOWN_LOTS.md:1-3 'Statut: préparation (2026-05-21)... Aucune ligne de code écrite par cette passe'. Le doc contient 6 prompts /team copiés-collés pour des lots (sécurité/GDPR/feature-gates/...) tous exécutés depuis : docs/ROADMAP_AUDIT_TRAIL.md:10 'Tally 178 items... 93 done' + lignes 16-48 cochent P0.A1-B19/C1-C9 comme DONE/PARTIAL avec preuve code. Le seul lien live est docs/adr/ADR-051:80 qui cite '§D3' pour la décision DELETE de l'adapter (un seul §, archivable dans l'ADR). 288 lignes de prompts périmés.
- claim-vs-reel: Doc dit 'prêts à lancer / préparation' ; la réalité (ROADMAP_AUDIT_TRAIL + memoire dev launch-ready) est que tous les lots ont été lancés et mergés. C'est un plan consommé.
- reco: DELETE (git garde l'historique). Avant suppression, déplacer la seule phrase load-bearing (décision D3 = DELETE llama-prompt-guard) directement dans ADR-051 qui la cite déjà, pour ne pas orpheliner la référence.

### STALE-02 [DOCS] — Référence morte : docs/HANDOFF-2026-05-19-debt-collision-report.md n'existe pas mais est cité par 2 docs
- confidence: verified
- evidence: ls docs/HANDOFF-2026-05-19-debt-collision-report.md = 'No such file or directory'. find docs -iname '*handoff*' = vide. Pourtant cité dans docs/observability/METRIC_NAMING_AUDIT.md:11 'Reference: docs/HANDOFF-2026-05-19-debt-collision-report.md §5 Batch C' et docs/PHASE_HISTORY.md (grep confirme). Viole la doctrine projet feedback_doc_honesty_enforcement (tout path cité doit résoudre).
- claim-vs-reel: 2 docs pointent vers un fichier handoff supprimé (probablement absorbé lors du cleanup 2026-05-20).
- reco: TRIM : retirer/repointer les 2 références mortes (vers le contenu absorbé ou git log). Le sentinel roadmap-claim-resolves ne couvre que la roadmap, donc ces refs hors-roadmap ne sont pas attrapées automatiquement.

### STALE-03 [DOCS] — ADR-049 + PHASE_HISTORY Phase 14 : sous-sections décrivent garak comme un workflow LIVE alors qu'il est supprimé
- confidence: verified
- evidence: Le fichier .github/workflows/llm-security-garak.yml n'existe pas (ls = No such file). ADR-049 a un en-tête honnête (ADR-049:3 'Garak deferred V2.1' + Amendment :10-30 'workflow supprimé'), MAIS les sections postérieures le décrivent encore comme actif sans retrait : ADR-049:217 'Manual workflow_dispatch of llm-security-garak.yml produces...', :236 'First successful workflow run: TBD (Tech Lead fills at merge)'. Idem docs/PHASE_HISTORY.md:48-50 'Phase 14 — Garak REST swap' décrit la config détaillée sans noter la suppression 9j plus tard.
- claim-vs-reel: En-tête ADR-049 dit 'garak supprimé/deferred' ; le corps du même ADR (et Phase 14) le décrit comme un workflow opérationnel avec 'First run TBD at merge'.
- reco: TRIM : dans ADR-049 §75/§217/§236 et PHASE_HISTORY Phase 14, annoter explicitement '(workflow supprimé 2026-05-17, voir Amendment)' ou couper les détails opérationnels périmés. Garder la décision, supprimer la description d'un workflow inexistant.

### STALE-04 [DOCS] — OPS_DEPLOYMENT.md (1209 lignes) documente un déploiement staging absent en V1, sans aucun caveat
- confidence: verified
- evidence: docs/OPS_DEPLOYMENT.md:21-23 sections dédiées '14. Backend Staging Deploy / 15. Backend Migrations (Staging) / 16. Backend Staging Smoke Test', :65 '`preprod`/`staging` — staging backend + preview mobile builds', 32 occurrences de 'staging'. grep 'no staging|pas de staging|prod = stage' dans le doc = 0. Or memoire projet_no_staging_v1 (+ CLAUDE.md cohérent) : 'Pre-launch V1: prod = stage. No staging server until B2B revenue.'
- claim-vs-reel: Doc décrit un pipeline staging complet (3 sections) ; la doctrine V1 verifiée dit qu'il n'y a PAS de serveur staging avant revenu B2B.
- reco: TRIM : ajouter en tête un encart 'V1 = pas de staging (prod = stage), sections 14-16 = post-launch B2B' OU déplacer les sections staging dans une annexe 'post-launch'. Risque concret : un opérateur suit un runbook pour une infra inexistante.

### DUP-01 [DRY] — Pattern fetchWithTimeout re-fuité : unsplash + wikimedia clients hand-roll AbortController/setTimeout hors couverture du sentinel figé (IMP-1 confirmé)
- confidence: verified
- evidence: Helper canonique src/shared/http/fetch-with-timeout.ts (JSDoc l.13-16 liste les 3 SEULES divergences approuvées : replicate, siglip-onnx, llm-guard — PAS unsplash/wikimedia). Or src/modules/chat/adapters/secondary/search/unsplash.client.ts:15-46 (new AbortController + setTimeout(()=>...abort) + clearTimeout finally) et wikimedia-commons.client.ts:27-43 réimplémentent exactement le pattern ; wikimedia l.9 se documente 'Mirrors UnsplashClient pattern'. Le sentinel tests/unit/architecture/pr14-fetchWithTimeout-sentinel.test.ts:45 ne scanne QU'UN fichier (SWEPT_FILES=['presidio.adapter.ts']) → les 2 clients passent à travers, aucun n'a le commentaire de divergence requis (l.76).
- claim-vs-reel: learning/2026-05-28-weekly/A-dry-refactor.md PR-14 dit 'fetch+timeout manuel → fetchWithTimeout, 2 adapters' et le takeaway #1 affirme 'un codemod sans sentinel se re-pollue, le sentinel n'a aucun faux positif'. Réalité : le sentinel a un faux négatif structurel — il ne couvre pas unsplash/wikimedia, qui re-portent le pattern par copie.
- reco: Soit migrer unsplash.client.ts + wikimedia-commons.client.ts vers fetchWithTimeout, soit (si divergence légitime) ajouter le commentaire 'does NOT use `fetchWithTimeout`' + les inscrire dans DIVERGENT_FILES. Mieux : remplacer la liste SWEPT_FILES figée par un scan glob de tous les *.client.ts/*.adapter.ts qui font fetch, avec allow-list explicite — pour que tout NOUVEAU client soit couvert par défaut (corrige la classe IMP-1, pas juste l'instance).

### DUP-02 [DRY] — Frontend RN : logique de format-date locale dupliquée dans 7+ fichiers, alors que museum-web a déjà un helper i18n-format partagé
- confidence: verified
- evidence: FE sans helper partagé : features/chat/domain/carnet.ts:125-133 (formatDateLabel : new Date→NaN guard→toLocaleString→catch isoString), features/chat/domain/dashboard-session.ts:14-26 (formatSessionTime : même structure, fallback divergent 'Unknown time'), features/support/ui/ticketHelpers.ts:33-47 (formatDate/formatDateWithTime), features/chat/ui/bubbleSections/TtsSection.tsx:47 (toLocaleTimeString), features/chat/application/chatSessionLogic.pure.ts:262, features/paywall/ui/QuotaUpsellModal.tsx:125 (Intl.DateTimeFormat), features/settings/ui/SettingsAiConsentCard.tsx:86. À l'inverse museum-web/src/lib/i18n-format.ts:17-31 centralise formatDate/formatDateTime ET toutes les pages admin l'utilisent (grep inline toLocaleDateString dans src/app = 0).
- claim-vs-reel: CLAUDE.md gotcha 'ISO wire / Intl FE format' impose Intl.DateTimeFormat + useMemo keyed + try/catch fallback raw ISO — chaque site FE ré-implémente ce contrat à la main avec des fallbacks divergents (isoString vs 'Unknown time' vs raw), exactement le type de 'divergence silencieuse' que le doc DRY décrit.
- reco: Créer museum-frontend/shared/lib/formatDate.ts (équivalent du i18n-format.ts web) avec NaN-guard + try/catch + presets {dateShort, dateTime, time}, et migrer les 7 sites. Pas besoin de partage cross-app (RN vs DOM Intl), mais l'asymétrie web-factorisé/FE-éparpillé est le signal.

### DUP-03 [DRY] — Règle de longueur de mot de passe (8..128) dupliquée en BE-interne (Zod + validateur impératif) + FE, sans constante partagée — risque de drift sécurité
- confidence: verified
- evidence: Deux validateurs BE parallèles : src/shared/validation/password.ts:18-23 (length<8 / >128 impératif) ET src/modules/auth/adapters/primary/http/schemas/auth.schemas.ts:9,52,62 (.min(8).max(128) répété 3× dans le même fichier). FE museum-frontend/features/auth/ui/authFormSchema.ts:15 (.min(8) sans max). Magic numbers 8/128 hard-codés à ~6 endroits, aucune constante PASSWORD_MIN_LENGTH/MAX partagée.
- claim-vs-reel: Le doctrine DRY (learning A) insiste sur 'code de sécurité répliqué → un correctif doit être appliqué à N endroits' ; ici si NIST/policy bumpe le minimum, 4+ sites BE + FE doivent changer en sync, et les 2 validateurs BE peuvent diverger (rejet incohérent entre endpoints).
- reco: Extraire PASSWORD_MIN_LENGTH=8 / PASSWORD_MAX_LENGTH=128 dans shared/validation, faire dériver le Zod schema (z.string().min(PASSWORD_MIN_LENGTH)...) et validatePassword() de la même constante. Idéalement un seul validateur (le Zod) consommé partout, supprimer le doublon impératif si redondant.

### DUP-04 [DRY] — Décision de tenant-scope museum_manager ré-implémentée inline dans admin.route.ts malgré le helper computeTenantScope, avec message 403 divergent
- confidence: verified
- evidence: Helper canonique src/shared/authz/tenant-scope.ts:28-41 (forbidden('No museum assigned')). admin.route.ts l'appelle bien 4× (l.435,466,494,525) MAIS réimplémente la branche inline 2× : /stats l.263-266 (if role==='museum_manager' → museumId??undefined) et /nps l.307-313 (if museumId==null → throw forbidden('Museum scope required')). Le message 403 diverge : helper='No museum assigned' vs inline='Museum scope required'.
- claim-vs-reel: La divergence est partiellement assumée (JSDoc admin.route.ts:283-294 explique que /nps lève le 403 'inline' vs /stats dans le useCase) — donc PAS de la dup négligente. Mais la branche 'if museum_manager' + le throw 403 restent du copier-coller avec un message qui drift, ce que le helper était censé unifier.
- reco: Faire passer /nps par computeTenantScope (qui throw déjà le 403) au lieu du throw inline, et aligner le message. Pour /stats, si le threading du queryMuseumId est voulu, encapsuler la branche 'manager forced scope' dans un mini-helper plutôt que de répéter la condition de rôle.

### KISS-01 [KISS] — TenantRateLimiter : primitive instanciée, exposée via getter, mais .acquire() jamais appelé (dead speculative B2B infra)
- confidence: verified
- evidence: museum-backend/src/modules/chat/adapters/secondary/guardrails/tenant-rate-limiter.ts:1-4 header dit littéralement « V1: primitive only, NOT wired. Mounted Phase 2 (B2B onset) ». chat-module.ts:733 instancie `this._tenantRateLimiter = new TenantRateLimiter(...)` avec callback Prometheus `tenantRateLimitRejectsTotal`. chat-module.ts:385 `getTenantRateLimiter()` — grep prouve ZÉRO appelant de ce getter et ZÉRO appel `.acquire()` sur cette instance (les seuls `.acquire()` du repo sont nominatim.client.ts:124/218 et llm-guard semaphore, objets distincts). env.ts:495-498 réserve même un bloc config `tenantRateLimit` (capacity/refillPerSecond).
- claim-vs-reel: Le header proclame une primitive « stable surface pour Phase 3 Redis swap » utile ; la réalité = 112 lignes + bloc env + métrique + getter mort, pour une feature multi-tenant B2B que CLAUDE.md déclare « hypothèse future, aucun musée démarché ».
- reco: Enterrer (UFR-016 « il est mort on l'enterre ») : supprimer la classe, le getter, le bloc env tenantRateLimit, la métrique tenantRateLimitRejectsTotal et le `new TenantRateLimiter` du composition root. Git garde l'historique ; ré-introduire au vrai onset B2B (V2+).

### KISS-02 [KISS] — Triple gating indépendant du coût LLM (per-user Redis cap + circuit breaker global cents + budget judge) — 3 mécanismes pour le même risque
- confidence: verified
- evidence: (1) museum-backend/src/shared/llm-cost-guard/llm-cost-guard.ts:80-168 `LlmCostGuard` = cap USD/jour PAR utilisateur via Redis counter (redis-llm-cost-counter.ts), monté en middleware (chat-message.route.ts:191 `llmCostGuard`). (2) museum-backend/src/modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker.ts:66-68 `LlmCostCircuitBreaker` = cap GLOBAL $50/h + $500/jour, câblé langchain.orchestrator.ts:113 `recordCharge`. (3) le LLM-judge a son propre budget `guardrail-budget` $5/jour (CLAUDE.md AI Safety §5). Les 3 protègent la dépense LLM.
- claim-vs-reel: env.ts:488-494 admet : « 2026-05-13 — 100k-clients scalability primitives ... Defaults from CAPACITY_PLAN_100K.md ». C'est de l'infra dimensionnée 100k MAU sur un produit pre-launch à 0 utilisateur.
- reco: Pas tout faux (per-user cap = anti-abus légitime), mais le circuit breaker cost GLOBAL ($500/j) + per-user ($x/j) + judge ($5/j) est redondant au launch. Garder le per-user cap + kill-switch (simple, suffisant) ; reporter le `LlmCostCircuitBreaker` hourly/daily-cents global à l'apparition d'un vrai volume. Documenter l'ordre de préséance pour éviter les surprises 402/503 croisées.

### KISS-03 [KISS] — Module leads B2B complet (outbox + cron redelivery + backoff exponentiel + retention) pour un funnel B2B à zéro musée contracté
- confidence: verified
- evidence: museum-backend/src/modules/leads/ : useCase/redeliverPendingLeads.useCase.ts, jobs/leads-redelivery-cron.registrar.ts, submitB2bLead/submitBetaSignup/submitPaywallInterest.useCase.ts, domain/lead/lead.entity.ts + repo. env.ts:511-523 config `leads` : redeliveryCronPattern, maxAttempts:5, backoffBaseMs:60_000→backoffCapMs:3_600_000 (exponentiel 60s→1h), retentionDays:90. Mémoire projet `project_roadmap_b2b_claims_false.md` : « zero museums approached ».
- claim-vs-reel: Pattern outbox transactionnel + redelivery résilient = pattern enterprise pour un flux de leads à fort volume / SLA livraison. Le volume réel de leads B2B au launch = quasi nul (aucun musée démarché). Le beta/paywall-interest signup justifie un stockage simple, pas un outbox+backoff complet.
- reco: Le stockage persistant des leads est sain ; le cron redelivery + backoff exponentiel + cap terminal est du gold-plating pour le volume actuel. Garder submit + persist ; simplifier la redelivery à un retry best-effort, ou la gate derrière un flag d'activation B2B réel.

### LESS-01 [LESSONS] — pg/LESSONS.md recommande vector_cosine_ops — contredit le code réel (halfvec_ip_ops) ET CLAUDE.md
- confidence: verified
- evidence: lib-docs/pg/LESSONS.md (section pgvector halfvec) dit verbatim: « Index operator class must be vector_cosine_ops (or the corresponding halfvec_*_ops if available) ». Le code réel museum-backend/src/data/db/migrations/1778406339944-AddArtworkEmbeddings.ts:78 utilise `USING hnsw ("embedding" halfvec_ip_ops)`. CLAUDE.md §Pièges connus avertit explicitement que vector_cosine_ops est INCOMPATIBLE avec halfvec (« operator class does not exist »). La LESSONS pointe donc vers la classe d'op exacte qui casserait la migration.
- claim-vs-reel: LESSONS.md: 'use vector_cosine_ops' / Code+CLAUDE.md: vector_cosine_ops est incompatible halfvec, le code utilise halfvec_ip_ops
- reco: Corriger lib-docs/pg/LESSONS.md pour dire que la classe DOIT être halfvec_ip_ops (inner-product, vecteurs L2-normalisés) et que vector_cosine_ops lève 'operator class does not exist' sur halfvec — aligner sur CLAUDE.md et le code. Le code est correct ; c'est la doc-leçon qui est dangereuse.

### MEM-01 [MEMORY] — project_maestro_handoff_2026-06-02 explicitement superseded → DELETE
- confidence: verified
- evidence: project_maestro_handoff_2026-06-02.md:1-35 est un 'handoff repartir propre' daté 06-02. project_maestro_landed_2026-06-02.md:10 dit textuellement « Clôt le handoff [[project_maestro_handoff_2026-06-02]] » et :1-25 prouve que dev a été assaini + maestro landé (933509cd). project_maestro_android_shards_2026-06-04.md:16-22 démonte en plus les 3 prémisses du handoff (deep-link, testID, quota) comme des MISDIAGNOSES. Vérifié git : 933509cd est ancestor de origin/dev, 1357586b (le 'stale #308' du handoff) a disparu.
- claim-vs-reel: Le handoff décrit dev CASSÉ + maestro BLOQUÉ non-poussé ; la réalité (origin/dev HEAD 4272b8db, 933509cd + 4738f7ad présents) est que tout est landé et assaini.
- reco: DELETE project_maestro_handoff_2026-06-02.md. Remplacé par maestro_landed (assainissement + landing) puis maestro_android_shards (phase 2/3). Retirer la ligne d'index correspondante (MEMORY.md:24).

### MEM-02 [MEMORY] — project_remediation_roadmap_2026-06-07 s'auto-déclare supplanté + décisions D3/D6 contredites par le code → DELETE ou MERGE
- confidence: verified
- evidence: project_remediation_roadmap_2026-06-07.md:12 « la source citée docs/ROADMAP_REMEDIATION_2026-06-07.md n'existe PAS … a été supplantée … le suivi par vagues A-N n'est plus la source de vérité ». D3 (:26) dit 'Stryker prio HAUTE V1' mais ci-cd-backend.yml:411 est toujours `if: false` et project_launch_readiness_2026-05-31.md:14 le requalifie en différé V1.0.x. D6 (:29) dit 'enterrement Reranker ~700 LOC' mais le code est VIVANT : museum-backend/src/modules/chat/domain/ports/reranker.port.ts + bge-reranker-v2-m3.adapter.ts existent (commit dev 64fab9af 'feat(C9.13): green — RerankerPort').
- claim-vs-reel: La memory présente une roadmap+décisions comme référence ; le code montre D3 non-exécuté (Stryker off) et D6 inversé (Reranker non enterré, ré-introduit).
- reco: DELETE (la memory pointe une source inexistante et son suivi est mort). Si on garde une trace des décisions lockées D1/D2 (Langfuse subclass, DPO interne), les MERGE dans project_launch_readiness comme 2 lignes. Ne PAS garder D3/D6 (faux).

### MEM-03 [MEMORY] — project_cartographie_360_2026-05-31 désormais stale sur 2 de ses 3 'piliers désarmés' (vérifié code actuel)
- confidence: verified
- evidence: La memory (:16-17) flagge 3 piliers : (a) Stryker `if:false` — TOUJOURS VRAI : ci-cd-backend.yml:411 `if: false`. (b) Maestro faux-vert (maestro-summary always() sans fail) — CORRIGÉ : ci-cd-mobile.yml:563-564 `core.setFailed(...)` + :572-576 'Fail if any shard did not succeed' `exit 1`. (c) frozen-test honor-system (jamais en PostToolUse) — CORRIGÉ : .claude/settings.json:41-48 PostToolUse matcher 'Edit|Write' câble bien `post-edit-green-test-freeze.sh`.
- claim-vs-reel: La memory affirme 3 piliers désarmés ; le code actuel en a réarmé 2 (Maestro fail-gate + frozen-test hook). Seul Stryker reste off.
- reco: UPDATE : ajouter un encart en tête « 2 des 3 piliers réarmés depuis (Maestro fail-gate ci-cd-mobile.yml:564/576, frozen-test settings.json:47) ; reste Stryker if:false ». Sinon une lecture future re-traitera des P0 déjà fermés. NE PAS supprimer (le verdict 70/100 + benchmark restent la baseline de référence).

### MEM-04 [MEMORY] — Deux fichiers existent mais sont ABSENTS de l'index MEMORY.md
- confidence: verified
- evidence: Diff répertoire↔index : feedback_audit_full_reverify_tree_aggregate.md (lu, 9j, doctrine audit-scale valide :10-20) et feedback_zero_branch_switch_worktree_only.md (lu, 2j, doctrine worktree-only active :10-18) existent sur disque mais `grep '(<fichier>)' MEMORY.md` ne les trouve pas. 70 fichiers .md, 68 liens d'index uniques → 2 manquants.
- reco: ADD les 2 entrées : feedback_zero_branch_switch_worktree_only sous § Doctrine (proche de feedback_no_git_stash_multi_agent / worktree_commit_churn) ; feedback_audit_full_reverify_tree_aggregate sous § Doctrine. Sans entrée d'index ces règles ne seront jamais re-chargées.

### MEM-05 [MEMORY] — 6 wikilinks cassés (hyphen-vs-underscore + cibles inexistantes)
- confidence: verified
- evidence: Scan `[[...]]` sur tous les .md : [[feedback-aggressive-doc-prune]] et [[feedback-zero-bypass]] (hyphens) dans project_remediation_roadmap_2026-06-07.md:31,35 + feedback_doc_honesty_enforcement.md ; [[project-remediation-roadmap-2026-06-07]] (le frontmatter `name:` de ce fichier utilise des hyphens alors que le fichier est en underscores) ; [[reference-tts-phase-span-pattern]] dans feedback_phase_span_dual_path_emit.md ; [[sentinel-cache-key-parity-redis-host]] dans feedback_zero_bypass.md ; [[ufr-020-hook-bypass-interdit]] dans feedback_aggressive_doc_prune.md. Aucun fichier correspondant n'existe.
- claim-vs-reel: Les memories citent des liens internes qui ne résolvent pas → navigation morte.
- reco: FIX : remplacer hyphens→underscores ([[feedback_aggressive_doc_prune]], [[feedback_zero_bypass]]) ; supprimer/repointer les 3 cibles inexistantes (tts-phase-span, sentinel-cache-key-parity, ufr-020-hook-bypass-interdit → pointer CLAUDE.md § Hook bypass interdit). Corriger le frontmatter `name:` de project_remediation_roadmap (hyphens) si la memory est conservée.

### AUDIT-02 [OWN-LIBS] — Le test audit-chain réplique le bug AUDIT-01 dans son assertion → bug structurellement invisible
- confidence: verified
- evidence: museum-backend/tests/unit/audit/audit-chain.test.ts:145-154 — le test recalcule l'attendu via `JSON.stringify(metadata, Object.keys(metadata).sort(...))`, c.-à-d. la MÊME ligne buggée que la source. Tous les cas de test n'utilisent QUE du metadata plat ({a:1,b:2}, {foo:'bar'}, {alpha,beta,gamma} — lignes 72,82,122,145). Aucun test ne passe d'objet imbriqué. grep `provider: {` sur museum-backend/tests = 0 résultat. Donc le bug n'est gardé par aucun test, et le test qui réplique la sérialisation gèlerait le bug même si la source était corrigée.
- reco: Ne pas dériver l'attendu depuis la même implémentation ; coder l'attendu en dur (golden string) et ajouter un cas metadata imbriqué non-trivial.

### CIRCUIT-01 [OWN-LIBS] — ThreeStateCircuit : fuite de probe HALF_OPEN — aucun timeout/recovery, lock-out permanent possible
- confidence: verified
- evidence: museum-backend/src/shared/circuit-breaker/three-state-circuit.ts:129-136 (canAttempt décrémente availableProbes) + 96-114 (le getter `state` ne transitionne QUE OPEN→HALF_OPEN ; aucune logique de sortie de HALF_OPEN hormis recordOutcome). Les SEULES sorties de HALF_OPEN sont recordOutcome('success')→CLOSED (l.146-155) et recordOutcome('failure')→OPEN (l.160-162). Si une probe est consommée par canAttempt() mais qu'aucun outcome n'est jamais enregistré (exception entre la consommation et l'enregistrement), avec halfOpenMaxProbes=1 (défaut l.72) le breaker reste bloqué en HALF_OPEN avec availableProbes=0 → canAttempt() renvoie false indéfiniment, plus jamais ni CLOSED ni OPEN. Chemin réel à risque : langchain.orchestrator.ts:168 consomme la probe via checkCostBreakerOrThrow, puis maybeRecordHalfOpenProbeFailure n'est appelé qu'en l.366, APRÈS buildSectionTasks (l.351) et runSectionTasks (l.353) ; si l'un des deux throw, la probe est perdue. Le commentaire l.372 affirme que les erreurs de section sont avalées, mais ce n'est pas garanti par la primitive elle-même.
- reco: Ajouter au primitive un probe-timeout (re-OPEN si une probe en vol n'a pas d'outcome après openDurationMs) OU restaurer la probe sur le chemin d'exception côté orchestrateur (try/finally autour de runSectionTasks récupérant la probe). Tester explicitement le scénario probe-consommée-sans-outcome.

### SCRUB-01 [OWN-LIBS] — sentry-scrubber : scrubRecord ne nettoie pas les URL (token en query-string) dans des valeurs string sous clé non-sensible (extra/data)
- confidence: verified
- evidence: packages/musaium-shared/src/observability/sentry-scrubber.ts:122-135 — scrubRecord ne redige QUE quand la CLÉ matche SENSITIVE_FIELD_REGEX ; pour une string-valeur, il la renvoie telle quelle (l.134) sans jamais appeler scrubUrl. Seul le bloc `tags` (l.233-245) applique isUrlLikeValue+scrubUrl sur les VALEURS. Donc `event.extra.callbackUrl = 'https://x?token=abc'` (clé 'callbackUrl' non couverte par le regex) fuite le token. Confirmé par les tests : sentry-scrubber.test.ts:304/334 ne testent extra QUE via clés sensibles ({body:{password:REDACTED}}) ; aucun test d'URL-token sous clé non-sensible dans extra (alors que scrubUrl, scrubEvent-tags, et request.url SONT testés, l.152-247).
- claim-vs-reel: Le scrubber se présente comme la single source of truth de redaction PII cross-runtime ; en pratique le scrub d'URL n'est appliqué qu'à request.url et aux tags, pas aux valeurs string de extra/data/contexts.
- reco: Dans scrubRecord, après la branche clé-sensible, tester isUrlLikeValue(value) et appliquer scrubUrl sur les valeurs string. Ajouter un cas test extra.<cléNonSensible> = URL-avec-token.

### RMAP-01 [ROADMAP] — seed-pilot-museums.sh seede Louvre/Orsay/Pompidou (terme 'pilot' partout) — incohérent avec le narratif B2B et avec les musées Bordeaux documentés
- confidence: verified
- evidence: scripts/seed-pilot-museums.sh:4 'orchestrator for the 3 pilot museums (Louvre, Orsay, Pompidou) used for the launch weekend test' ; :59-63 PILOT_QIDS=[louvre]=Q19675 [orsay]=Q23402 [pompidou]=Q193554 ; :65-69 PILOT_LABELS. AUCUN de ces 3 musées n'est seedé par museum-backend/scripts/seed-museums.ts (qui contient Aquitaine Q3329534:114, CAPC Q2945071:124, Cité du Vin Q16964634:134, Pont de Pierre Q1773424:151). Le script appelle pourtant `seed-museums.ts` (l.148) qui ne crée pas ces lignes, puis `catalog-ingest --museum=Q19675/...` sur des QID jamais insérés.
- claim-vs-reel: North Star (ROADMAP_PRODUCT.md:26) dit '0 musée démarché, les 3 musées Bordeaux = données de démo'. Mais le launch-ritual script cible Louvre/Orsay/Pompidou avec un vocabulaire 'pilot'/'launch weekend test' — soit le script est mort/incohérent (cible des musées non-seedés), soit il réintroduit le vocabulaire 'pilot' que le cleanup honnêteté était censé purger. L'audit-trail P0.C4 prétend 'seed-pilot-museums.sh ... orchestrator for 3 pilots' sans signaler qu'il cible Louvre/Orsay/Pompidou et non le trio Bordeaux.
- reco: Soit supprimer/enterrer le script (UFR-016 dead-code, il cible des QID jamais seedés), soit le renommer + repointer sur les vrais QID Bordeaux et retirer le terme 'pilot'/'launch weekend test'. Corriger l'audit-trail P0.C4 pour refléter le contenu réel.

### RMAP-03 [ROADMAP] — ROADMAP_TEAM.md : note 2026-05-20 prétend un roster de 9 agents (dont verifier, learning-curator, doc-fetcher, doc-curator) ; sur disque il y en a 6
- confidence: verified
- evidence: docs/ROADMAP_TEAM.md:17 'le roster agents est passé à 9 : architect, editor, verifier, security, reviewer, documenter, learning-curator (T2.1), doc-fetcher + doc-curator (UFR-022)'. Réel sur disque : .claude/agents/ = architect.md, doc-cache.md, documenter.md, editor.md, reviewer.md, security.md (6, + shared/). PAS de verifier.md, learning-curator.md, doc-fetcher.md, doc-curator.md. La mémoire projet (commit 1535abe0) confirme l'élagage 9→6 (doc-cache = merge doc-fetcher+doc-curator, learning-curator+verifier retirés). Aucune correction plus bas dans le fichier (grep 'V13 acquis' l.35 ne corrige pas le compteur).
- claim-vs-reel: Le doc /team annonce 9 agents nommés ; le code en a 6 différents. La prune réelle vers 6 n'est jamais reflétée dans ROADMAP_TEAM.md.
- reco: Réécrire la note l.17 : roster réel = 6 (architect, editor, security, reviewer, documenter, doc-cache). Mentionner que verifier/learning-curator retirés et doc-fetcher+doc-curator fusionnés en doc-cache.

### RMAP-04 [ROADMAP] — Pilier qualité 'Stryker mutation gate désarmé (if:false)' absent de la posture risque de la roadmap produit (GO_WITH_RISKS)
- confidence: verified
- evidence: .github/workflows/ci-cd-backend.yml:411 `if: false` (job `mutation`), commentaire l.397-403 '⚠️ DISABLED ... NOT a gate today ... do not cite it as an active guard'. Disclosure honnête dans docs/PHASE_HISTORY.md:38 (retrait explicite de l'ancien wording faux 'enforced in CI nightly'). MAIS grep dans ROADMAP_PRODUCT.md/AUDIT_TRAIL.md/TEAM/FE_RN : 0 occurrence du fait que la mutation testing est désarmée ; ROADMAP_PRODUCT.md:65 ne cite Stryker que comme 'stryker cache dé-tracké' (cleanup dead-code P0.D2).
- claim-vs-reel: La roadmap produit présente un verdict 'GO_WITH_RISKS' avec une posture qualité large (P0.D 'Honnêteté', P0.F plateforme) sans jamais surfacer qu'un des 3 piliers qualité (mutation testing) est désactivé. La vérité existe (PHASE_HISTORY.md, commentaire workflow) mais n'irrigue pas la source-de-vérité produit que /team lit en début de sprint.
- reco: Ajouter une ligne explicite dans la section V1.0.x ou la posture risque de ROADMAP_PRODUCT.md : 'Stryker mutation gate = if:false (désarmé depuis 2026-05-09), re-arm post-launch' — déjà tracé PHASE_HISTORY.md:38.

### PILLAR-03 [TESTS] — Frozen-test reste honor-system: le hook PostToolUse skip si RUN_ID absent de l'env
- confidence: verified
- evidence: .claude/skills/team/team-hooks/post-edit-green-test-freeze.sh:21,110-113 — `RUN_ID="${RUN_ID:-}"` puis `if [ -z "$RUN_ID" ]; then echo "...skip"; exit 0`. Le hook est bien enregistré PostToolUse matcher Edit|Write (.claude/settings.json:43-48), MAIS un Edit normal d'agent ne porte pas RUN_ID dans l'env du sous-process hook. L'enforcement RÉEL est l'étape manuelle que l'orchestrateur (un agent Claude) est censé lancer après chaque edit: SKILL.md:302 `RUN_ID=$RUN_ID .claude/.../post-edit-green-test-freeze.sh`.
- claim-vs-reel: CLAUDE.md présente le frozen-test comme "verrouillage anti-bypass" via hook automatique byte-for-byte. Réalité: le hook auto se neutralise (exit 0) hors d'un contexte où RUN_ID est exporté; le gel effectif dépend de l'orchestrateur qui exécute fidèlement l'étape explicite — c'est l'honor-system que la cartographie-360 pointait, structurellement inchangé.
- reco: Faire dériver RUN_ID par le hook lui-même (lire le dernier team-state/*/state.json status=green le plus récent) au lieu de dépendre d'une var d'env que le harness ne propage pas aux hooks de sous-agents; ou documenter honnêtement que le gel est orchestrateur-dépendant, pas hook-garanti.

### TQ-02 [TESTS] — Sentinel screen-test-coverage (UFR-021) ne peut PAS imposer le tap-through — match purement textuel
- confidence: verified
- evidence: scripts/sentinels/screen-test-coverage.mjs:192-219 `findCoverage` — un écran est "couvert" si un flow CONTIENT un testID literal (cases a), le route path (b) ou le magic-comment `# screen: <Name>` (c). Aucune vérification que le flow TAP réellement ce testID ou exécute un submit/CTA. La doctrine CLAUDE.md UFR-021 exige pourtant "tap-through the happy path — 's affiche' ne compte PAS".
- claim-vs-reel: Le sentinel "enforce" UFR-021 mais ne contrôle que la PRÉSENCE textuelle d'un ancre, pas l'action. Un flow qui mentionne un testID en commentaire est neutralisé (stripYamlComments l.158-175, bon), mais un flow qui mentionne le testID dans une assertion `visible:` purement passive compte comme couvert — le 'affiche sans crasher' que la doctrine interdit reste accepté.
- reco: Documenter explicitement que ce sentinel est une condition NÉCESSAIRE non suffisante (présence d'ancre), et que la qualité tap-through reste une discipline de revue; ou enrichir le parser pour exiger qu'au moins un `tapOn:` cible un testID/route de l'écran.

### TQ-03 [TESTS] — modal-paywall-quota-upsell.yaml: faux-vert sur le binaire Release CI — la modale n'est jamais tapée
- confidence: verified
- evidence: .maestro/modal-paywall-quota-upsell.yaml:91-114 — tout le bloc d'interaction modale est dans `runFlow: when: visible: id: quota-upsell-modal`. Le header (l.4-8) admet: sur un Release bundle (le binaire CI) la route (dev) redirige Home, la modale n'ouvre jamais, "this whole block is skipped (the flow still passes)". Le flow ne teste alors QUE le login.
- claim-vs-reel: Le flow est nommé/documenté comme la couverture UFR-021 de QuotaUpsellModal (`# screen: QuotaUpsellModal` l.9). En CI Release il ne tape jamais quota-upsell-email/consent/submit/dismiss (testIDs présents dans features/paywall/ui/QuotaUpsellModal.tsx:202-234). La modale paywall est de facto non-testée e2e en CI.
- reco: Construire un binaire de test qui expose la route (dev) (developmentClient/__DEV__=true) OU déclencher la modale via le vrai chemin 402 (quota épuisé seeded) au moins en nightly, pour que l'interaction soit réellement exercée — sinon retirer la prétention de couverture du header.

### TYPE-01 [TYPE] — BE: règles type-safety ESLint DÉSACTIVÉES (off, pas warn) à la frontière DB/LLM — couplé à l'absence de noUncheckedIndexedAccess
- confidence: verified
- evidence: museum-backend/eslint.config.mjs:387-411 — override `files: ['src/modules/*/adapters/primary/http/**/*.route.ts','src/modules/*/adapters/secondary/**/*.ts','src/modules/*/infrastructure/**/*.ts','src/data/db/**/*.ts','src/shared/audit/**/*.ts']` met no-unsafe-assignment/member-access/call/argument/return ET no-explicit-any à `'off'`. museum-backend/eslint.config.mjs:456-461 fait pareil pour `src/shared/observability/**`. Ce sont EXACTEMENT les fichiers qui parsent les rows DB et les réponses LLM. Combiné à museum-backend/tsconfig.json (PAS de noUncheckedIndexedAccess, absent du fichier) : ni compilo ni lint ne couvrent ces chemins. Preuve d'exposition concrète : museum-backend/src/modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg.ts:295 `return Number(rows[0].count);` — `rows[0]` typé non-undefined alors qu'un refactor vers une requête à 0 ligne ne serait pas attrapé (comparer à :287 qui guarde `rows.length === 0`). museum-backend/src/shared/middleware/monthly-session-quota.repo.pg.ts:73 `const row = rows[0];` sûr seulement grâce au guard manuel ligne 72.
- claim-vs-reel: L'override se justifie en commentaire (l.384-386 'interface with untyped externals') — légitime pour relâcher no-unsafe en `warn`, mais le passer à `off` complet + l'absence de noUncheckedIndexedAccess laisse la frontière la plus critique (DB+LLM, ce que touche le BE) SANS aucun filet statique, alors que FE/WEB ont noUncheckedIndexedAccess:true. La discipline réelle du code (guards manuels, type predicates) compense aujourd'hui mais rien ne l'enforce pour le futur.
- reco: Activer `noUncheckedIndexedAccess: true` dans museum-backend/tsconfig.json (rendra `rows[0]` de type `T | undefined`, forçant les guards déjà présents à devenir compiler-checked ; auditer le delta tsc, probablement faible vu la discipline existante). Et remonter les no-unsafe-* de `'off'` à `'warn'` sur l'override frontière (le lint BE tourne déjà avec --max-warnings=0, donc warn = bloquant) — accepter quelques eslint-disable justifiés ponctuels plutôt qu'une exemption en bloc de répertoires entiers.

### TYPE-02 [TYPE] — WEB: lint sans --max-warnings=0 → no-explicit-any et no-unsafe-* sont des warnings NON bloquants
- confidence: verified
- evidence: museum-web/package.json `"lint": "eslint src/ --cache ... && tsc --noEmit"` — PAS de `--max-warnings=0` (comparer à museum-backend/package.json et museum-frontend/package.json qui l'ont tous deux). museum-web/eslint.config.mjs:31 active `strictTypeChecked` mais l.119 `no-explicit-any:'warn'`, l.126-130 no-unsafe-*:'warn'. .github/workflows/ci-cd-web.yml:64 `run: pnpm run lint` → la CI WEB exécute ce lint non-strict. Donc tout nouveau `as any` / flux unsafe passe la CI silencieusement.
- claim-vs-reel: Le code WEB prod actuel est propre (as any=0 vérifié ; le seul `as unknown` prod, museum-web/src/components/admin/ExportCsvButton.tsx:80, est justifié + accès runtime-safe via optional chaining ; useFetchData.ts:114-119 utilise des type guards corrects). Mais l'état propre tient par discipline, pas par enforcement — l'asymétrie avec BE/FE (qui bloquent) est une régression-en-attente.
- reco: Aligner museum-web/package.json sur les deux autres apps : ajouter `--max-warnings=0` au script lint. Au minimum remonter no-explicit-any à 'error' globalement (laisser no-unsafe-* en warn si bruit Next.js trop fort, mais alors avec --max-warnings=0 pour les rendre bloquants).


---

# LOW

### AISAN-02 [AI-SANITIZATION] — Le message utilisateur est persisté en BRUT (PII non masquée) en base, distinct de l'egress IA
- confidence: verified
- evidence: museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts:319 — `await this.repository.persistMessage({ sessionId, role: 'user', text, imageRef })` persiste `text` BRUT (le `sanitizedText` n'est calculé qu'ensuite à chat-message.service.ts:284 pour l'orchestrateur et la clé de cache). La PII (email/téléphone tapée par l'utilisateur) est donc stockée en clair dans chat_messages. C'est la donnée propre de l'utilisateur, effaçable RGPD (deleteAccount.useCase.ts existe), donc impact limité — mais à distinguer de la doctrine 'la PII ne touche jamais l'egress' : ici elle touche le stockage interne.
- claim-vs-reel: Aucune doc ne prétend masquer le message brut en base ; signalé pour exhaustivité (PII-at-rest, pas egress IA tiers).
- reco: Acceptable en l'état si la rétention/erasure RGPD couvre chat_messages. Vérifier que deleteAccount efface bien les chat_messages de l'utilisateur (non audité ici en détail).

### AISAN-03 [AI-SANITIZATION] — L'IP brute est transmise au contexte d'audit (chaîne de hash en base) — hashée uniquement côté friction/cache
- confidence: verified
- evidence: museum-backend/src/modules/chat/useCase/guardrail/guardrail-escalation.ts:136,173,200 passent `ip: audit.ip` (IP BRUTE) dans le GuardrailAuditContext → guardrail-audit-payload.ts:65 `ip: context?.ip ?? null` écrit en base d'audit. À l'inverse, la friction store hashe correctement (guardrail-friction.store.ts:67 hashIp = sha256, commentaire 'No raw IP ever reaches a key'). L'IP brute en audit sécurité est un usage standard/justifiable, mais c'est de la PII-at-rest.
- reco: Standard pour un audit sécurité (corrélation forensique). Documenter la rétention de l'IP dans l'audit ; sinon hasher comme la friction store.

### ARCH-05 [ARCH-PATTERNS] — Couplage cross-module application→application : chat/useCase importe DbLookupService (classe concrète) de knowledge-extraction/useCase
- confidence: verified
- evidence: museum-backend/src/modules/chat/useCase/message/chat-message.service.ts:58, .../orchestration/chat.service.ts:53, .../orchestration/prepare-message.pipeline.ts:37, .../enrichment/enrichment-fetcher.ts:11 — tous `import type { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service'`. `DbLookupService` est une CLASSE concrète (db-lookup.service.ts:12 `export class DbLookupService`), pas un port d'interface. Le couplage est type-only (utilisé comme `dbLookup?: DbLookupService` chat-message.service.ts:111), donc pas de dépendance runtime, mais c'est un module application qui dépend du type d'un autre module application au lieu d'un port domain partagé.
- reco: Pour rester strict hexagonal : exposer une interface/port (ex `DbLookupPort` dans un domain partagé) et que chat/useCase dépende du port, knowledge-extraction fournissant l'impl via la composition root. Faible priorité (type-only, pas de cycle runtime) — à traiter post-launch si la séparation modulaire devient un objectif.

### ARCH-06 [ARCH-PATTERNS] — Les « tests d'architecture » backend sont des sentinels PR-spécifiques, pas une fitness-function de couches
- confidence: verified
- evidence: museum-backend/tests/unit/architecture/ contient 10 fichiers, tous nommés `prN-<feature>-sentinel.test.ts` (ex pr6-dead-code-burial.test.ts:93-126 grep l'absence de 2 fichiers morts ; pr8-paginate, pr9-assertPasswordReauth, pr13-circuit-breaker-purity, etc.). Ils codifient des contrats de forme-de-code spécifiques à des PR passées (UFR-022 red-phase). AUCUN ne teste l'invariant générique « domain n'importe pas adapters/useCase » — cet invariant repose entièrement sur boundaries (désarmé, ARCH-01). Vérifié par lecture de pr6 (intégral) + grep des 10 noms/contenus.
- claim-vs-reel: L'existence d'un dossier tests/unit/architecture/ pourrait laisser croire à un test de couches hexagonal générique. Réalité : ce sont des sentinels ad-hoc ; le test de couches générique BE n'existe que sous forme de règle ESLint morte.
- reco: Ajouter un sentinel fs-based générique côté BE (sur le modèle FE ARCH-03) : walk src/modules/*/domain, fail si un import résout vers /adapters/ ou /useCase/. Indépendant de boundaries (qui peut re-casser silencieusement), il fournirait un filet déterministe. Attraperait immédiatement ARCH-02.

### ARCH-09 [ARCH-REG] — RGPD Art.22 : non-applicable correctement argumenté, endpoint explanation pré-implémenté et câblé (pas un stub)
- confidence: verified
- evidence: museum-backend/src/modules/chat/adapters/primary/http/explanation.controller.ts:17-43 (handler réel, requireUser, cross-tenant→404), monté chat.route.ts:56 ('/messages/:id/explanation'), use-case get-message-explanation.use-case.ts:120-160 (logique réelle: extractDecision/category/recourse/auditRef, i18n getExplanationStrings, pas stub). Doc GDPR_ART22_SCOPE.md:12 argumente Art.22 non-déclenché (refus conversationnel retriable, pas d'effet légal/significatif) — analyse juridiquement solide (cite CJEU SCHUFA C-634/21, EDPB WP251).
- reco: Aucune ; sur-conformité utile (anchor best-practice anti-SCHUFA + AI Act Art.14/50 spirit). Le doc liste correctement les triggers de re-classification (auto-suspension sur N blocks, etc.).

### ARCH-10 [ARCH-REG] — AI Act Art.50(2) marquage synthétique : gap réel honnêtement documenté PARTIAL
- confidence: verified
- evidence: docs/compliance/AI_ACT_CONFORMITY_MATRIX.md:68 ('Art.50§2 Synthetic content marking ... PARTIAL ... explicit machine-readable mark deferred to draft Code of Practice'). WebSearch: Code of Practice on AI-generated content, version finale attendue juin 2026 avant deadline août 2026 (digital-strategy.ec.europa.eu).
- claim-vs-reel: La matrice ne sur-déclare pas : elle marque PARTIAL et lie au Code of Practice en cours. Honnête. TTS implicitement synthétique mais pas de marque machine-readable.
- reco: Suivre la version finale du Code of Practice (juin 2026) ; ajouter un marquage machine-readable du contenu TTS/texte généré si le Code l'exige pour limited-risk avant 2026-08-02.

### ARCH-12 [ARCH-REG] — Accessibilité (EN 301 549 / WCAG 2.2 AA) : couverture a11y partielle mais structurée (RTL audit, props a11y majoritaires)
- confidence: likely
- evidence: museum-frontend: 121/162 fichiers .tsx (features/+app/+shared/ui/) utilisent accessibilityLabel/Role/Hint (grep). RTL discipline outillée: __tests__/rtl/_rtl-style-audit.ts + Composer.rtl-style.test.ts (CLAUDE.md gotcha RTL logical-side props). VoiceSessionIntroSheetContent.tsx:108,116,127 (accessibilityRole header, accessibilityLiveRegion polite).
- claim-vs-reel: Pas de gate CI WCAG mobile dédié vérifié dans cette passe (l'audit a11y web Lighthouse existe via ci-cd-web.yml ; le mobile repose sur discipline + tests RTL). 75% de couverture props a11y = bon mais non exhaustif ; je n'ai pas audité chaque écran pour contraste/touch-target 44dp (échantillon seulement).
- reco: Hors scope de cette dimension d'auditer chaque écran ; recommander une passe a11y dédiée (touch-targets 44dp, contraste à tous les stops de dégradé — cf. feedback design Tim) avant la deadline EAA 2025 si applicable au B2C.

### MAT-10 [CODE-GRADE] — Maestro e2e: le 'faux-vert' (summary success) A ÉTÉ remédié — c'est maintenant un vrai gate bloquant
- confidence: verified
- evidence: .github/workflows/ci-cd-mobile.yml:476-491 — attempt2 (`if: steps.maestro_attempt1.outcome == 'failure'`) tourne SANS continue-on-error, donc son échec fait échouer le job (plus de theatre 'summary success malgré 4/4 fail'). expo-doctor aussi durci (l.84-107: était continue-on-error, maintenant exit 1 sauf l'échec Metro-symlinks toléré et borné). Contredit l'état décrit par l'audit 360 du 2026-05-31.
- claim-vs-reel: Audit 360 disait 'e2e Maestro faux-vert (summary success malgré 4/4 fail)'. Le code workflow ACTUEL ne montre plus ce pattern: attempt2 décide l'outcome. La remédiation (mémoire 4738f7ad/933509cd) est réelle côté gating.
- reco: Aucune sur le gating. Note: le suite per-PR est un subset `smoke` (full = nightly), choix produit assumé.

### MAT-11 [CODE-GRADE] — Frozen-test: hook réel et auto-testé, mais enforcement honor-system (dépend de RUN_ID)
- confidence: verified
- evidence: .claude/skills/team/team-hooks/post-edit-green-test-freeze.sh:108-118 — le hook skip silencieusement si RUN_ID unset (l.110-113) ou si pas de manifest (l.115-118). verify_with_manifest (l.83-106) est correct (sha256 cross-platform, détecte modif/suppression) et a un --self-test (l.38-81). Mais rien dans .github/workflows ne ré-exécute ce hash-check côté serveur: l'intégrité repose sur l'orchestrateur /team appelant le hook avec RUN_ID. C'est l'honor-system flaggé par l'audit 360, non fermé.
- claim-vs-reel: L'audit 360 listait 'frozen-test honor-system' comme désarmé; le hook EST réel et fonctionnel, mais l'audit avait raison sur l'absence de mirror CI déterministe (cf. sentinel-mirror existe pour le bypass de hooks git, pas pour le frozen-test team).
- reco: Pour un solo-dev full-Claude le risque est faible (le dev ne triche pas contre lui-même). Si vélocité multi-agent augmente, ajouter un step CI qui ré-hash les tests d'un RUN_ID donné contre red-test-manifest.json.

### SYS-03 [DEBT-SPREAD] — 4 hooks FE async font await->setState sans garde d'annulation, alors qu'un pattern closure-cell canonique existe et est répandu
- confidence: verified
- evidence: Pattern canonique = useDetectMuseum.ts:46 `const state = {cancelled:false}; ... return () => {state.cancelled=true}`. Non appliqué dans : features/review/application/useReviews.ts:35-63 (deps []), features/conversation/application/useConversationsData.ts:28-53,74-76 (loadDashboard re-déclenchable au focus), features/support/application/useTicketsListScreen.ts:50-69, features/chat/application/useAiConsent.ts:45-57. Aucun n'a AbortController/cancelled/isMounted. Vérifié par diff entre la liste des hooks avec useEffect+await et la liste avec garde.
- claim-vs-reel: feedback_closure_cell_cancellation_react_hooks.md marque cette classe comme récurrente (B1/B2/B6) avec un pattern de garde établi, mais docs/TECH_DEBT.md ne trace AUCUN item double-fetch/stale-closure. Risque réel faible (useReviews=deps vides mount-once ; web useFetchData.ts:166-190 a bien AbortController), surtout un warning setState-after-unmount, pas une corruption d'état.
- reco: Appliquer la closure-cell guard aux 4 hooks (surtout useConversationsData qui peut refire au focus) OU acter que c'est acceptable pre-V1 et le tracer en TECH_DEBT pour ne pas le re-découvrir.

### SYS-04 [DEBT-SPREAD] — TD-13 (httpRequest brut résiduel) sous-compte : consentApi.ts (3 callsites) non listé + line numbers dérivés
- confidence: verified
- evidence: TD-13 (TECH_DEBT.md:~) liste 4 callsites résiduels (audio.ts:80, send.ts:143, museumApi.ts:151,166). État réel par grep : features/chat/infrastructure/consentApi.ts:57,71,80 (3 appels httpRequest NON tracés), audio.ts:87,101, send.ts:162, museumApi.ts:212,227 = au moins 8 callsites. consentApi (consent RGPD, state-changing POST/DELETE) n'apparaît nulle part dans TD-13.
- claim-vs-reel: TD-13 prétend 4 callsites ; le code en montre 8 dont 3 sur un module RGPD-sensible (consent) jamais mentionné. La convention TECH_DEBT ('si le grep ne retourne rien on retire l'entrée') implique l'inverse : le grep retourne PLUS que tracé.
- reco: Re-scoper TD-13 avec le compte réel (incl. consentApi 57/71/80) et les line numbers à jour, ou migrer ces callsites.

### DEL-02 [DOCS] — docs/superpowers/specs/2026-06-01-weak-network-...-design.html — render artifact untracked, mal placé dans docs/
- confidence: verified
- evidence: git status: '?? docs/superpowers/specs/2026-06-01-weak-network-resilience-and-test-track-design.html' ; head = '<!DOCTYPE html>' self-contained. CLAUDE.md §Output format impose : les renders HTML vont dans artifacts/, jamais à côté de la source .md éditable. artifacts/ contient déjà 10+ renders légitimes (ls artifacts/*.html). Le .md source vit à côté (...design.md, 379 lignes).
- claim-vs-reel: CLAUDE.md dit 'save in artifacts/ alongside the markdown source' ; ce render est dans docs/superpowers/specs/.
- reco: DELETE le .html (render jetable, non commité). Si conservé, le déplacer dans artifacts/. Ne jamais le commiter.

### DEL-03 [DOCS] — docs/_archive/README.md — dossier d'archive vide (ne contient que ce README pointeur), candidat suppression complète du dossier
- confidence: verified
- evidence: docs/_archive/README.md:3 'Ce dossier n'héberge plus de material pédagogique ni de recaps... supprimés le 2026-05-20'. ligne 9 'sert uniquement de cible aux snapshots de /team roadmap:rotate'. DOCS_INDEX.md:173 confirme 'ne contient plus que README.md'. Les snapshots roadmap:rotate ne sont jamais créés (DOCS_INDEX:173 'non créés à ce jour').
- reco: TRIM/DELETE : un dossier-fantôme avec un README expliquant qu'il est vide est du cruft. Soit supprimer docs/_archive/ entièrement (le recréer au 1er vrai snapshot), soit le garder mais c'est de la dette cognitive. Faible impact.

### DUP-05 [DRY] — Schémas Zod jumeaux byte-identiques : submitBetaSignupSchema ≡ submitPaywallInterestSchema
- confidence: verified
- evidence: src/modules/leads/adapters/primary/http/schemas/leads.schemas.ts:26-30 et 39-43 sont identiques (email.trim().max(254) + consent:literal(true) + website.max(500).optional()). Le JSDoc l.36 admet lui-même 'Same shape as submitBetaSignupSchema'. Consommés séparément (leads.route.ts:89 et :117) → vrais jumeaux, pas un alias.
- claim-vs-reel: Le commentaire documente la dup mais ne la factorise pas — exactement le 'la duplication était documentée par le code lui-même, signe qu'il fallait extraire' du doc DRY (#3 nominatim).
- reco: Définir un schéma de base (ex emailConsentHoneypotSchema) et en dériver beta/paywall (export const ... = baseSchema). Si une divergence future est prévue, garder 2 noms mais via baseSchema.extend({}).

### DUP-06 [DRY] — Type UserRole hand-rollé en double BE↔web (5 rôles), désynchronisable car non relié à l'OpenAPI codegen
- confidence: verified
- evidence: museum-backend/src/modules/auth/domain/user/user-role.ts (5 rôles incl super_admin) et museum-web/src/lib/admin-types.ts:131 (même union 5 rôles, hand-rolled). L'OpenAPI généré ne liste QUE 4 rôles (museum-frontend/shared/api/generated/openapi.ts:2438 + museum-web/src/lib/api/generated/openapi.ts:4196 : 'visitor|moderator|museum_manager|admin', SANS super_admin).
- claim-vs-reel: La dup est documentée et justifiée (admin-types.ts:125-131 : super_admin out-of-band, absent du schéma OpenAPI AuthUser.role) → pas négligente. Mais le type 'canonique' web peut silencieusement diverger du BE puisqu'aucun lien compile-time ne les relie ; et l'OpenAPI lui-même est incomplet (super_admin manquant).
- reco: Ajouter super_admin à l'enum de rôle dans la spec OpenAPI BE pour que les types générés deviennent la source unique, puis dériver le type web/FE de generated/openapi.ts (supprime le hand-roll). À défaut, un test BE↔web qui asserte l'égalité des deux unions.

### DUP-07 [DRY] — Email regex /^[^\s@]+@[^\s@]+\.[^\s@]+$/ répété BE + web + variante lead-sanitizer, sans source partagée
- confidence: verified
- evidence: Identique dans museum-backend/src/shared/validation/email.ts:3 et museum-web/src/lib/validation.ts:12. Variante non-ancrée /g dans museum-backend/src/modules/leads/domain/lead/sanitizeLeadError.ts:45 (PII scrub). Web a centralisé en intra-app (lib/validation.ts commente 'single source of truth'), mais rien ne relie BE↔web.
- claim-vs-reel: Répétition cross-app partiellement acceptable (BE et web sont des apps séparées, packages/musaium-shared ne contient QUE observability/sentry-scrubber — vérifié via ls : aucun canal de validation partagé). Reste un risque de drift de la sémantique 'email valide' entre client et serveur.
- reco: Si packages/musaium-shared doit grandir post-launch, y poser EMAIL_RE comme constante isomorphe consommée par BE+web. Acceptable de différer (LOW) ; ne PAS répliquer davantage.

### DUP-08 [DRY] — Contraintes du lead form B2B dupliquées en magic-numbers BE (Zod) ↔ web (maxLength/length JSX), désynchronisables
- confidence: verified
- evidence: BE src/modules/leads/.../leads.schemas.ts:12-15 (name max(120), museum max(200), message min(10).max(5000)). Web museum-web/src/app/[locale]/b2b/B2bContactForm.tsx:42-45 + maxLength={120} (l.136) + maxLength={200} (l.160) + message.length<10 (l.45) réimplémente les mêmes seuils en littéraux JSX.
- claim-vs-reel: Validation client/serveur volontairement double (le BE reste autoritatif), mais les seuils numériques 120/200/10 sont copiés à la main : un bump BE (ex min(10)→min(20)) laisse le client silencieusement permissif. Pas de constante partagée.
- reco: Acceptable en l'état (LOW, client non-autoritatif) ; si packages/musaium-shared grandit, exporter LEAD_LIMITS={name:120,museum:200,messageMin:10,...} consommé des 2 côtés.

### DUP-10 [DRY] — Extraction de message d'erreur 'err instanceof Error ? err.message : <fallback>' répétée 13× dans museum-web sans helper, alors que FE et useFetchData l'ont
- confidence: verified
- evidence: 13 occurrences dans museum-web/src/app/[locale]/admin/* (support:78, museums/new:134, users/[id]:125,169, reports:88, users:127, analytics:129,155, reviews:85, tickets:98, nps:82, branding:137) + useFetchData.ts:211. Aucun getErrorMessage partagé dans museum-web/src/lib (grep getErrorMessage/extractMessage = 0). À l'inverse le FE a museum-frontend/shared/lib/errors.ts (helper centralisé isAppError/messages).
- claim-vs-reel: useFetchData (extrait en P3, learning A) couvre l'extraction sur les GET mais PAS les handlers de mutation (POST/PATCH) qui re-portent tous le ternaire — la factorisation s'est arrêtée à la moitié de la surface.
- reco: Extraire museum-web/src/lib/getErrorMessage(err, fallback) et balayer les 13 handlers de mutation. Aligne le web sur ce que le FE fait déjà via errors.ts.

### KISS-04 [KISS] — Double indirection du friction store : API fonctionnelle module-singleton re-wrappée en object-adapter injecté
- confidence: verified
- evidence: museum-backend/src/modules/chat/useCase/guardrail/guardrail-friction.store.ts:198-258 expose une API fonctionnelle (`recordStrike`/`frictionCount`/`armCoolDown`/`isCoolingDown`/`resetFriction`) au-dessus d'un singleton `store`. chat-module.ts:725-731 reconstruit ensuite un objet `IGuardrailFrictionStore = { recordStrike: frictionRecordStrike, count: frictionCount, ... }` pour l'injecter dans `FrictionEscalationService`. Donc : classes adapter (In-Process/Redis) → singleton module → 5 fns wrapper → object literal re-wrap → DI.
- claim-vs-reel: Le commentaire chat-module.ts:718 reconnaît « a thin adapter over the module-level functional API so it shares the very instance configured here » — soit une indirection avouée pour contourner le fait que la config passe par un singleton module plutôt que par une instance injectée.
- reco: Supprimer la couche fonctionnelle singleton : faire de `configureGuardrailFriction` un factory qui RETOURNE l'`IGuardrailFrictionStore` (instance), injecté directement. Élimine le singleton mutable global, le re-wrap object-literal, et les 5 exports fonctionnels intermédiaires.

### KISS-05 [KISS] — BottomSheetRouter : mini-framework maison de 9 fichiers (FSM reducer + store + container + backdrop + router + hook) pour afficher des sheets modales
- confidence: verified
- evidence: museum-frontend/features/chat/ui/bottom-sheet-router/ : bottomSheetMachine.ts (FSM, 6.3KB), bottomSheetStore.ts, BottomSheetRouter.tsx (7.4KB), BottomSheetContainer.tsx (14KB), BottomSheetBackdrop.tsx, useBottomSheetRouter.ts, routes.ts (6.3KB) + 2. BottomSheetContainer.tsx:84-90 réimplémente PanResponder swipe-down, Animated timing, onLayout height measurement, BackHandler — soit la réimplémentation manuelle de ce que `@gorhom/bottom-sheet` fournit. CLAUDE.md (feedback_state_machine_react_key) confirme la fragilité : il a fallu `key={state.route}` pour forcer le remount.
- claim-vs-reel: Le design (reducer/animation découplés, last-write-wins queue R2, CLOSE_DONE settle) est soigné et bien commenté, mais c'est un investissement framework-grade pour un besoin UI couvert par des libs RN matures.
- reco: Acceptable si le besoin (router de sheets séquencées avec queue) dépasse vraiment les libs ; sinon évaluer le coût de maintenance vs `@gorhom/bottom-sheet`. Au minimum, ne pas l'étendre davantage. INFO/LOW car le code est propre et testé.

### KISS-06 [KISS] — Net-shaping backend : 639 LOC de fault-injection maison (latence/perte/trickle/fail-count) en plus de Toxiproxy (L3)
- confidence: verified
- evidence: museum-backend/src/shared/net-shaping/ : networkProfiles.ts (326), net-profile-fault.middleware.ts (153), failure-counter.store.ts (110), chunk-pacer.ts (50). Le middleware (net-profile-fault.middleware.ts:1-32) réimplémente délai déterministe, trickle res.json paced par bwDownKbps, et compteur d'échecs keyé — alors que CLAUDE.md décrit déjà un track L3 Toxiproxy. networkProfiles.ts est DUPLIQUÉ byte-for-byte FE (museum-frontend/shared/infrastructure/connectivity/networkProfiles.ts:1-22) gardé par un sentinel parité.
- claim-vs-reel: Correctement fencé test-only (net-profile-fault.middleware.ts:6-9 + shouldMountNetFault gaté `nodeEnv !== production` + sentinel net-fault-prod-guard.mjs + assertion env.production-validation.ts:149) — donc ZÉRO risque prod. Le coût est la quantité de code de test-harness bespoke (L1+L2+L3) pour un produit pre-launch.
- reco: Pas un défaut de sécurité (bien fencé). Mais le registry dupliqué BE/FE gagnerait à vivre dans packages/musaium-shared (qui existe déjà en file:) plutôt qu'en copie+sentinel parité. Évaluer si L2 (fault-injection in-process) apporte assez vs L3 Toxiproxy seul pour justifier 639 LOC à maintenir avant launch.

### KISS-07 [KISS] — ChatServiceDeps : ~35 dépendances dont la majorité optionnelle avec fallback « legacy/disabled » silencieux
- confidence: verified
- evidence: museum-backend/src/modules/chat/useCase/orchestration/chat.service.ts:68-119 `ChatServiceDeps` liste ~35 champs, dont >25 en `?:` optionnel, chacun documenté « when omitted, legacy always-allow/disabled path preserved » (ex L114-117 thirdPartyAiConsentChecker, L72-73 imageProcessor « omitting disables strip (legacy tests only) »). chat-message.service.ts importe ~35 modules (lignes 1-61).
- claim-vs-reel: Atténué : ChatService est un FACADE propre (chat.service.ts:125-182) qui regroupe les deps en buckets (enrichment/safety) et délègue à 3 sous-services + null-object `?? new DisabledAudioTranscriber()`. Donc pas un god-object monolithique. Mais l'optionalité quasi-universelle rend le câblage prod réel difficile à raisonner (quel chemin est actif en prod ?).
- reco: Réduire l'optionalité : pour un single-instance pre-launch, les deps réellement toujours présentes en prod devraient être requises (non-`?:`), réservant `?:` aux vrais variants test. Cela transforme des branches runtime silencieuses en contrats explicites et supprime des chemins « legacy » morts.

### LESS-02 [LESSONS] — TD-RN-02 non remédié : RN Image (pas expo-image) sur 5 sites à URI réseau
- confidence: verified
- evidence: lib-docs/react-native/LESSONS.md flagge 5 sites devant migrer vers expo-image. Vérifié non-fait: features/chat/ui/ArtworkHeroCard.tsx:26 importe Image de 'react-native' et rend source={{uri}} (ligne 136) ; features/daily-art/ui/DailyArtCard.tsx:2,93 idem avec source={{uri: artwork.imageUrl}} + resizeMode='cover' (ligne 95) ; features/chat/ui/VisitSummarySheetContent.tsx:2,69 source={{uri: artwork.imageUrl}} ; features/chat/ui/ArtworkHeroModal.tsx:25,171 (resizeMode='contain') ; app/(stack)/carnet/[sessionId].tsx:13.
- claim-vs-reel: LESSONS dit 'replace RN Image → expo-image' / code: les 5 sites importent encore RN Image + resizeMode sur des URI réseau
- reco: Migrer les 5 sites vers `import { Image } from 'expo-image'` + contentFit + placeholder blurhash. Perte = cache disk/blurhash/transition (pas de bug fonctionnel) → reste un tech-debt V1.1 acceptable, mais le tracker la LESSONS reste ouverte depuis 2026-05-18.

### LESS-03 [LESSONS] — TD-LC-05 partiel : withStructuredOutput sans strict:true sur 2 call sites orchestrator (chat principal + walk)
- confidence: verified
- evidence: lib-docs/langchain/LESSONS.md (2026-05-20) flagge 3 sites non-strict, conforme seulement llm-judge-guardrail.ts:212 (strict:true vérifié). Vérifié toujours ouverts: museum-backend/src/modules/chat/adapters/secondary/llm/langchain.orchestrator.ts:231-234 (chat principal) options {name, includeRaw:true} SANS strict; même fichier:489-492 (WalkAssistantOutput) {name:'WalkAssistantOutput', includeRaw:true} SANS strict.
- claim-vs-reel: LESSONS: 'add strict:true aux 3 call sites' / code: 2/3 toujours non-strict (le schéma MainAssistantOutput est pourtant déjà strict-compliant → 1-ligne chacun)
- reco: Ajouter strict:true aux 2 withStructuredOutput orchestrator (le schéma est déjà compatible per la LESSONS). Surface les drifts au layer API OpenAI au lieu de Zod côté client. Non-bloquant V1 mais trivial à clore.

### MEM-06 [MEMORY] — Références à des UFR inexistants (UFR-023/024/025) — le JSON s'arrête à UFR-022
- confidence: verified
- evidence: user-feedback-rules.json contient UFR-001..UFR-022 (grep vérifié). Mais : feedback_audit_full_reverify_tree_aggregate.md:20 cite 'UFR-025' ; reference_mcp_prompt_injection_repomix.md:26 'à codifier en UFR-024' ; feedback_branch_deletion_orphans_roadmap_sha.md:10, feedback_doc_honesty_enforcement.md:14,17 citent 'UFR-024' comme actif ; project_remediation_roadmap_2026-06-07.md:31,35 'UFR-023'.
- claim-vs-reel: Les memories traitent UFR-023/024/025 comme des règles établies ; le fichier source de vérité n'en contient aucune.
- reco: Soit créer ces UFR dans le JSON (s'ils sont devenus doctrine), soit reformuler les memories en 'à codifier' (aspirational) sans s'appuyer sur l'ID comme s'il existait. Au minimum, UFR-024 (roadmap-claim-resolves) est cité comme enforcement réel et mérite d'être ajouté au JSON pour cohérence.

### MEM-07 [MEMORY] — project_dev_launch_ready_2026-05-27 explicitement superseded par launch_readiness_2026-05-31 → DELETE ou collapse
- confidence: verified
- evidence: project_launch_readiness_2026-05-31.md:22 « Met à jour/supersede [[project_dev_launch_ready_2026-05-27]] ». Le dev_launch_ready (:18) liste 'Reste ops-only' (Anthropic, security@, DPA Langfuse, S3 PAB...) qui est repris et raffiné dans launch_readiness:16 (B13/B14/B17/B19). Doublon de portée à 4 jours d'écart.
- reco: DELETE project_dev_launch_ready_2026-05-27.md (le contenu unique = le gate env `S3_PUBLIC_ACCESS_BLOCK_VERIFIED` est déjà connu via env.production-validation.ts + repris en B19). Retirer la ligne d'index MEMORY.md:30. launch_readiness le couvre.

### MEM-08 [MEMORY] — project_maestro_ubuntu_kvm_2026-06-01 (PR #308) landé via force-push → MERGE dans maestro_landed
- confidence: verified
- evidence: project_maestro_ubuntu_kvm_2026-06-01.md:25 décrit 'PR #308 MERGEABLE, non mergée'. maestro_landed:12 explique que le contenu a été poussé via force-with-lease comme 933509cd (remplaçant le merge stale #308 1357586b). Vérifié git : 1357586b absent d'origin/dev, 933509cd présent. La memory ubuntu_kvm porte des gotchas CI uniques (APK x86_64-only, 10.0.2.2, services GHA pgvector+redis, EXTRACTION_WORKER off, boot retry 2×).
- claim-vs-reel: La memory dit 'PR #308 non mergée, landing Tim' ; en réalité le contenu est sur origin/dev (933509cd).
- reco: MERGE les gotchas CI durables de ubuntu_kvm dans maestro_landed (ou les garder comme la référence CI canonique en retirant la mention 'non mergée'). Ne pas perdre les gotchas APK/services GHA. Mettre à jour le statut.

### MEM-09 [MEMORY] — project_e2e_remediation_2026-06-01 partiellement démenti par shards_2026-06-04 (auto-flaggé)
- confidence: verified
- evidence: project_maestro_android_shards_2026-06-04.md:22 dit textuellement « (Mem project_e2e_remediation_2026-06-01 said 'quota doesn't block locally' — now STALE, it does.) ». Et le shards (:31) corrige le claim addmedia/chat-image-describe. e2e_remediation.md:14 contient bien le claim quota et le caveat addmedia.
- claim-vs-reel: e2e_remediation affirme 'quota ne bloque pas en local' et 'addmedia hang' ; shards prouve en runtime que le quota bloque (paywall) et que l'UI image-describe marche (blocker = backend storage).
- reco: UPDATE e2e_remediation : ajouter un encart 'CORRIGÉ par shards_2026-06-04 — le quota BLOQUE en local (reset sessions_month_count), image-describe UI OK'. Garder le reste (root-cause launcher→Release, matrice AI 44/44) qui reste valide et unique.

### MEM-10 [MEMORY] — Statuts 'NON mergée' faux dans kr_product + auth_mfa (déjà sur origin/dev)
- confidence: verified
- evidence: git log origin/dev : 440cd016 'feat(KR)... (#301)' et 34d790aa 'Auth/MFA/RGPD/Lead-capture (#302)' sont mergés. project_kr_product_domains_2026-05-27.md (index MEMORY.md:16) dit 'NON mergée'. L'index annote DÉJÀ auth comme mergé (MEMORY.md:17) mais le fichier project_auth_mfa_rgpd_v1_state.md garde le claim worktree non-mergé en corps.
- claim-vs-reel: Memories disent branches non-mergées ; git montre #301/#302 sur origin/dev.
- reco: UPDATE les 2 corps de memory pour refléter le merge (ou TRIM en ne gardant que le contenu durable : ADR-014/017, BOLA fixes, FK chat_sessions SET NULL, MFA web-only). L'index est déjà correct pour auth ; corriger l'index pour kr (MEMORY.md:16 'NON mergée' → 'mergée #301').

### MEM-11 [MEMORY] — project_zero_defect_audit_2026-05-26 'merge dev pending' obsolète
- confidence: verified
- evidence: project_zero_defect_audit_2026-05-26.md:3 'merge-to-dev pending'. project_dev_launch_ready_2026-05-27.md:12 confirme '#306 zéro-défaut' mergé sur dev. Le contenu unique (discovery: 11 images = largeur thumbnail Wikimedia, SigLIP 503=bucket GCS non uploadé, ROPA substantiel) reste une référence utile.
- reco: TRIM : retirer le statut 'merge pending', garder les findings discovery comme référence (ils corrigent des faux-positifs récurrents). Pas DELETE — la valeur factuelle (causes racines images/SigLIP/ROPA) survit au merge.

### BUCKET-01 [OWN-LIBS] — InMemoryBucketStore : éviction « oldest-first » est FIFO-par-première-insertion, pas LRU — clé chaude évinçable avant clé froide
- confidence: verified
- evidence: museum-backend/src/shared/rate-limit/in-memory-bucket-store.ts:28-36 — set() évince `this.buckets.keys().next().value` (plus ancienne clé par ordre d'insertion Map). Or Map ne réordonne PAS une clé existante sur update (l.34 `this.buckets.set(key,value)` conserve la position originale). Donc une clé insérée tôt mais incrémentée en continu (attaquant rate-limité actif) sera évincée à capacité avant des clés froides insérées plus tard → réinitialise son compteur. À maxSize 100_000 (l.19) c'est marginal en pratique, mais le commentaire « Oldest-first eviction » (l.5) sur-vend une garantie LRU inexistante.
- reco: Soit re-insérer (delete+set) sur update pour obtenir un vrai LRU, soit documenter explicitement « FIFO par insertion, pas LRU » et noter le risque de reset-compteur sous pression de capacité.

### RMAP-02 [ROADMAP] — Façade roadmap : 'halluc-eval CI gaté (97-corpus)' — le corpus contient 60 entrées, pas 97
- confidence: verified
- evidence: docs/ROADMAP_PRODUCT.md:67 dit '**halluc-eval CI gaté** (97-corpus, ci-cd-backend.yml:658)'. Réel : museum-backend/security/promptfoo/halluc-corpus.json = liste de 60 entrées ; halluc-corpus.meta.json `"total": 60` (partials realtime10+postcutoff10+domain15+multilingual15+injection10=60). L'audit-trail C4.3 cite correctement '60 entries merged'. Le job halluc-eval existe bien (ci-cd-backend.yml:650 'halluc regression (C4.3)', drift gate 5pts, l.~672).
- claim-vs-reel: La façade annonce '97-corpus' (chiffre faux, probablement contaminé par le frontmatter `stats: done=97`). Le code dit 60. Le job CI lui-même est réel et gaté — seul le chiffre est erroné.
- reco: Remplacer '97-corpus' par '60-corpus' (ou '60 entrées / 108 assertions' cf. meta `total_assertions:108`) ligne 67 de ROADMAP_PRODUCT.md.

### RMAP-05 [ROADMAP] — Audit-trail P0.B7 marqué 🟧 PARTIAL alors que le gate TTS-output consent est livré (verdict stale, contradiction signalée par le doc lui-même)
- confidence: verified
- evidence: docs/ROADMAP_AUDIT_TRAIL.md:36 verdict 'PARTIAL' avec note 'TTS sortant ... ZERO check on line 271'. Réel : museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:214-219 — `const {scope:audioScope}=resolveActiveProviderForScope('audio'); const granted=await consentChecker.isGranted(currentUser?.id,audioScope); if(!granted){res.status(403).json({error:'consent_required',scope:audioScope}); return;}` AVANT synthesizeSpeech (l.221). Commentaire l.210-213 'gate TTS ... BEFORE the assistant text is sent to the external OpenAI TTS service. Mirrors the STT gate.' La colonne Re-vérif dit déjà '✅ DONE'.
- claim-vs-reel: Le verdict PARTIAL/'ZERO check' est faux contre le code actuel ; le gate existe et renvoie 403. Le doc note lui-même la contradiction ('Reviewer must clarify') mais ne l'a pas résolue → verdict stale.
- reco: Passer P0.B7 à ✅ DONE dans l'audit-trail (re-vérif l'a déjà confirmé) et nettoyer la note 'ZERO check on line 271'.

### SEC-01 [SECURITY] — X-CSRF-Token absent de CORS allowedHeaders — invariant CSRF cross-origin latent rompu
- confidence: verified
- evidence: museum-backend/src/app.ts:198-214 (bloc allowedHeaders : Content-Type, Authorization, X-Request-Id, X-Data-Mode, Idempotency-Key, Content-Encoding, Accept-Language, sentry-trace, baggage + NET_FAULT_CORS_HEADERS) — `X-CSRF-Token` N'EST PAS dans la liste. La lib `cors` utilise allowedHeaders verbatim pour `Access-Control-Allow-Headers` (pas d'auto-inclusion). Le middleware CSRF exige ce header (museum-backend/src/shared/middleware/csrf.middleware.ts:104). Non exploitable aujourd'hui car le web parle same-origin : museum-web/src/lib/api.ts:85 `getBaseUrl()` retourne '' côté navigateur → rewrite Next (museum-web/next.config.ts:39-46) → pas de preflight CORS. Mais tout futur appel navigateur direct vers api.musaium.com (cookie+CSRF) verrait le header strippé au preflight.
- claim-vs-reel: CLAUDE.md §Pièges affirme 'CORS allowedHeaders contient déjà sentry-trace + baggage' (vrai) mais est silencieux sur X-CSRF-Token ; l'invariant CSRF implicite (header echo cookie) suppose que le header passe le preflight — ce qui n'est pas garanti cross-origin.
- reco: Ajouter 'X-CSRF-Token' à la liste allowedHeaders dans app.ts (1 ligne, defense-in-depth) pour que le contrat CSRF reste valide si la topologie passe un jour en cross-origin. Coût quasi nul, ferme une fragilité future.

### SEC-02 [SECURITY] — Tokens d'auth stockés en storage XSS-readable sur la cible web d'Expo (museum-frontend)
- confidence: verified
- evidence: museum-frontend/features/auth/infrastructure/authTokenStore.ts:33-44 — `loadSecureStore()` retourne null si `Platform.OS === 'web'` ; le fallback `secureTokenStore` (ligne 48-75) écrit alors access+refresh tokens via `storage.getItem/setItem` (AsyncStorage/localStorage), JS-lisible donc exfiltrable par XSS. Sur natif (iOS/Android) c'est correct : expo-secure-store avec keychainAccessible WHEN_UNLOCKED_THIS_DEVICE_ONLY (ligne 61-63, device-bound, non-backup-migratable).
- claim-vs-reel: La doctrine projet (cookies HttpOnly côté web admin, museum-web/src/lib/api.ts:9-14) protège bien le web admin ; mais museum-frontend tourne aussi en cible web Expo et y dégrade vers un store XSS-readable. Surface secondaire (le natif est primaire), mais réelle.
- reco: Si museum-frontend-web est déployé (pas seulement natif), documenter explicitement la limite ou désactiver la persistance token sur web (session-only en mémoire). Sinon confirmer que la cible web Expo n'est pas exposée publiquement.

### TQ-04 [TESTS] — Flows weak-net: assertions clés en optional → gate faible même sur Android
- confidence: verified
- evidence: .maestro/net-chat-edge.yaml — bannière low-data (l.36 optional), bannière offline (l.55 optional), clear/resync (l.66 optional) toutes `optional: true`. Seule assertion dure: `assertNotVisible: NETWORK_ERROR|ECONNREFUSED|...` (l.56-57). Justifié pour iOS sim (airplane no-op) mais le commentaire l.14-18 dit que setAirplaneMode EST fiable sur Android — où ces optionals masqueraient une régression réelle de bannière offline.
- reco: Gater les optionals par plateforme (`when: platform: iOS` pour relâcher, assertions dures sur Android) comme c'est déjà fait ailleurs (very-long input chunk gaté Android per mémoire maestro-android-shards). Sinon le flow nightly ne prouve quasi rien sur la dégradation gracieuse.

### TQ-07 [TESTS] — `pnpm test` (forceExit:true) masque les open handles que seul Stryker forceExit:false révèle
- confidence: verified
- evidence: museum-backend/jest.config.ts:69 `forceExit: true`; warning observé en exécutant le test voice-pipeline ("Force exiting Jest: Have you considered --detectOpenHandles"). CLAUDE.md § Pièges l'admet: les deps Redis/BullMQ hangent sans unref. Avec Stryker off (PILLAR-01), AUCUN run CI ne tourne en forceExit:false → les fuites de handles ne sont jamais détectées par un gate.
- reco: Au minimum un job nightly `jest --detectOpenHandles` scoped sur les suites à risque (chat/admin/auth via createApp) pour ne pas dépendre de Stryker (désarmé) comme seul révélateur de fuites.

### TYPE-03 [TYPE] — BE strictPropertyInitialization:false — entities/DTO peuvent omettre l'init d'un champ requis non-nullable
- confidence: verified
- evidence: museum-backend/tsconfig.json:24 `"strictPropertyInitialization": false`. Conséquence concrète sur les colonnes jsonb non-nullables typées requises : museum-backend/src/modules/chat/domain/wikidata-kb-dump.entity.ts:56 `facts!: ArtworkFacts;` et museum-backend/src/modules/leads/domain/lead/lead.entity.ts:43 `payload!: LeadPayload;` (definite-assignment `!` toléré). Le `!` est nécessaire avec TypeORM mais désactive la vérif d'init.
- claim-vs-reel: C'est le compromis standard TypeORM (decorators hydratent les champs à runtime, le compilo ne le voit pas) — acceptable et documenté implicitement. Le risque résiduel : un champ jsonb requis pourrait rester undefined si une row legacy/migration ne l'a pas peuplé, et le type ment alors (drift jsonb runtime, déjà flaggé dans MEMORY feedback_jsonb_drift_guard). Les types statiques sont corrects ; la garantie runtime ne l'est pas.
- reco: Garder false (requis par TypeORM) mais appliquer systématiquement le drift-guard runtime (typeof sur champs jsonb imbriqués) déjà en doctrine projet pour tout helper qui parse une colonne jsonb nullable — pas un changement de config, une discipline de parsing à vérifier en revue.


---

# INFO

### AISAN-04 [AI-SANITIZATION] — Egress de l'erreur orchestrateur vers Langfuse via statusMessage (err.message) — risque résiduel faible
- confidence: verified
- evidence: museum-backend/src/modules/chat/adapters/secondary/llm/langchain-orchestrator-tracing.ts:147 `statusMessage: err instanceof Error ? err.message : String(err)` et llm-judge-guardrail.ts:244 (mais le judge, lui, fixe un message constant 'judge_error'/'judge_timeout' — bon). Le tracing orchestrateur transmet le message d'erreur brut. Les erreurs LLM sont structurelles (timeout/rate-limit/schema), donc faible probabilité d'embarquer du contenu user, et le mask stripFreeText ne couvre pas statusMessage (il vise input/output/messages).
- reco: Mapper err.message vers un enum d'erreur borné (comme le judge le fait déjà) avant de le poser sur statusMessage, pour éliminer le risque qu'un provider renvoie un message echo-ant le prompt.

### AISAN-05 [AI-SANITIZATION] — VÉRIFIÉ OK — ordering des messages, isolation structurelle et boundary marker respectés
- confidence: verified
- evidence: museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:390-431 buildSectionMessages produit exactement [SystemMessage(systemPrompt), SystemMessage(sectionPrompt), ...envelopes(index≥2), userMemory, wrapUntrusted(local/kb/web), ...history, userMessage, SystemMessage(trailing reminder)]. Le marker `[END OF SYSTEM INSTRUCTIONS]` est dans systemPrompt (ligne 174). Le judge respecte le même pattern (llm-judge-guardrail.ts:215 [SystemMessage(JUDGE_SYSTEM_PROMPT), HumanMessage(message)], marker à la ligne 82). location/locale ne sont JAMAIS injectés dans un system prompt : buildVisitorContextLine met le visitor_context dans le HumanMessage (lignes 256-262), locale ne sert qu'à resolveLocale.
- claim-vs-reel: CLAUDE.md §AI Safety (ordering [System, System(section), ...history, Human]) — CONFORME au code réel.
- reco: Aucune action — invariant verrouillé par llm-prompt-builder-stable-prefix.spec.ts (cité en doc).

### AISAN-06 [AI-SANITIZATION] — VÉRIFIÉ OK — la fuite GPS inversée (RGPD Art.7) est réellement fermée + consent géo fail-closed
- confidence: verified
- evidence: museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts:203 `if (isCoordinateString(input.context?.location)) return ''` droppe les coords brutes quand resolvedLocation absent (consent refusé). 2e point d'injection couvert : llm-sections.ts:289. isCoordinateString dérive de parseLocationString (shared/utils/location.ts:19, SSOT). resolveLocationForMessage (location-resolver.ts:233-251) renvoie undefined si anonyme, si checker error (fail-closed NFR-6), ou si aucun scope accordé. Les labels émis au LLM sont coarse/neighbourhood uniquement (city/suburb/quartier/country) — JAMAIS le champ fin reverseGeocode (qui contient road) : buildVisitorContextLine ne lit que reverseGeocodeCoarse/Neighbourhood (llm-prompt-builder.ts:218-221). EXIF strippé avant LLM (image-processing.service.ts:167).
- claim-vs-reel: learning/2026-05-28-weekly/C-chat-pipeline.md (fuite GPS inversée, commit 085d8a81) — RÉELLEMENT corrigé dans le code actuel.
- reco: Aucune action.

### AISAN-07 [AI-SANITIZATION] — VÉRIFIÉ OK — double scrub observabilité (Langfuse mask stripFreeText + Sentry scrubEvent) câblé en prod
- confidence: verified
- evidence: Langfuse: langfuse.client.ts:68 `mask: stripFreeText` posé au ctor ; strip-free-text.ts gère text-only ET multimodal (parts text/image_url, base64/signed-url → '[STRIPPED]'), fail-safe try/catch (ne throw jamais). Les traces LLM ne posent QUE des longueurs/enums/locale/model dans metadata (langchain-orchestrator-tracing.ts:74-114, llm-judge-guardrail.ts:165-167 inputLength uniquement, llm-guard.adapter.ts:320-345 jamais le texte scanné). Sentry: sentry.ts:50-71 sendDefaultPii:false + beforeSend:scrubEvent + beforeBreadcrumb + tracePropagationTargets ancrés ^https://api.musaium.com($|/). scrubEvent (musaium-shared/src/observability/sentry-scrubber.ts) scrube headers/data/url/user(email→hash)/extra/tags + 16 query-keys sensibles (incl x-amz-signature, code, state, email).
- claim-vs-reel: CLAUDE.md (Langfuse mask, Sentry sendDefaultPii:false, sentry-trace/baggage) — CONFORME.
- reco: Aucune action.

### AISAN-08 [AI-SANITIZATION] — VÉRIFIÉ OK — PII sanitisée AVANT egress LLM + clé de cache ; guardrail single-source-of-truth ; fail-CLOSED/OPEN corrects
- confidence: verified
- evidence: chat-message.service.ts:283-284 `effectiveUserText = prep.redactedText ?? input.text` puis `sanitizedText = piiSanitizer.sanitize(effectiveUserText)` AVANT buildOrchestratorInput (285) et la clé de cache (buildLlmCacheInput 428/456 sur sanitizedText) — le payload LLM + cache ne portent que des placeholders [EMAIL]/[PHONE]. Guardrail centralisé dans guardrail-evaluation.service.ts (aucun duplicate ; les 2 autres usages de evaluateUserInputGuardrail = safeContextValue sur champs contexte + OCR-guard sur texte d'image, défense-en-profondeur légitime). LLM-Guard adapter fail-CLOSED sur TOUT chemin d'erreur (llm-guard.adapter.ts:266,284,385,392,403 → failClosed) ; judge fail-OPEN (llm-judge-guardrail.ts return null). Defaults env corrects : observeOnly=false, budgetCentsPerDay=500 (judge actif), judgeTimeoutMs=1500 (la correction 500→1500 de la mémoire est bien dans env.ts:431), frictionEnabled=true. Consent IA-tiers gate au tout début de prepare (prepare-message.pipeline.ts:277).
- reco: Aucune action.

### ARCH-03 [ARCH-PATTERNS] — FE : le sentinel d'architecture hexagonale est RÉEL et mord (point fort vérifié)
- confidence: verified
- evidence: museum-frontend/__tests__/architecture/no-shared-api-import-outside-infra.test.ts:96-123 — test Jest fs-based qui walk `features/**`, interdit `@/shared/api/openapiClient|httpRequest`, `@/shared/infrastructure/httpClient`, `@react-native-async-storage/async-storage` hors `features/**/infrastructure/**` (whitelist composition-root auth/paywall explicite). Je l'ai exécuté (`npx jest`) : 6/6 PASS en 1.5s. Wiring CI vérifié : jest.config.js:8 `testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}']`, package.json:27 `test:rn = jest` inclus dans `test`. Contrairement au BE, ce garde-fou bite vraiment (il fail si une violation est introduite).
- reco: Garder. Modèle à répliquer côté BE : un test fs-based qui mord est plus fiable que la config boundares actuellement morte. Envisager d'étendre le sentinel FE pour couvrir domain↛application/ui dans features/.

### ARCH-04 [ARCH-PATTERNS] — Import discipline backend impeccable — 0 import relatif ≥3 niveaux, alias respectés
- confidence: verified | RE-VERIF: **CONFIRMED** -> MEDIUM
- evidence: `grep -rEn "from '(\.\./){4,}" museum-backend/src/` = 0 résultat (4-niveaux banni par CLAUDE.md) ; `grep -rEn "from '(\.\./){3,}"` = 0 résultat (même 3 niveaux). Les imports cross-module passent par alias `@modules/*`, `@shared/*`, `@data/*` (échantillon vérifié sur ~30 imports cross-module). La règle import-x est configurée : eslint.config.mjs:174-188 (`no-duplicates`, `no-self-import`, `no-cycle maxDepth:5`, `order` alphabétisé + groupes). La discipline d'import documentée (codemod 2026-05-05) est tenue dans le code réel.
- reco: RAS. Continuer.

### ARCH-07 [ARCH-PATTERNS] — Structure modulaire propre + routes maigres (pas de god-controller) + exception composition-root honnête
- confidence: verified
- evidence: Structure hexagonale cohérente sur les 11 modules (admin/auth/chat/daily-art/knowledge-extraction/leads/museum/review/support/telemetry) : chacun a domain/useCase/adapters{primary,secondary}. Routes maigres délèguent aux use-cases : admin.route.ts:24-43 importe `listUsersUseCase`/`adminReviewFacade`/etc., et le handler (lignes 64-75) fait seulement HTTP (validateQuery → use-case). Plus gros fichier = chat-module.ts (1007L) = composition-root pur (DI wiring), avec `eslint-disable max-lines` justifié honnêtement (chat-module.ts:1 admet que le split précédent « existait seulement pour gamer ESLint max-lines:400 »). Pas de dossier fourre-tout détecté.
- reco: RAS sur la structure physique. Le rangement est cohérent, pas entropique. Le seul vrai problème est l'enforcement (ARCH-01/06), pas l'organisation.

### ARCH-01 [ARCH-REG] — AI Act Art.50(1) disclosure réellement implémentée et gatée first-interaction (conforme deadline 2026-08-02)
- confidence: verified | RE-VERIF: **CONFIRMED** -> HIGH
- evidence: museum-frontend/features/chat/ui/VoiceSessionIntroSheetContent.tsx:67-76 (TTS greeting au mount via expo-speech) ; features/chat/hooks/useVoiceDisclosure.ts:35 (clé secure-store persistée 'musaium.voice.disclosure_acknowledged.<user>') ; features/chat/ui/ChatHeader.tsx:86 (badge a11y permanent 'voice.disclosure.badgeA11y') ; shared/locales/fr/translation.json:3,11,13 (toast onboarding + audioGreeting 'vous interagissez avec l'assistant IA Musaium' + badge). Doc compliance: docs/compliance/AI_ACT_CONFORMITY_MATRIX.md:67. WebSearch confirme Art.50(1) exige notification 'at the latest at first interaction' avant 2026-08-02 (artificialintelligenceact.eu/article/50).
- claim-vs-reel: La matrice AI Act cite 'VoiceSessionIntro.tsx' (n'existe plus) ; le fichier réel est VoiceSessionIntroSheetContent.tsx (migration bottom-sheet C4). Mismatch de nom dans GDPR_ART22_SCOPE.md:63 + AI_ACT_CONFORMITY_MATRIX.md:67, mais la feature existe et est câblée.
- reco: Corriger le path 'VoiceSessionIntro.tsx' → 'VoiceSessionIntroSheetContent.tsx' dans AI_ACT_CONFORMITY_MATRIX.md:67 et GDPR_ART22_SCOPE.md (cohérence doc↔code, UFR-013 doc-honesty).

### ARCH-02 [ARCH-REG] — RGPD Art.17 (erasure) implémentée avec orchestration multi-store réelle, pas un simple cascade DB
- confidence: verified
- evidence: museum-backend/src/modules/auth/useCase/account/deleteAccount.useCase.ts:105-189 : ordre load-bearing (1) S3 images deleteByPrefix(userId)+legacy fetcher :117-127 (2) TTS audio deleteUserAudio :131-140 (3) Brevo removeContact + fallback durable enqueueBrevoErasure :146-167 (4) leads deleteByEmail :173-183 (5) cascade DB deleteUser :188. audit_logs RETENUS (obligation légale, doc :52). Art.15 export: src/modules/auth/useCase/account/exportUserData.useCase.ts. ADR-060 documente la chaîne.
- reco: Aucune action ; conformité Art.17 réelle et supérieure à la moyenne (best-effort par store, fallback durable contre PII résiduelle tierce).

### ARCH-03 [ARCH-REG] — CNIL plancher 15 ans (digital majority) enforced en code au registre, conforme loi française
- confidence: verified
- evidence: museum-backend/src/modules/auth/useCase/registration/register.useCase.ts:18 (MINIMUM_AGE_FOR_REGISTRATION=15), :104-119 (assertDigitalMajority throw 422 si <15, dateOfBirth required :108-109). Migration src/data/db/migrations/1778572103132-AddUserDateOfBirth.ts:8 ('rejects new registrations with DOB < 15y at insert time'). WebSearch confirme France = âge numérique 15 ans (GDPR Art.8 flexibilité ; CNIL Recommendation 4 consentement parental <15).
- reco: Conforme. Note: pas de mécanisme de consentement parental vérifié <15 (la loi 2023-566 le réclame pour réseaux sociaux mais pas encore en vigueur, Commission approval pending) — refus pur du registre <15 est défendable pour une app non-réseau-social. À ré-évaluer si la loi 2023-566 entre en vigueur.

### ARCH-05 [ARCH-REG] — Pilier Maestro 'faux-vert' RÉELLEMENT remédié — 3 couches anti-false-green vérifiées
- confidence: verified
- evidence: museum-frontend/scripts/maestro-run-shard.sh:83-85 (exit 1 si FAIL_COUNT>0) → propage à l'action ; .github/workflows/ci-cd-mobile.yml:549,564 (log-scan 'FAIL' + core.setFailed) ; :573 belt-and-suspenders ('needs.maestro-shard.result != success' → exit 1, :576). Commentaire :561 cite explicitement 'audit 360 dim.2'.
- claim-vs-reel: Le précédent audit (CARTOGRAPHIE-360) flaggait 'summary success malgré 4/4 fail'. Aujourd'hui le code montre 3 mécanismes indépendants qui tournent rouge sur tout FAIL. Remédiation réelle, pas mémoire-only.
- reco: Aucune ; remédiation solide. Note: per-PR = subset 'smoke' (~12min), full 4-shard nightly/push-main — le gating per-PR est partiel par design (CLAUDE.md).

### ARCH-08 [ARCH-REG] — OWASP LLM Top 10 2025 (LLM01 injection / LLM07 system-prompt-leak) : mitigations réelles + gate CI promptfoo ACTIF (pas théâtre)
- confidence: verified
- evidence: Isolation structurelle: museum-backend/src/modules/chat/useCase/llm/llm-sections.ts:290 + llm-prompt-builder.ts:27,73 (sanitizePromptInput sur location/title user-controlled, défini src/shared/validation/input.ts:8). Ordering system-avant-user: langchain.orchestrator.ts:533 buildSectionMessages(systemPrompt, sectionPrompt,...). Gate CI: .github/workflows/llm-security-promptfoo.yml:260-262 (sys.exit(1) si pass_rate<0.95) + :256 (exit 1 si 0 tests) — le continue-on-error:228 est sur le run-step seul pour que le rapport s'écrive, le gate dédié décide. WebSearch OWASP LLM01/LLM07 2025 confirme ces mitigations (segregate content, system prompt constraints, adversarial testing).
- reco: Conforme. Contraste net avec Stryker : ce gate-ci est réellement bloquant (vérifié exit code), pas if:false.

### ARCH-11 [ARCH-REG] — Pénalité Art.50 dans la matrice : VÉRIFIÉE correcte (mon hypothèse initiale d'erreur était fausse)
- confidence: verified
- evidence: docs/compliance/AI_ACT_CONFORMITY_MATRIX.md:72 ('€15M or 3%') + :96 (Art.99(4)). WebSearch confirme: Art.50 transparency = €15M/3% = Tier 2 (middle), PAS €7.5M/1% (qui = Tier 3 'incorrect info to authorities', Art.99(5)). SME = lower amount (Art.99(6)).
- claim-vs-reel: J'avais suspecté un mismatch ; la vérification web (artificialintelligenceact.eu/article/99) montre que la matrice est correcte. Documenté ici pour traçabilité UFR-013 (distinguer supposition vérifiée).
- reco: Aucune.

### MAT-01 [CODE-GRADE] — Backend coeur métier = enterprise-grade vérifié (durabilité, typed errors, PII redaction)
- confidence: verified
- evidence: museum-backend/src/modules/leads/useCase/submitB2bLead.useCase.ts:111-174 — persist-then-notify (insertPending pending AVANT notifier, jamais de rethrow sur échec Brevo, retry job re-délivre), honeypot silent-drop anti-énumération (l.120-127, whitespace-only NON traité comme hit), dedup logique sha256 (l.43-45), erreur sanitisée avant persistance (toSanitizedLeadError l.167), logging structuré avec extractEmailDomain au lieu de l'email brut (l.138). Validation bornée explicite (l.54-96).
- claim-vs-reel: La doc projet prétend 'B2B = hypothèse future, aucun musée démarché'; le code lui est néanmoins durable et complet (cohérent avec un backlog soigné).
- reco: Aucune action. Référence de qualité pour les autres modules.

### MAT-02 [CODE-GRADE] — Gestion d'erreurs typée + GDPR fail-closed dans le resolver de localisation
- confidence: verified
- evidence: museum-backend/src/modules/chat/useCase/location-resolver.ts:238-250 — try/catch sur le consent store traité comme 'none' (fail-closed, NFR-6), short-circuit full>coarse (l.241-243, single round-trip), spread plutôt que mutation pour éviter d'empoisonner le cache (l.256-260 avec commentaire explicite sur MemoryCacheService.get par référence). Trois granularités GDPR (fine/coarse/neighbourhood) construites sans dangling separator (l.179-192).
- reco: Aucune. Le commentaire l.256-260 montre une compréhension fine des pièges d'aliasing cache.

### MAT-03 [CODE-GRADE] — Quota mensuel: UPDATE atomique single-SQL anti-race + guard sur la forme du retour TypeORM
- confidence: verified
- evidence: museum-backend/src/shared/middleware/monthly-session-quota.repo.pg.ts:43-72 — UPDATE...CASE...RETURNING avec WHERE qui refuse (0 rows) si quota atteint (pas de read-modify-write race), ET guard défensif sur le tuple [rows[],count] de TypeORM 0.3.28 (l.68-71) qui était la cause du bug f74ce7de cité dans CLAUDE.md. La leçon a été internalisée dans le code, pas juste documentée.
- reco: Aucune. Exemple de leçon-incident convertie en garde de code.

### MAT-04 [CODE-GRADE] — Frontend RN: hooks corrects (useSyncExternalStore, cleanup, typed catch)
- confidence: verified
- evidence: museum-frontend/features/chat/application/useOfflineQueue.ts:36-39 (useSyncExternalStore sur store externe), 44-52 (persistOfflineImage try/catch dégradé gracieux sans image, Alert i18n), 58-64 dequeue avec cleanup d'image; museum-frontend/features/chat/application/useCompareImage.ts:57-66 (type guards défensifs isAxiosLikeError/getStatus/getErrorCode), 102-114 (503/COMPARE_ENCODER_UNAVAILABLE mappé i18n, détail axios brut JAMAIS exposé à l'UI), 68-77 retry 4xx-terminal/5xx-borné.
- reco: Aucune. Niveau expert: pas de non-null assertion, pas de leak de détail d'erreur réseau.

### MAT-05 [CODE-GRADE] — Web: client API avec refresh-queue, CSRF double-submit, AbortController cancellation
- confidence: verified
- evidence: museum-web/src/lib/api.ts:62-137 (refresh queue isRefreshing + failedQueue, 401→refresh→retry-once via isRetry l.205-219 anti-boucle-infinie, onLogout sur échec définitif), 50-56 readCsrfToken + X-CSRF-Token sur méthodes state-changing (l.186-191); museum-web/src/lib/hooks/useFetchData.ts:177-243 (closure-cell/ref-tick cancellation, signal.aborted guard l.201+209, data préservée sur erreur subséquente). LoginForm classifyMfaError (museum-web/src/components/admin/LoginForm.tsx:21-36) collapse les 401 pour ne pas leaker la sous-raison.
- reco: Aucune. Le commentaire api.ts:147-149 documente honnêtement que `signal` n'est honoré que par apiGet (scope limité assumé, pas caché).

### MAT-06 [CODE-GRADE] — Lib partagée: scrubber Sentry single-source, runtime-agnostic, golden-test gardé
- confidence: verified
- evidence: packages/musaium-shared/src/observability/sentry-scrubber.ts:121-135 (scrubRecord récursif arrays+objets), 155-170 (scrubUrl query-string), 210-248 (scrubEvent walk request/user/extra/tags incl. URL-like values dans tags indexés), 16 clés sensibles évoluées en lockstep avec un sentinel parity + CANONICAL_HASH (l.22-54). hashEmail injecté par host = seule pièce platform-specific.
- reco: Aucune. Defense-in-depth explicite, pas de dépendance dure au SDK Sentry.

### MAT-07 [CODE-GRADE] — Hygiène type/lint exceptionnelle sur ~150k LOC
- confidence: verified
- evidence: grep -rIn 'as any' sur museum-backend/src + museum-frontend/{features,shared,app} + museum-web/src + packages/musaium-shared/src (hors tests) = 0 occurrence (vérifié 2 fois, grep pas rg). @ts-ignore/@ts-expect-error BE src = 0. catch vide BE = 0. console.log hors logger.ts = 0. TODO/FIXME/HACK = 4 au total, tous bénins (recoveryCodes.ts:19 = format string 'XXXXX-XXXXX', 2x TODO de raffinement de type OpenApi, 1x placeholder Instagram supportLinks.ts:14).
- reco: Aucune. Niveau de discipline type/lint au-dessus de la moyenne enterprise.

### MAT-08 [CODE-GRADE] — Circuit breaker LLM: machine à états 3-états proprement séparée, test seams
- confidence: verified
- evidence: museum-backend/src/modules/chat/adapters/secondary/llm/llm-circuit-breaker.ts:22-110 — séparation SlidingWindowFailureStrategy / ThreeStateCircuit, `now` injectable (test seam l.16/38), env overrides pour chaos e2e (l.31-37), onStateChange loggé structuré (warn OPEN avec failureCount/windowMs l.55-59), CircuitOpenError typé. execute() record success/failure proprement (l.72-85).
- reco: Aucune.

### MAT-12 [CODE-GRADE] — eslint-disable: 87 en BE mais quasi tous disciplinés (pas des escape-hatches type)
- confidence: verified
- evidence: grep catégorisé sur museum-backend/src: 33x @typescript-eslint/require-await (méthodes async de conformité d'interface), 25x prefer-nullish-coalescing (|| intentionnel), 16x no-unnecessary-condition, 10x sonarjs/slow-regex, 5x max-lines-per-function. AUCUN disable de no-explicit-any ou de règle de sûreté de type majeure. Cohérent avec la politique docs/LINT_DISCIPLINE.md (justif ≥20 chars + Approved-by en PR).
- reco: Aucune. Le profil de disables est sain (boilerplate de conformité, pas contournement de typage).

### SYS-05 [DEBT-SPREAD] — Pilier 'Stryker mutation gate' toujours désarmé (if:false) — mais honnêtement documenté, pas faux-vert
- confidence: verified
- evidence: .github/workflows/ci-cd-backend.yml:411 `if: false` sur le job `mutation`, commentaire L397-403 : 'DISABLED (deferred post-launch) — re-confirmed 2026-05-31, audit 360. This job has NOT run since 2026-05-09. It is NOT a gate today ... do not cite it as an active guard'. La mémoire projet suggérait des remédiations qualité depuis l'audit 360 ; le gate Stryker n'en fait pas partie, il reste off.
- claim-vs-reel: Cartographie 360 flaggait ce pilier 'désarmé' — TOUJOURS VRAI. Mais contrairement au reproche de faux-vert, le workflow est explicitement honnête (commentaire UFR-013-compliant qui interdit de le citer comme garde). Ce n'est pas une dette cachée, c'est un report assumé.
- reco: Aucune action de correction de mensonge requise (la doc est honnête). Si la qualité mutation est un objectif V1, ré-armer per la procédure L405-410 ; sinon laisser tel quel, c'est un choix tracé.

### SYS-06 [DEBT-SPREAD] — Piliers Maestro faux-vert et frozen-test : effectivement remédiés (contre-vérification)
- confidence: verified
- evidence: Maestro : ci-cd-mobile.yml:564 `core.setFailed` sur tout flow FAIL + L573-576 belt-and-suspenders `if: needs.maestro-shard.result != 'success'` -> exit 1 ('A green maestro-summary now REQUIRES every shard to succeed') ; attempt-2 (L476-491) n'a PAS continue-on-error donc décide l'outcome. Frozen-test : .claude/settings.json:47 câble post-edit-green-test-freeze.sh en PostToolUse (déterministe pour le workflow /team, pas honor-system). Patterns propres confirmés : process.env 100% via readEnvString (apiConfig.ts, plausible.ts, cert-pinning-init.ts), zéro emoji unicode (allowlist shared/i18n/copy-emoji-allowlist.json = seulement ↔/→/OSM), cache keys robustes (llm-cache.service.ts:152-166 voiceMode+audioDescriptionMode+currentArtworkKey, chat-media.service.ts:242 tts:v2:msgId:voiceId, similarity.service.ts:177 locale+topK+museum+hash), .set({undefined}) propre (chat-repository-audio.ts:26 null explicite, chat.repository.typeorm.ts:419-431 coalesce undefined->null), QuotaUpsellModal consent reset présent (useEffect L69-77).
- claim-vs-reel: La mémoire projet (commits 68d82c68 Maestro, freeze hook) est CONFIRMÉE par le code actuel. La cartographie 360 sur ces 2 piliers est désormais périmée (correctement remédiée).
- reco: Mettre à jour audit-state/cartographie-360 pour refléter que 2/3 piliers sont fermés (seul Stryker reste off, assumé).

### INFO-01 [DOCS] — 57 docs hors DOCS_INDEX mais la majorité sont légitimement couvertes ou auto-référencées (ADRs par plage, RUNBOOKS par dossier)
- confidence: verified
- evidence: Script: 57 'ORPHAN-IN-INDEX' mais ~34 sont des ADRs couverts par la mention de plage DOCS_INDEX:24 'ADRs (002-068)' et les RUNBOOKS/ par DOCS_INDEX:93 (lien dossier). Genuinement orphelins ET non-cruft : docs/ROADMAP_AUDIT_TRAIL.md (annexe vivante de ROADMAP_PRODUCT, à indexer), docs/operations/{S3_PUBLIC_ACCESS_VERIFICATION,SIGLIP_MODEL_PROVISIONING,UNIVERSAL_LINKS_VERIFICATION}.md (runbooks ops réels, vérifiés vs code env.production-validation.ts:86-109), docs/compliance/{AI_ACT_CONFORMITY_MATRIX,art5-audit,FAIRNESS_METRICS_PLAN}.md (compliance live, refs team-state qui résolvent).
- reco: UPDATE DOCS_INDEX : ajouter ROADMAP_AUDIT_TRAIL (annexe), les 3 nouveaux runbooks operations, les 3 docs compliance, MUTATION_SCOPE_EVALUATION, OPS_INCIDENT_LLM_GUARD, GDPR_ART22_SCOPE, PASSWORD_HASH_MIGRATION, TECH_DEBT_ARCHIVE. Ce sont des docs vivantes manquantes, PAS des candidats DELETE.

### INFO-02 [DOCS] — lib-docs/ tracked (97 dirs × LESSONS.md + INDEX.json + README) = sain, AUCUN cruft détecté
- confidence: verified
- evidence: git ls-files lib-docs sans snapshots = 96 LESSONS.md + INDEX.json (2453 lignes) + README + .gitignore. Distribution LESSONS.md : min=9 / median=38 / max=151 lignes, ZÉRO stub (<=5 lignes). Conforme à la doctrine CLAUDE.md (LESSONS.md = human-edited tracked, snapshots/PATTERNS.md untracked). Aucun LESSONS.md vide ou orphelin d'un package non-utilisé détecté à l'échantillonnage.
- reco: KEEP intégral. Le contenu tracked de lib-docs n'est pas du cruft à élaguer — c'est de la doctrine honor-system active (UFR-022).

### INFO-03 [DOCS] — Specs superpowers hybrid-gravity + weak-network (.md) orphelines de tout index mais features shippées — valeur de rationale, à indexer pas à supprimer
- confidence: verified
- evidence: docs/superpowers/specs/2026-06-01-hybrid-gravity-guardrail-design.md:3 'À implémenter via /team' + 2026-06-01-weak-network-...-design.md:1 'Status DESIGN'. grep 'hybrid-gravity-guardrail-design' CLAUDE.md/docs/.claude = 0 ref. Or memoire confirme les features livrées (commits 93d5a7c6 hybrid-gravity, d924f2fe weak-network W3). Le UFR-022 spec voisin EST référencé (CLAUDE.md 'Specs:').
- claim-vs-reel: Specs disent 'à implémenter/DESIGN' ; les features sont livrées. Statut interne stale mais le doc reste un design rationale valide.
- reco: TRIM léger (bumper le Status → SHIPPED avec commit, comme le fait déjà la spec UFR-022:6) + indexer dans DOCS_INDEX section spécifications. Ne pas supprimer (rationale de design utile).

### DUP-09 [DRY] — Helper truncate défini 2× dans le FE avec ellipses divergentes
- confidence: verified
- evidence: museum-frontend/features/chat/domain/dashboard-session.ts:28-30 (value.slice(0,max-3)+'...') et museum-frontend/features/museum/ui/MuseumSheetEnrichmentBody.tsx:18-23 (trimmed.slice(0,max).trimEnd()+'…' unicode). Plus une troncature inline du preview dans carnet.ts.
- reco: Mineur : poser un shared/lib/truncate.ts unique. À noter l'incohérence visuelle '...' (3 dots ASCII) vs '…' (ellipsis unicode) entre les deux sites.

### KISS-08 [KISS] — probabilistic-refresh (XFetch/jitter) + audit hash-chain : abstractions correctes mais front-loaded
- confidence: verified
- evidence: museum-backend/src/shared/cache/probabilistic-refresh.ts:57-68 `shouldEarlyRefresh` (roll Math.random linéaire anti-thundering-herd) — utile UNIQUEMENT sous forte concurrence sur clés chaudes (overpass/nominatim), inexistante à 0 utilisateur. museum-backend/src/shared/audit/audit.repository.pg.ts:16,67-73 `pg_advisory_xact_lock(0x75f1...)` sérialise chaque INSERT audit (CLAUDE.md : cap 50-200/s, refonte Merkle prévue ADR-054 à 100k MAU).
- claim-vs-reel: Les deux sont du code PROPRE et correct (audit-chain.ts:39-116 computeRowHash/verifyAuditChain = pur, simple, testable). Le sur-engineering n'est pas dans la qualité mais dans le fait de payer maintenant une complexité dont le bénéfice (anti-herd, débit audit, scale Merkle) n'arrive qu'à un volume qui n'existe pas.
- reco: Garder (coût faible, déjà écrit, correct). Simplement noter dans TECH_DEBT que ces primitives sont du « scaling à l'avance » : ne pas les étendre, et re-mesurer leur ROI au vrai trafic plutôt que d'en ajouter d'autres pré-launch.

### KISS-09 [KISS] — 3 piliers qualité confirmés désarmés/partiels (re-vérif demandée) — affaiblit la justification de toute cette complexité
- confidence: verified
- evidence: .github/workflows/ci-cd-backend.yml:139,395,405,411 : job `mutation` Stryker toujours `if: false` (« mutation thresholds NOT enforced anywhere », instructions de ré-armement en commentaire). Donc la qualité des tests qui « justifie » les circuit breakers/strategies n'est PAS mesurée par mutation gate. (Maestro e2e faux-vert / frozen-test honor-system : non re-lus en détail ici faute de scope dimension, mais le 1er pilier est confirmé éteint au niveau code workflow.)
- claim-vs-reel: La cartographie 360 disait Stryker désarmé ; la mémoire suggérait des remédiations. Au niveau du workflow réel AUJOURD'HUI, le gate mutation reste `if: false`. Pertinent pour KISS : on empile des FSM/strategies sophistiquées (ThreeStateCircuit, CostTripStrategy) dont la robustesse n'est pas validée par mutation testing.
- reco: Hors-dimension stricte, mais : ré-armer le mutation gate sur le périmètre circuit-breaker/cost-guard AVANT d'ajouter de nouvelles couches résilience — sinon on accumule de la complexité non prouvée.

### LESS-04 [LESSONS] — Pilier Stryker désarmé (if:false) — mais désormais HONNÊTEMENT documenté (correction de l'audit 360)
- confidence: verified
- evidence: .github/workflows/ci-cd-backend.yml:395-411 : job `mutation` toujours `if: false`. Commentaire L397-403 désormais explicite: « DISABLED (deferred post-launch) — re-confirmed 2026-05-31, audit 360. This job has NOT run since 2026-05-09. It is NOT a gate today... do not cite it as an active guard ». Le faux-positif de l'audit (mutation gate présenté comme actif) est corrigé : la doc ne le revendique plus comme garde.
- claim-vs-reel: Audit 360: 'pilier désarmé, faux-vert' / état actuel: toujours désarmé MAIS la dishonnêteté est levée — explicitement marqué non-gate
- reco: Acceptable pour V1 (re-armement = tâche post-launch assumée). La leçon-méta (ne pas revendiquer un faux gate) est respectée. Re-armer post-launch via régénération stryker-incremental.json.

### LESS-05 [LESSONS] — Piliers e2e Maestro + frozen-test : faux-vert remédié / honor-system outillé
- confidence: verified
- evidence: Maestro: museum-frontend/scripts/maestro-run-shard.sh:8 `set -euo pipefail` + L84-85 `exit 1` si FAIL_COUNT>0 → un flow rouge fait échouer le job (plus de summary success malgré fail). Retry boot ci-cd-mobile.yml:476-491 = attempt2 décide l'outcome (pas continue-on-error). Frozen-test: .claude/skills/team/team-hooks/post-edit-green-test-freeze.sh existe + référencé .claude/settings.json + screen-test-coverage sentinel scripts/sentinels/screen-test-coverage.mjs + .github/workflows/sentinel-mirror.yml (anti-bypass).
- reco: Pillars 2 et 3 de l'audit 360 sont structurellement adressés. Le frozen-test reste un hook local d'orchestration (pas un gate CI serveur), limite structurelle connue mais le mécanisme existe et est mirroré côté CI pour screen-coverage.

### LESS-06 [LESSONS] — Leçons à fort impact toutes respectées ET majoritairement enforced par outillage
- confidence: verified
- evidence: TypeORM .set({undefined}): user.repository.pg.ts:89,95-96,117,124-125 utilisent () => 'NULL' ; ESLint rule tools/eslint-plugin-musaium-test-discipline/src/rules/no-typeorm-set-undefined.ts existe. TypeORM RETURNING tuple: monthly-session-quota.repo.pg.ts:68-72 + prune-stale-art-keywords.ts:64 + lead.repository.pg.ts:135,145 guardent Array.isArray(result[0]) / result[1]. readEnvString: tous les process.env.X FE wrappés (apiConfig.ts, _layout.tsx:53-54, plausible.ts:77). Cache keys: llm-cache.service.ts:152-156 folde voiceMode+audioDescriptionMode, chat-media.service.ts:242 tts:v2:<id>:<voice>. Middleware ordering: chat-session.route.ts:106-107 validateBody AVANT monthlySessionQuota. Modal reset+ISO/Intl: QuotaUpsellModal.tsx:90-99 useEffect([visible]) + L116-125 useMemo Intl try/catch. CORS: app.ts:210-211 sentry-trace+baggage. Sentry: sentry.ts:59,66-67 tracePropagationTargets+skipOpenTelemetrySetup+getDefaultIntegrationsWithoutPerformance. Relation<T>: chatMessage.entity.ts:27, chatSession.entity.ts:37,82. ioredis retry/reconnect: index.ts:86,89 + redis-cache.service.ts:22-23. RTL: 0 marginLeft/Right/paddingLeft/Right dans features+shared+app. Emoji: 0 emoji unicode réel (seuls des → en commentaires). TD-RN-01 TouchableOpacity: 0 site restant. TD-RN-03 process.env: 2 sites flaggés désormais conformes.
- reco: Maintenir. La densité de leçons réellement enforced (lint/ast-grep/sentinel/helper dédié comme confidence-upsert.ts:11) explique pourquoi les violations résiduelles sont rares et toutes des tech-debts trackés non-bloquants.

### LESS-07 [LESSONS] — Note doc-vs-code mineure : CLAUDE.md prétend F2 ImageSection 'reste à traiter' mais le fichier n'a plus de margin enfant
- confidence: verified
- evidence: CLAUDE.md §Pièges connus (conteneur coloré) dit « Reste à traiter : F2 bubbleSections/ImageSection ». Lu features/chat/ui/bubbleSections/ImageSection.tsx:75-82 (StyleSheet messageImage) : aucun marginTop/Bottom/Vertical sur enfant — le fichier rend un seul <Image> sans conteneur coloré à enfants margés. Le TODO CLAUDE.md semble stale (refactorisé depuis).
- claim-vs-reel: CLAUDE.md: 'F2 reste à traiter' / code: ImageSection.tsx n'a plus de violation margin-enfant
- reco: Retirer la mention « Reste à traiter : F2 ImageSection » de CLAUDE.md — soit la leçon colored-container est désormais 100% propre, soit re-cibler un autre fichier réel. Doc stale bénigne.

### LIB-POS-01 [OWN-LIBS] — Points forts vérifiés : FSM circuit-breaker, atomicité Lua, plugin ESLint, sentinels — qualité réelle élevée
- confidence: verified
- evidence: Circuit-breaker : séparation primitive/strategy propre (three-state-circuit.ts:28-53), reset transient vs full correctement distingué pour préserver l'accumulateur daily-cap (cost-trip-strategy.ts:63-78, justifié W1-C1), now()-injection partout, 9+ tests comportementaux couvrant toutes transitions (three-state-circuit.test.ts:81-273). Lua rate-limit ATOMIQUE et correct : INCR+PEXPIRE+PTTL en un eval avec re-PEXPIRE défensif si pttl<0 (redis-rate-limit-store.ts:16-28) ; off-by-one cohérent entre chemin Redis (count>limit l.206) et mémoire (count>=limit pré-incrément l.120) — les deux autorisent exactement `limit` requêtes (vérifié par trace manuelle). INCRBYFLOAT_EXPIRE pareillement atomique + parseFloatReply fail-closed (redis-llm-cost-counter.ts:26-45). Plugin ESLint : vrai AST traversal via RuleCreator, messageIds, options configurables, anti-faux-positifs soignés (shorthand/computed skip, isFactoryCallArgument, isAlreadyCoveredByOtherPath — no-inline-test-entities.ts:143-162 ; pattern A+B set/update — no-typeorm-set-undefined.ts:80-118 ; justification+approved-by parsing — no-undisabled.ts:60-90). Sentinel sentry-scrubber-parity.mjs:1-50 = snapshot-hash drift + parité cross-app robuste.
- reco: Conserver ces patterns comme référence ; étendre le même niveau de rigueur aux 4 défauts ci-dessus (notamment AUDIT-01 qui est le seul à impact sécurité).

### PROBREF-01 [OWN-LIBS] — probabilistic-refresh (anti-stampede XFetch-like) : correct, edge cases gérés, Math.random documenté non-crypto
- confidence: verified
- evidence: museum-backend/src/shared/cache/probabilistic-refresh.ts:57-68 — shouldEarlyRefresh garde ttlMs<=0 (l.63, couvre clock-skew négatif), short-circuit elapsedRatio<threshold (l.65), roll linéaire (elapsedRatio-threshold)/(1-threshold) correct (probabilité 0 au seuil → 1 à TTL plein). createBackgroundRefresh (l.121-143) est bien fire-and-forget (void IIFE, pas d'await imposé), TTL positif/négatif via isEmpty, erreurs avalées+loggées avec String(error) homogène. API claire, générique, réutilisable (centralise overpass-cache + nominatim.client). Pas de bug détecté.
- reco: RAS — primitive saine. (Note mineure : la probabilité d'early-refresh n'est pas bornée par un nombre max de refreshers concurrents ; sous très forte charge plusieurs callers peuvent déclencher le background-refresh simultanément, mais c'est fire-and-forget idempotent côté cache donc tolérable.)

### RMAP-06 [ROADMAP] — B2B honesty cleanup vérifié réel sur les surfaces publiques + V2/walk honnêtement marquée absente
- confidence: verified
- evidence: ROADMAP_PRODUCT.md:26 'B2B musée = hypothèse future, 0 musée démarché à ce jour (les 3 musées Bordeaux = données de démo)'. grep 'pilot.*contract|LOI|lettre d'intention' dans les 4 roadmaps = 0. Pages publiques museum-web/src/app/[locale]/b2b/ = formulaire lead-capture (champs museum/role/email/consent), aucun claim de partenariat existant. V2 walk : museum-frontend/features/walk ABSENT, museum-backend/src/modules/walk ABSENT, 0 migration walk_routes/museum_pois (grep migrations vide) — cohérent avec ROADMAP_PRODUCT.md:107 'features/walk/ n'existe pas'. seed-museums.ts:100-152 commente explicitement Aquitaine seul ingest-viable, CAPC/Cité du Vin 'no auto-ingest', Pont de Pierre 'first-class V1 dehors'.
- claim-vs-reel: Le narratif honnêteté B2B (mémoire: claims 'pilots contractés/LOI' étaient mensongers) est tenu : aucun claim mensonger résiduel détecté sur docs publics + web. Les museums Bordeaux sont bien marqués démo. V2 navigué bien marqué future/absent.
- reco: Aucune action — confirmer que le seul résidu 'pilot' est interne (admin web 'B2B-pilot tenant' museum-web/src/app/[locale]/admin/museums/page.tsx:14 + le script RMAP-01), pas un claim public.

### RMAP-07 [ROADMAP] — Échantillon de claims code-cités vérifiés exacts (haute fiabilité de l'audit-trail sur le cœur produit)
- confidence: verified
- evidence: Vérifiés contre le code réel : C10 ChooseAnother (home.tsx:109-113 router.push('/(stack)/museums-picker'), route museum-frontend/app/(stack)/museums-picker.tsx existe, commit 787e2ba9 message exact + `git merge-base --is-ancestor 787e2ba9 HEAD` = YES) ; circuit breakers P0.A6/A7 (langchain.orchestrator.ts:162-177 checkCostBreakerOrThrow + canAttempt l.168, l.556-557 generateWalk) ; halfvec HNSW (migration AddArtworkEmbeddings l.53 halfvec(768), l.72 HNSW + halfvec_ip_ops) ; NPS (NpsScale.tsx + aggregateNps(museumId?) review.repository.pg.ts:113) ; museum_id FK (migration 1779401558315-AddMuseumIdToReviews.ts existe) ; CNIL âge-15 (auth-register-minor-dob.yaml:63 DOB 01/01/2015 FR, l.100 assert 15 ans, shards.json:13) ; maestro-shard ubuntu+KVM+pgvector (ci-cd-mobile.yml:324,348,440,466) ; SEC-PRIVILEGE-ESCALATION honnêtement 🔴 OPEN (changeUserRole.useCase.ts ne compare pas actor.role vs newRole).
- reco: Aucune — la majorité des claims path:line résolvent et font ce qu'ils prétendent. La traçabilité UFR-024 est réelle.

### RMAP-08 [ROADMAP] — 3 piliers qualité 'désarmés' de l'audit 360 : e2e Maestro faux-vert RÉSOLU dans le workflow actuel (re-vérification demandée)
- confidence: verified
- evidence: ci-cd-mobile.yml:551-563 job maestro-summary a 2 gates anti-false-green : (1) `if(totalFails>0){core.setFailed(...)}` après scan des logs FAIL, (2) step 'Fail if any shard did not succeed' l.578-583 `if: needs.maestro-shard.result != 'success'` → exit 1. Commentaire l.560 'Anti-false-green (audit 360 dim.2)'. L'attempt-1 émulateur est continue-on-error (l.458) mais attempt-2 (run réel) ne l'est pas. Contraste avec le finding stale de la cartographie 360 ('summary success malgré 4/4 fail') → corrigé. Frozen-test hook présent (.claude/skills/team/team-hooks/post-edit-green-test-freeze.sh). Stryker reste désarmé (cf RMAP-04).
- claim-vs-reel: La cartographie 360 (que je devais re-vérifier sans la croire) listait 'e2e Maestro faux-vert' comme désarmé ; le workflow ACTUEL a un double-gate anti-false-green explicite. Ce pilier est remédié. Stryker reste le seul pilier qualité réellement désarmé.
- reco: Aucune action e2e. Mettre à jour audit-state/2026-05-31 si re-utilisé comme référence (le faux-vert e2e n'est plus d'actualité).

### SEC-03 [SECURITY] — Gate mutation Stryker toujours désarmé (if:false) — finding P0 antérieur NON remédié, mais assumé post-launch
- confidence: verified
- evidence: .github/workflows/ci-cd-backend.yml:411 `if: false` sur le job `mutation` ; commentaire ligne 397-403 honnête : 'DISABLED (deferred post-launch) — re-confirmed 2026-05-31, audit 360. This job has NOT run since 2026-05-09. It is NOT a gate today... do not cite it as an active guard'. Procédure de ré-armement documentée lignes 405-410.
- claim-vs-reel: La CARTOGRAPHIE-360 flaggait ce pilier 'désarmé' comme P0 ; la mémoire projet n'a JAMAIS prétendu l'avoir remédié pour Stryker. État actuel = toujours off, mais auto-documenté comme dette assumée, pas masqué. Pas un mensonge de doc.
- reco: Hors périmètre sécurité-fuites stricto sensu (c'est un gate qualité-test). À ré-armer post-launch comme prévu. Aucune action sécurité immédiate.

### SEC-04 [SECURITY] — e2e Maestro faux-vert et V2 guardrail enablement — finding P0 antérieur EFFECTIVEMENT remédié (re-vérifié)
- confidence: verified
- evidence: e2e: .github/workflows/ci-cd-mobile.yml:563-564 (totalFails>0 → core.setFailed) + 572-576 (needs.maestro-shard.result != 'success' → exit 1) — double gate anti-faux-vert réel. V2 guardrails: museum-backend/src/modules/chat/chat-module.ts:201,475-533,877,884 — LlmJudgeGuardrail + LLM Guard sidecar (circuit breaker + audit) câblés dans le VRAI composition root ; LLM Guard fail-CLOSED vérifié (museum-backend/src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts:412-415 `allow:false`), judge fail-OPEN, judgeTimeoutMs default=1500 (museum-backend/src/config/env.ts:431, le bump 500→1500 de la mémoire est exact).
- claim-vs-reel: La mémoire projet prétendait ces remédiations faites (commits dd227d64/68d82c68/4738f7ad) — RE-VÉRIFIÉ dans les workflows et le code réels : c'est exact, ces deux piliers sont genuinement ré-armés.
- reco: Aucune. Confirmation positive.

### SEC-05 [SECURITY] — Google OAuth Client ID en clair dans .env.example — non-secret par design
- confidence: verified
- evidence: museum-backend/.env.example:111-112 GOOGLE_OAUTH_CLIENT_ID=498339023976-...apps.googleusercontent.com . Aucun client SECRET, aucune clé sk-/AKIA/ghp_/private-key trouvée dans le source (scan grep -rnE sur 3 apps + packages, hors tests/example : 0 résultat). .env tracké = .env.host-mode/.env.production.example/.env.local.example etc., tous sans valeurs sensibles.
- reco: Aucune. Un OAuth Client ID est un identifiant public embarqué dans les apps client (≠ Client Secret). Acceptable.

### PILLAR-02 [TESTS] — Maestro false-green GENUINEMENT remédié (double garde)
- confidence: verified
- evidence: .github/workflows/ci-cd-mobile.yml:563-564 (`if (totalFails > 0) core.setFailed(...)` scan des logs FAIL) + ceinture-bretelles lignes 572-576 (`if: needs.maestro-shard.result != 'success' → exit 1`). Le runner réel museum-frontend/scripts/maestro-run-shard.sh:79-84 incrémente FAIL_COUNT et fait `exit 1` sous `set -euo pipefail`; maestro-emulator-script.sh appelle le runner sans `|| true` masquant.
- claim-vs-reel: La cartographie-360 disait "summary success malgré 4/4 fail". Réalité ACTUELLE: deux gardes indépendantes (scan log + résultat matrix) rendent impossible un summary vert avec un shard rouge. Pilier réellement réarmé.
- reco: RAS. Garder les deux gardes (la ceinture-bretelles couvre le cas où un shard crash avant d'écrire des logs parsables).

### TQ-05 [TESTS] — Discipline factories DRY réellement enforced (pas honor-system)
- confidence: verified
- evidence: museum-backend/package.json:15,17 — `lint` chaîne `lint:test-discipline` (eslint -c eslint.config.test-discipline.mjs sur tests/ avec --max-warnings=0). La règle musaium-test-discipline/no-inline-test-entities est `error` (eslint.config.test-discipline.mjs:42) pour tout path non baseliné; baseline = 15 fichiers grandfathered, ne peut que rétrécir (baselines/no-inline-test-entities.json). Idem FE: eslint.config.mjs:212 `error` + baseline 12 entrées + detectShapeMatch.
- reco: RAS. C'est un vrai gate (tourne dans le quality job CI via pnpm lint). Continuer à shrinker le baseline.

### TQ-06 [TESTS] — Tests e2e/guardrail/voice de très haut niveau: vrais boundaries, assertions de valeur fortes, anti-tautologie
- confidence: verified
- evidence: tests/e2e/chat-guardrail-chain.e2e.test.ts:38-52 — sentinelle de quarantaine ZZQUARANTINE9137 prouvant un REMPLACEMENT wholesale (pas un scrub) + assertions invokeCount (V1 short-circuit AVANT le modèle). tests/unit/chat/voice-pipeline-shape.test.ts:74-91,134-148 — STT→LLM→TTS réel, seul OpenAI stubbé, asserts d'égalité exacte + ownership 404. tests/unit/chat/chat.service.guardrail-v2.test.ts:96-111 — bornes de confiance 0.55/0.60/0.62 testées. Aucun expect(true).toBe(true), aucun .only/fit/fdescribe leak (grep vérifié), 0 snapshot BE / 3 FE / 1 web.
- reco: RAS — c'est le standard à généraliser. La qualité INTRINSÈQUE des tests applicatifs est expert-grade; le déficit est dans le GATING/enforcement (PILLAR-01/03, TQ-01..04).

### TYPE-04 [TYPE] — Baselines du brief largement périmées — le typage prod est bien plus propre qu'annoncé
- confidence: verified
- evidence: Vérifié par grep+Grep (rg banni car corrompu) : BE src `as any`=0 (brief annonçait des casts ; museum-backend/eslint.config.mjs:367 `no-non-null-assertion:'error'` explique 0 non-null assertion en src). BE src `: any`=18 mais 16/18 sont du TEXTE de commentaire ('Fail-open: any error', etc.) — seul strip-free-text.ts:249 `data: any` est un vrai type, justifié byte-for-byte par la signature MaskFunction de langfuse-core (eslint.config justif l.247 + ADR spec citée). `as unknown` BE src=19, tous boundary/generic légitimes (JSON.parse...as unknown, Zod safeParse, type predicate hasPgPool data-source.ts:105 qui REMPLACE un ancien cast). WEB src `as unknown`=45 dont 43 en __tests__ (dict-symmetry i18n) ; 1 seul en prod. FE prod (app/features/shared/components) : as any=0, as unknown prod tous justifiés (Sentry SDK, file as Blob polyfill RN, JSON.parse as unknown). Wire OpenAPI museum-frontend/shared/api/generated/openapi.ts : `: any`=0, `unknown`=132 (défaut sûr openapi-typescript).
- claim-vs-reel: Le brief citait BE ':any'=18 / 'as unknown' BE=19/WEB=45 / eslint-disable BE=132 — chiffres bruts corrects mais trompeurs sans lecture : la quasi-totalité est soit du commentaire, soit du test, soit des casts de frontière justifiés. Sur les 96 eslint-disable @typescript-eslint en BE src, UN SEUL est no-explicit-any (justifié) ; le reste = require-await/prefer-nullish/no-unnecessary-condition (stylistique/défensif, jamais masquant un trou de type).
- reco: Aucune action sur l'existant — c'est du code expert. Ne PAS lancer de chasse aux casts : ils sont les bons. Concentrer l'effort sur l'enforcement futur (TYPE-01/02).

### TYPE-05 [TYPE] — FE no-unsafe-enum-comparison disablé 7× mais tous justifiés (frontière mock), jsonb/DTO BE typés par interfaces nommées
- confidence: verified
- evidence: museum-frontend/features/chat/ui/CartelScannerSheetContent.tsx:79,113,129 — eslint-disable no-unsafe-enum-comparison avec justification explicite + `Approved-by: B4-green-2026-05-14` (mock expo-camera ne ré-exporte pas PermissionStatus ; valeurs enum == string literals runtime). Colonnes jsonb BE toutes typées : chatSession.entity.ts:58 `coordinates?: {lat:number;lng:number}|null`, :61 `visitContext?: VisitContext|null`, museum.entity.ts:86 `geofenceBbox?: {north,south,east,west}|null`, wikidata-kb-dump.entity.ts:56 `facts!: ArtworkFacts` — aucune colonne jsonb en `any` ou `Record<string,any>` (grep Record<string,any> BE=0).
- reco: RAS. Les disables FE respectent la doctrine projet (justif ≥20 chars + Approved-by). Bon modèle à maintenir.


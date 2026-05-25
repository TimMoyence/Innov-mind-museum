# C9 — LEADS (B2B signup + Brevo) E2E trace

**Branche** `dev` @ HEAD `89852f2a1` · audit READ-ONLY · 2026-05-25
**Méthode** : Grep + Read (gitnexus non requis — module isolé, 11 fichiers). path:line vérifiés.

---

## Diagramme entrée → data

### Flux 1 — Beta signup (landing)
```
museum-web BetaSignupSection.tsx:51
  └ validate() email+consent FE (BetaSignupSection.tsx:65) ; honeypot non-vide → succès UX masqué (l.103)
  └ fetch POST /api/leads/beta (l.37,76) body {email,consent:true,website}
       └ next.config.ts:42-43 rewrite /api/:path* → API_BASE_URL/api/:path* (prod = backend)
            └ api.router.ts:403  router.use('/leads', leadsRouter)
                 └ leads.route.ts:79  POST /beta
                      ├ betaSignupLimiter (l.30) 5/600s/IP  [Redis shared OU mémoire per-pod]
                      ├ validateBody(submitBetaSignupSchema)  schemas:26  email/consent literal true/website
                      └ submitBetaSignupUseCase.execute (useCase/submitBetaSignup.useCase.ts:32)
                           ├ R11 consent re-check (l.34) → 400 si false
                           ├ validateEmail + lowercase (l.38-39)
                           ├ R10 honeypot website.trim()>0 → SILENT drop + return (l.44-50)
                           └ notifier.subscribe(payload) (l.67)
                                └ BrevoBetaSignupNotifier.subscribe (brevo-beta-signup.notifier.ts:29)
                                     └ fetch POST https://api.brevo.com/v3/contacts (l.30)
                                          listIds:[BREVO_BETA_LIST_ID], updateEnabled:true,
                                          attributes OPT_IN/OPT_IN_AT/OPT_IN_SOURCE='landing_beta_waitlist' (l.47)
                      └ res 202 {accepted:true} (leads.route.ts:99)  [tous outcomes → 202]
DATA → Brevo contacts list (BREVO_BETA_LIST_ID). PAS de table locale.
```

### Flux 2 — B2B contact form
```
museum-web B2bContactForm.tsx:24
  └ fetch POST /api/leads/b2b (l.54) body {email,name,museum,role,message,consent:true,website}
       └ leads.route.ts:46  POST /b2b  (b2bLeadLimiter l.21 5/600s/IP)
            └ validateBody(submitB2bLeadSchema schemas:10)
            └ submitB2bLeadUseCase.execute (submitB2bLead.useCase.ts:38)
                 ├ consent/email/name/museum/role/message re-validation (l.39-66)
                 ├ R10 honeypot silent drop (l.70-76)
                 └ notifier.notify(payload) (l.97)
                      └ EmailB2bLeadNotifier.notify (b2b-lead-email.notifier.ts:17)
                           └ BrevoEmailService.sendEmail(b2bInbox, subject, html)  TRANSACTIONNEL
DATA → email one-shot vers B2B_INBOX_EMAIL (fallback SUPPORT_INBOX_EMAIL). PAS de table, PAS de contact Brevo.
```

### Flux 3 — Paywall lead capture (mobile)
```
museum-frontend QuotaUpsellModal.tsx:147 onSubmit (consent gate l.134)
  └ leadsApi.submitPaywallInterest (leadsApi.ts:35)
       └ httpClient.post('/api/leads/paywall-interest', {email,consent:true,website}) (leadsApi.ts:36)
            └ leads.route.ts:107  POST /paywall-interest  (paywallInterestLimiter l.39 5/600s/IP)
                 └ validateBody(submitPaywallInterestSchema schemas:39)
                 └ submitPaywallInterestUseCase.execute (submitPaywallInterest.useCase.ts:31)
                      ├ consent/email/honeypot mirror R3 (l.32-48)
                      ├ source='paywall_premium_interest' hardcodé (l.58)
                      └ notifier.subscribe(payload) → MÊME singleton betaSignupNotifier (index.ts:40)
                           └ Brevo /v3/contacts, OPT_IN_SOURCE='paywall_premium_interest'
                      └ log emailDomain + brevoOutcome (l.66-71, PII-safe)
DATA → Brevo contacts list, cohorte source paywall. PAS de table locale.
```

### Flux 4 — GDPR erasure (account delete → Brevo removeContact)
```
deleteAccount.useCase.ts:108 (step 3, AVANT cascade DB l.119)
  └ this.brevoRemoval.removeContact(user.email) best-effort try/catch (l.110-116)
       └ brevoRemovalProxy (auth/useCase/index.ts:190) lazy import (évite dep statique auth→leads)
            └ BrevoBetaSignupNotifier.removeContact (brevo-beta-signup.notifier.ts:82)
                 └ fetch DELETE /v3/contacts/{email}?identifierType=email_id (l.83)
                      2xx/204 → deleted ; 404 → not_found idempotent (l.98-103) ; autre → throw
```

---

## ✅ Solide

- **Honeypot serveur-side bien rejeté** — les 3 use cases re-vérifient `website.trim().length>0` côté serveur (submitBetaSignup l.44-50, submitB2bLead l.70-76, submitPaywallInterest l.42-48) → SILENT drop, pas seulement FE. Whitespace-only correctement traité comme vide (anti faux-positif password-manager). FE pose toujours la requête (BetaSignupSection l.85-90) → timing parity anti-énumération.
- **Consent defense-in-depth** — `z.literal(true)` au schéma (schemas:16,28,42) ET re-check runtime `if(!input.consent)` dans chaque use case (l.34/39/32) → bloque curl direct contournant le schéma.
- **PII data-minimisation** — `extractEmailDomain` (extractEmailDomain.ts:17) pur, retourne domaine après dernier `@`, fallback `'unknown'`. Full email JAMAIS loggé ; logs émettent `emailDomain`/`requestId`/`brevoOutcome` uniquement (submitPaywallInterest l.66-71, notifier l.61-64,99-101).
- **Anti-énumération** — duplicate Brevo (400 `duplicate_parameter`) → outcome `duplicate` mappé 202 (notifier l.58-66) ; tous outcomes → 202 (route l.99). Pas de fuite "email déjà inscrit".
- **API-key jamais leakée** — erreurs Brevo slice body 800 char, api-key jamais concaténée (notifier l.69-71, 107-109).
- **GDPR erasure câblée** — removeContact appelé AVANT cascade DB (deleteAccount l.106-110, ordering correct car email = identifiant), best-effort try/catch, 404 idempotent. Lazy-import évite couplage statique auth→leads.
- **Noop fallback honnête** — creds Brevo absents → NoopBetaSignupNotifier (index.ts:34) log `beta_signup_notifier_noop` + 202 (deploy sans Brevo OK, opérateur monitore le warn). `BREVO_BETA_LIST_ID` = config pas feature-flag (UFR-015 respecté, index.ts:1-6).
- **Rate-limit isolé par endpoint** — 3 limiters distincts (route l.21/30/39) → spike sur /beta n'affame pas /b2b.

## ⚠️ Faible / rupture

- **🔴 SÉVÉRITÉ HAUTE — Lead perdu si Brevo down, AUCUNE table locale.** Aucune entité/migration `leads`/`waitlist`/`beta_signup` (grep `src/data` vide). Beta + paywall : si `fetch` Brevo throw (5xx/timeout/réseau), `subscribe` propage l'exception → la requête échoue **après** le 202 logique ? Non : `await this.notifier.subscribe` (submitBetaSignup l.67) throw AVANT le `res.status(202)` → route renvoie 500, lead **définitivement perdu** (pas de retry, pas de queue, pas de persistance). Single point of failure Brevo. Pour un canal de capture de leads pré-launch c'est une rupture de durabilité.
- **🟠 SÉVÉRITÉ MOYENNE — Rate-limit namespace NON stable cross-deploy (Redis).** Les 3 limiters ne passent PAS `bucketName` (leads.route.ts:21,30,39) → reçoivent `anon-1/2/3` via `nextAnonymousBucketName()` (rate-limit.middleware.ts:64,175) dépendant de l'ordre de chargement des modules. La doc du middleware (l.46-49) dit explicitement de passer un nom explicite « for stable Redis keys across deployments ». Conséquence : un redéploiement peut réattribuer quelle clé Redis appartient à quel limiter → reset/collision transitoire des compteurs. Per-IP est correct, mais le namespace est fragile. (Comparer : daily-chat-limit passe une clé stable.)
- **🟠 SÉVÉRITÉ MOYENNE — Rate-limit per-pod si Redis absent.** `setRedisRateLimitStore` est câblé au bootstrap prod (index.ts:117-118) → en prod avec Redis, compteur **partagé cross-pod** (bon). MAIS si Redis tombe : `failClosed` défaut = `isProduction=true` (env.ts:198) → 503 (bon, pas de bypass). En l'absence totale de Redis (dev/pré-prod sans `setRedisRateLimitStore`), fallback `consumeMemoryBucket` = **per-process → 5×N pods**. Acceptable vu fail-closed prod, mais à noter : la garantie "5/IP global" dépend entièrement de la santé Redis.
- **🟡 SÉVÉRITÉ BASSE — B2B lead = email transactionnel, pas de trace structurée.** submitB2bLead → email one-shot vers inbox (b2b-lead-email.notifier.ts:32). Si l'email échoue (Brevo transactionnel down), `notify` throw → 500, lead perdu, ET aucune persistance. Même classe de fragilité que le flux beta mais avec un canal différent.

## 🔧 Gaps E2E

- **🔴 OpenAPI `/leads/*` ABSENT du contrat.** `openapi/openapi.json` = 76 paths, ZÉRO `/leads` (vérifié `python3 json` → `[]`). Spec hand-maintained (check-openapi-spec.cjs valide la forme, n'introspecte pas les routes) → les 3 endpoints publics échappent au contract-test (`tests/contract/openapi/*`). Le FE le sait : `leadsApi.ts:11-12` TODO « currently absent from generated/openapi.ts ». Gap de gouvernance : endpoints publics non-documentés, non couverts par les tests contract request/response.
- **🟠 Unsubscribe one-click (P0.B2) NON backé côté code.** Aucun endpoint/handler `unsubscribe`/`List-Unsubscribe`/opt-out (grep vide hors `opt_in`). Le seul mécanisme de retrait = `removeContact` déclenché par account-delete (GDPR Art.17). Pas de lien one-click email-driven → repose entièrement sur les liens d'unsubscribe natifs Brevo (hors-repo, non vérifiable ici). Si P0.B2 exige un backing applicatif, il n'existe pas.
- **🟡 Pas de dédup/idempotence applicative** — l'idempotence repose sur `updateEnabled:true` + détection `duplicate_parameter` de Brevo (notifier l.40,60). Pas de garde locale → chaque submit = un appel réseau Brevo (rate-limit IP = seule protection volume).
- **🟡 B2B et beta divergent sur la destination data** — B2B → email humain (pas de CRM/list), beta+paywall → liste Brevo. Les leads B2B ne sont nulle part requêtables/exportables programmatiquement (dépend de la boîte mail inbox). Pour un canal B2B « hypothèse future » (CLAUDE.md) c'est cohérent, mais à acter.

---

## Santé E2E : 6.5/10

Câblage propre, hexagonal correct, honeypot+consent+PII solides, GDPR erasure câblée. Plombé par : **durabilité lead nulle** (Brevo = SPOF, pas de table/queue/retry), **OpenAPI absent**, **unsubscribe one-click non backé**, **namespace rate-limit instable cross-deploy**.

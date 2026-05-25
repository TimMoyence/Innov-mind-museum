# C5 — PAYWALL / QUOTA / TIER — E2E audit

Branche `dev` @ `89852f2a1`. Read-only (UFR-022). Tout `path:line` vérifié (Read/Grep). « supposé » tagué explicitement.

## Verdict

**Santé E2E : 8/10.** Flux complet, atomique, isolé, RGPD-soigné. Une asymétrie de consentement (BE-emit non gaté), un soft-paywall qui bloque réellement (pas un stub passif), pas de display de tier côté app, et `quota_exceeded` émis sans User-Agent/IP (drop bot-filter Plausible probable).

---

## Diagramme entrée → data

```
QUOTA ENFORCEMENT (block path)
──────────────────────────────
FE  POST /api/sessions
     httpClient → BE
BE  chat-session.route.ts:103  router.post('/sessions',
       isAuthenticated                       :105   ← anon n'atteint JAMAIS le quota (401 avant)
       validateBody(createSessionSchema)      :106   ← Zod 400 short-circuit AVANT counter (anti-inflation, gotcha)
       monthlySessionQuota                    :107
     monthly-session-quota.middleware.ts:133
       req.user?.id absent  → next()          :139-142   (anon bypass — by design, anon n'a pas de session create authentifié)
       repo null            → next() fail-OPEN:144-149
       row null | premium   → next()          :151-156   (premium bypass + fail-open absent row)
       resolveLimit()=3 (env|fallback)        :67-71
       firstOfCurrentUtcMonth() (UTC)         :52-55
       repo.tryConsume(userId, monthStart, 3) :160
     monthly-session-quota.repo.pg.ts:33  UPDATE users
         SET count = CASE month-match THEN +1 ELSE 1, month_start=$2
         WHERE id=$1 AND tier='free' AND (start IS NULL OR start<>$2 OR count<limit)
         RETURNING …                          :41-57   ← atomic single-SQL, row-lock serialise (pas de race)
       consumed != null → next() (201 session):162-165
       consumed == null →
         logHitOnce(once/user/month)          :167,77-92
         emitQuotaExceeded → telemetry port   :168,99-119  (Plausible 'quota_exceeded', props{tier,limit})
         402 {code:QUOTA_EXCEEDED,tier,currentCount,limit,resetAt,message} :169,121-131
DATA  users.tier varchar(16) def 'free'       user.entity.ts:147-148
      users.sessions_month_count int def 0    :155-156
      users.sessions_month_start date null    :162-163
      migration AddUserTier 1778900000000

402 → PAYWALL MODAL (funnel path)
──────────────────────────────────
BE  402 body {code:QUOTA_EXCEEDED, resetAt:ISO-UTC}
FE  httpClient.ts:270  status===402
       body.code==='QUOTA_EXCEEDED' && paywallHandler :280
       paywallHandler({tier,currentCount,limit,resetAt}) :281-286  (type-guards défensifs)
       → fall-through reject (caller .catch garde son fallback)     :288-290
    PaywallProvider.tsx:92  setPaywallHandler((info)=>open(info))   (mount, leak-safe unmount :95-97)
       open() :65  setReason+setIsOpen(true)
         Sentry breadcrumb 'paywall_modal_shown'   :70-75
         trackFunnelEvent('paywall_modal_shown',{tier}) :82-84
    _layout.tsx:222  <PaywallModalHost/> (mounté root, au-dessus des routes)
       :98-100  usePaywall() → <QuotaUpsellModal visible reason onClose/>
    QuotaUpsellModal.tsx
       useEffect reset on visible→false (email/consent/website/state) :90-99  ← GDPR Art.7 consent renewal
       formattedReset = Intl.DateTimeFormat(lang,{dateStyle:long})   :116-131  ← pas d'ISO brut, fallback raw
       onSubmit :133  !consent→return :134 ; breadcrumb+trackFunnelEvent('paywall_cta_clicked') :136-145
         leadsApi.submitPaywallInterest({email,consent:true,website}) :147-151
         success → trackFunnelEvent('paywall_email_captured') :161-163
         catch → state='error' (modal reste ouvert) :164-166

FUNNEL CONSENT GATE
────────────────────
FE  plausible.ts:102 trackFunnelEvent
       consentPredicate() === hasAnalyticsConsent() :54,107  → faux → 0 fetch  (GDPR Art.7)
       stripPii (canary keys, email/userId…) :40-50,115
       fetch endpoint, header 'X-Musaium-Analytics-Consent: granted' :128
    useAnalyticsConsent.ts  tri-state unset/granted/denied, AsyncStorage :44,47
    ConsentBanner mounté _layout.tsx:231
BE  funnel.route.ts  POST /api/telemetry/funnel
       funnelLimiter 60/600s/IP :38-42
       requireAnalyticsConsentHeader strict ==='granted' sinon 403 :85-101
       validateBody(funnelEventSchema) :107
       stripPropsPii (canary) :70-78,119
       port.emit → 202 :114-124
    api.router.ts:405  router.use('/telemetry', telemetryRouter)
    PlausibleAdapter.emit  no-op si !endpoint|!domain :57-59 ; stripPii :74 ; never-throws :92-99

EMAIL CAPTURE → DATA
─────────────────────
FE  leadsApi.ts:35  POST /api/leads/paywall-interest
BE  api.router.ts:403  router.use('/leads', leadsRouter)
    leads.route.ts:107  paywallInterestLimiter 5/600s/IP :39-43 ; validateBody :110
       CSRF-exempt : POST sans cookie access_token → csrf.middleware.ts:94-97 next()
    submitPaywallInterest.useCase.ts:31
       !consent → 400 :32-34 ; email trim+lowercase+validate :36-39
       honeypot website non-vide → silent-drop + warn :42-48
       notifier.subscribe(source='paywall_premium_interest') :50-61   ← réutilise Brevo BetaSignupNotifier
       log emailDomain only (full email JAMAIS) :66-71
DATA  Brevo contact externe, tag OPT_IN_SOURCE='paywall_premium_interest' (pas de table locale leads)

ADMIN TIER OVERRIDE
────────────────────
FE  (web admin — hors scope mobile)
BE  admin.route.ts:123  PATCH /api/admin/users/:id/tier
       isAuthenticated + requireRole('super_admin') :125-126  (admin/museum_manager refusés)
       validateBody(changeUserTierSchema z.enum['free','premium']) :127, admin.schemas.ts:14-15
    changeUserTier.useCase.ts:26
       valide tier :27-30 ; no-op si previous===new (anti-audit-inflation) :38-40
       repo.changeUserTier :42 ; audit AFTER mutation :47-55 (AUDIT_ADMIN_USER_TIER_CHANGED, from/to)
    admin.repository.pg.ts:137  mutate user.tier only, count/start préservés (R17) :140-142
DATA  users.tier flip → middleware premium bypass au prochain POST /sessions
```

---

## ✅ Solide

- **Quota atomique sans race** — single `UPDATE … WHERE count<limit RETURNING` (`monthly-session-quota.repo.pg.ts:41-57`). Row-lock Postgres sérialise les POST multi-device concurrents ; le 2e voit 0 rows → 402. Pas de read-then-write.
- **Reset mensuel UTC correct** — `CASE WHEN sessions_month_start = $2 THEN +1 ELSE 1` (`repo.pg.ts:43-46`) gère incrément même-mois ET rollover en un round-trip. `monthStart` = 1er du mois UTC (`middleware.ts:52-55`), fuseau UTC pur (pas de drift TZ serveur). `resetAt` = 1er du mois suivant UTC ISO (`:58-61`).
- **Soft-paywall BLOQUE réellement** (pas un stub passif) — 402 court-circuite la création de session (`middleware.ts:169`). « Soft » = dismissible + email-capture, PAS « affiche mais laisse passer ». Le slot n'est jamais consommé.
- **Ordering middleware correct** — `validateBody` AVANT `monthlySessionQuota` (`chat-session.route.ts:106-107`) : Zod 400 short-circuite avant l'UPDATE counter (respecte gotcha "mutating middleware après validators").
- **RGPD modal** — reset state on `visible→false` (`QuotaUpsellModal.tsx:90-99`) ferme la classe RN Modal host-persistant (consent jamais hérité, Art.7). `formattedReset` via `Intl.DateTimeFormat` keyed `[resetAtIso, lang]` (`:116-131`) — pas d'ISO brut, fallback raw défensif. Conforme aux doctrines `feedback` (RN Modal reset + ISO/Intl).
- **Funnel consent double-gate** — FE `trackFunnelEvent` short-circuit `consentPredicate()` AVANT fetch (`plausible.ts:107`, 0 réseau) + header `X-Musaium-Analytics-Consent: granted` (`:128`) ; BE `requireAnalyticsConsentHeader` strict-equality 403 sinon (`funnel.route.ts:85-101`). Defense-in-depth réelle.
- **PII strip triplé** — FE `plausible.ts:40-50` + BE route `funnel.route.ts:70-78` + adapter `plausible.adapter.ts:37-45`. Props paywall = `tier` only (jamais email/userId).
- **Admin override propre** — super_admin-only (`admin.route.ts:126`), no-op idempotent anti-audit-inflation (`changeUserTier.useCase.ts:38-40`), audit après mutation, counter NON touché au flip (`admin.repository.pg.ts:140-142`, R17). E2E : flip → premium bypass immédiat (`middleware.ts:152`).
- **Anon bypass = par design correct** — `/sessions` est `isAuthenticated` (`chat-session.route.ts:105`) : un anon est rejeté 401 AVANT le quota. Le `!user?.id → next()` (`middleware.ts:139-142`) est un fail-open défensif jamais atteint en prod sur cette route (auth gate précède). Pas de fuite quota.
- **Email capture** — honeypot silent-drop (`submitPaywallInterest.useCase.ts:42-48`), email full jamais loggé (`:66-71`), CSRF-exempt légitime (public, sans cookie → `csrf.middleware.ts:94-97`).

## ⚠️ Faible / rupture

- **[MOYEN] Asymétrie consentement : `quota_exceeded` BE-emit NON gaté consentement** — `emitQuotaExceeded` (`middleware.ts:99-119`) appelle `getTelemetryPort().emit()` directement, contournant `requireAnalyticsConsentHeader` (`funnel.route.ts:85`) qui ne protège QUE le proxy FE. Le `PlausibleAdapter` (`plausible.adapter.ts:53`) n'a AUCUN gate de consentement. Donc `quota_exceeded` part vers Plausible quel que soit le consentement de l'utilisateur, alors que les 3 events FE (`paywall_modal_shown/cta_clicked/email_captured`) sont strictement gatés. Atténuation : Plausible cookieless + props `{tier, limit}` sans PII (arguable exempté ePrivacy Art.5(3)). Mais l'incohérence de politique mérite une décision explicite (ADR) ou un gate BE.
- **[MOYEN] `emitQuotaExceeded` n'envoie ni User-Agent ni IP** — `middleware.ts:101-113` passe `userAgent: req.get('user-agent')` mais PAS de `clientIp`… en fait `:111-112` passe `userAgent` + `clientIp: req.ip`. Vérifié : les deux sont passés. **Re-correction : ce point est INVALIDE — les deux headers sont fournis (`:111-112`), donc le bot-filter Plausible (PATTERNS §7) reçoit bien IP+UA.** Pas de rupture ici. *(garde-trace honnêteté UFR-013 : hypothèse initiale infirmée à la relecture.)*
- **[FAIBLE] `currentCount` rapporté dans le 402 = pré-tentative, potentiellement stale** — `respondQuotaExceeded(res, row.sessionsMonthCount, …)` (`middleware.ts:169`) utilise le `row` chargé par `loadUser` (`:151`) AVANT le `tryConsume`. Sous forte concurrence le compteur réel a pu bouger. Cosmétique (affichage seulement, l'enforcement est atomique). Sévérité faible.
- **[FAIBLE] Pas de display de tier côté app mobile** — recherche `tier` dans `features/**.tsx`/`app/**.tsx` ne renvoie que des faux-positifs (commentaire dans `chat/ui/StatusIndicator.tsx:32`). Aucun badge "free/premium", aucun compteur "X/3 sessions restantes". L'utilisateur free ne voit son statut qu'au moment du 402. Mission listait "tier display" comme attendu — **absent**. Décision produit ? (acceptable pour soft-paywall V1 stub, mais à confirmer).

## 🔧 Gaps E2E

- **`quota_exceeded` consent policy** — décider : (a) gate BE le `quota_exceeded` derrière le consentement utilisateur (nécessite propager le statut consent jusqu'au middleware — non trivial, le consentement vit côté FE/AsyncStorage), ou (b) ADR documentant que les events server-side cookieless sans PII sont exemptés. Actuellement implicite/non documenté.
- **OpenAPI `/api/leads/paywall-interest` absent** — `leadsApi.ts:8-12` TODO : la route n'est pas dans `shared/api/generated/openapi.ts`, donc payload typé à la main (`PaywallLeadPayload`) sans contrat généré. Drift FE↔BE possible si le schéma Zod évolue. Vérifier que `submitPaywallInterestSchema` est exposé dans la spec OpenAPI BE.
- **Pas de table locale `leads`** — l'email part vers Brevo (externe) uniquement (`submitPaywallInterest.useCase.ts:50-61`). Aucune persistance locale → si Brevo down/erreur, le lead est perdu (le `notifier.subscribe` outcome est loggé mais pas re-tenté/stocké). Gap de durabilité pour le funnel KR4.
- **Tier display / compteur restant** — si produit veut un signal proactif (« 1 session restante ce mois »), il faut exposer `sessionsMonthCount`/`limit` via un endpoint `/me` ou enrichir la réponse `/sessions` 201. Actuellement zéro feedback avant le hard-stop 402.
- **Couverture Maestro** — flows présents (`maestro/paywall-quota-exhaustion.yaml`, `.maestro/modal-paywall-quota-upsell.yaml`) + route dev `app/(dev)/paywall-preview.tsx`. Non exécutés dans cet audit read-only ; tap-through happy-path à confirmer en CI.

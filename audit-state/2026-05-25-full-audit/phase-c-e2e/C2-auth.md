# C2 — AUTH feature E2E trace (entrée → data)

Audit READ-ONLY, branche `dev`, fresh-context UFR-022. Citations `path:line` vérifiées (Read/Grep), pas supposées.
Légende sévérité : **CRIT** / **HIGH** / **MED** / **LOW**.

Note de routage : tous les paths backend ci-dessous sont montés via
`museum-backend/src/shared/routers/api.router.ts:367-374` :
- `/api/auth/consent` → consentRouter
- `/api/auth/mfa/*` → mfaRouter (AVANT le catch-all, L370)
- `/api/auth/*` → authRouter (compose session/google-oauth/profile/password/email/api-keys/super-admin — `auth.route.ts:14-20`)
- `/api/users/me/export` → meRouter (DSAR)

---

## 1. Diagramme des flux entrée → data

### A. REGISTER (DOB hard-required, age 15)
```
FE RegisterForm.tsx (parseDateOfBirth, submit gated L177-178)
  → useEmailPasswordAuth.ts:100-118 (registerMutation, normalizeDob L107-111)
  → authApi.register → POST /api/auth/register
BE auth-session.route.ts:72-100 (registerLimiter + validateBody(registerSchema))
  → register.useCase.ts:51 execute
     ├─ validateEmail (L54)
     ├─ assertDigitalMajority L104-123  ← falsy DOB hard-fail 400 (L108), <15 → 422 MINOR_PARENTAL_CONSENT_REQUIRED (L116)
     ├─ validatePassword + assertPasswordNotBreached (HIBP, fail-open) L60-68
     ├─ userRepository.registerUser → user.repository.pg.ts:32-53 (bcrypt hash, dateOfBirth→Date L50)
     ├─ recordTosConsent (grantConsentUseCase, non-blocking L131-151) → user_consents
     └─ sendVerificationEmail (issueEmailToken: raw emailed / sha256 persisted) L154-180 → users.verification_token
  → audit AUDIT_AUTH_REGISTER (route L89-97) → audit_logs
DATA: users (INSERT), user_consents (INSERT tos_privacy), audit_logs
```

### B. LOGIN (rate-limit Redis + lockout, MFA gate)
```
FE useEmailPasswordAuth.ts:90 authService.login → POST /api/auth/login
BE auth-session.route.ts:102-132 (loginLimiter → validateBody → loginByAccountLimiter [post-validate, L106-107])
  → authSession.service.ts:89 login
     ├─ checkLoginRateLimit (login-rate-limiter.ts:151) — sliding 10/10min + lockout 2^n, fail-CLOSED 503 si Redis degraded (L192)
     ├─ getUserByEmail / bcrypt.compare ; recordFailedLogin sur échec (L99,110)
     ├─ deletedAt → 403 ACCOUNT_DELETED ; suspended → 403 ; !email_verified → 403 (L116-142)
     ├─ clearLoginAttempts (L144)
     ├─ mfaGate.evaluateMfaGate (mfa-gate.service.ts:65) → {mfaRequired} | {mfaEnrollmentRequired} | null
     └─ sessionIssuer.issueSession (session-issuer.service.ts:57) → JWT pair + refresh row
  → 3 enveloppes (route L114-125) : mfaRequired 200 / mfaEnrollmentRequired 403 / success 200 + setAuthCookies + audit
DATA: auth_refresh_tokens (INSERT), users.mfa_enrollment_deadline (UPDATE 1er login admin), audit_logs
```

### C. OAUTH GOOGLE (server-driven)
```
FE socialAuthProviders / TokenExchangeFlow → GET /api/auth/google/initiate?platform=
BE auth-google-oauth.route.ts:216-248 (nonce issue + signGoogleOAuthState JWT) → 302 Google
Google → GET /api/auth/google/callback (L255-306)
  → parseCallback (env+error+code/state L122) → verifyState (sig/exp L164)
  → loginFromVerifiedState L178 : exchangeGoogleAuthCode (code→id_token) → socialLoginUseCase.execute('google', idToken, nonce)
  → audit AUDIT_AUTH_SOCIAL_LOGIN (L286)
  → web: setAuthCookies + admin-authz cookie + 302 returnTo (sanitizeReturnTo anti-open-redirect L54-62)
  → mobile: socialOtcStore.issue(session) → 302 musaium://auth/google/callback?code=<otc>
       → FE redeemSocialCode → POST /api/auth/social-redeem (route L220-232)
         → redeemSocialOtcUseCase.execute → otcStore.consume (GETDEL single-use) → 401 INVALID_OTC sur replay
DATA: social_accounts (link), users (registerSocialUser si nouveau, password=null email_verified=true), auth_refresh_tokens
```

### D. TOTP / MFA
```
ENROLL  : FE MfaEnrollScreen → POST /api/auth/mfa/enroll (isAuthenticated+enrollLimiter, mfa.route.ts:116)
            → enrollMfaUseCase → totp_secrets (secret chiffré) + recoveryCodes plain renvoyés 1×
          → POST /api/auth/mfa/enroll/verify (L133) → verifyMfaUseCase.ts:25 (TOTP + replay last_used_step L56) → markEnrolled + clear mfa_enrollment_deadline
CHALLENGE: POST /api/auth/mfa/challenge (challengeSchema + challengeLimiter bySessionOrIp, mfa.route.ts:155)
            → challengeMfaUseCase.ts:25 (verifyMfaSessionToken → verifyTotpCode → replay step L68-75 → markUsed) → issueSessionForUser
RECOVERY: POST /api/auth/mfa/recovery (L202) → recoveryMfaUseCase.ts:26 (findRecoveryCodeIndex constant-time L62-77 → markCodeConsumed) → session
DISABLE : POST /api/auth/mfa/disable (isAuthenticated+disableLimiter, L230) → disableMfaUseCase.ts:17 (assertPasswordReauth → deleteByUserId)
DENYLIST: isAuthenticated (authenticated.middleware.ts) → verifyAccessTokenWithClaims → denylist.has(jti) → 401 TOKEN_REVOKED
DATA: totp_secrets (secret_encrypted, enrolled_at, last_used_step, recovery_codes jsonb), users.mfa_enrollment_deadline, audit_logs
```

### E. REFRESH (interceptor single-flight) + LOGOUT (denylist)
```
REFRESH FE: httpClient.ts:94 runAuthRefresh (single-flight inflightRefresh L98-123)
            → AuthContext authRefreshHandler L235-265 → authService.refresh → POST /api/auth/refresh
BE auth-session.route.ts:134-146 → authSession.service.ts:176 refresh
   → verifyRefreshToken → findByJti → assertRefreshTokenUsable (session-issuer.service.ts:114 : hash mismatch/revoked/rotated/reuseDetected → revokeFamily ; expiry ; idle window) → rotate
LOGOUT FE: AuthContext.logout L295-322 (clear feature storage AVANT tokens B8 ; clearPersisted ; resetPersistedCache ; router.replace AUTH_ROUTE ; authService.logout best-effort)
BE auth-session.route.ts:148-181 → bearer extrait+vérifié → authSession.service.ts:226 logout
   → revokeByJti(refresh) + accessTokenDenylist.add(jti, ttl) si ttl>0 — idempotent, jamais throw
DATA: auth_refresh_tokens (rotate/revoke), Redis denylist (access jti TTL ≤15min)
```

### F. PASSWORD RESET / FORGOT / EMAIL CHANGE / VERIFY (single-use tokens)
```
FORGOT  : POST /api/auth/forgot-password (passwordResetLimiter, auth-password.route.ts:50)
            → forgotPassword.useCase.ts:19 — non-enumerant (return undefined si !user L28 / !email_verified L32) → setResetToken (sha256)
RESET   : POST /api/auth/reset-password (L74) → resetPassword.useCase.ts:23
            → validatePassword + breach → consumeResetTokenAndUpdatePassword (user.repository.pg.ts:85 ATOMIC UPDATE…WHERE token AND expires>NOW() RETURNING, clear via ()=>'NULL') → revokeAllForUser
CHANGE-PW (authed): PUT /api/auth/change-password (isAuthenticated, L29) → changePassword.useCase (assertPasswordReauth L23)
CHANGE-EMAIL (authed): PUT /api/auth/change-email (L31) → changeEmail.useCase.ts:20 (assertPasswordReauth L26 ; setEmailChangeToken sha256)
CONFIRM-EMAIL: POST /api/auth/confirm-email-change (L60) → confirmEmailChange.useCase.ts:19 (consumeEmailChangeToken ATOMIC promote pending_email L163, clear ()=>'NULL') → revokeAllForUser
VERIFY-EMAIL: POST /api/auth/verify-email (L77) → verifyEmail.useCase.ts:9 → verifyEmail (user.repository.pg.ts:115 ATOMIC, clear ()=>'NULL' → pas de replay)
DATA: users.{password,reset_token,email,pending_email,email_change_token,verification_token,email_verified}, auth_refresh_tokens (revoke)
```

### G. DSAR EXPORT (Art.15/20) + DELETE (Art.17 cascade)
```
EXPORT : FE authApi.exportData → GET /api/users/me/export (isAuthenticated + exportLimiter 1/7j byUserId, me.route.ts:42)
           → req.user.id (anti-IDOR L43,48) → exportUserData.useCase.ts:69 (10 ports Promise.all, allow-list par champ L162-216, EXCLUT password/*_token/hash/salt/prevHash/rowHash/TOTP)
           → audit AUDIT_DATA_EXPORT durable AVANT réponse (L60-79) ; >10MB chunked
DELETE : FE authApi.deleteAccount → DELETE /api/auth/account (isAuthenticated, auth-profile.route.ts:149)
           → audit AUDIT_ACCOUNT_DELETED AVANT (L151) → deleteAccountUseCase.ts:69 execute
             1. imageStorage.deleteByPrefix (S3 chat-images + legacy fetcher) best-effort
             2. audioCleanup.deleteUserAudio (S3 TTS) best-effort
             3. brevoRemoval.removeContact(email) best-effort
             4. userRepository.deleteUser (user.repository.pg.ts:220 TXN : DELETE chat_sessions → users)
DATA cascade DB-level vérifié (migrations) : users DELETE → auth_refresh_tokens / social_accounts / api_keys / user_consents / totp_secrets / user_memories TOUS ON DELETE CASCADE.
       chat_sessions DELETE → messages / artwork_matches / message_reports CASCADE.
       audit_logs RETENUS (obligation légale, documenté deleteAccount.useCase.ts:44-46).
```

---

## 2. ✅ Flux solides

- **Register DOB defence-in-depth** : Zod (R3) + hard-fail backend `register.useCase.ts:108` (falsy DOB → 400, jamais `new Date(undefined)`), `<15` → 422 code stable. FE submit gated `RegisterForm.tsx:177-178`. Maestro `auth-register-minor-dob.yaml`.
- **Login rate-limit + lockout** : `login-rate-limiter.ts` sliding 10/10min + lockout exponentiel 2^n, atomic Lua INCR+PEXPIRE, **fail-CLOSED 503** si Redis degraded sans snapshot local (`:192`). Hash SHA-1 des emails en clé Redis.
- **Refresh rotation + reuse detection** : `session-issuer.service.ts:114` — hash mismatch / revoked / rotated / reuseDetected → `revokeFamily(_, true)` ; expiry → revokeByJti ; idle window → revokeFamily. Banking-grade.
- **Refresh interceptor single-flight** : `httpClient.ts:94-123` — 401 concurrents partagent un `inflightRefresh`, `unauthorizedHandler` tiré exactement 1× ; pas de double-refresh → pas de rotation-race spurious logout. Bootstrap n'émet PAS de refresh propre (`AuthContext.tsx:166-177`).
- **Logout dual-revoke idempotent** : refresh `revokeByJti` + access `denylist.add(jti, ttl)` ; bearer mal formé silencieux (`auth-session.route.ts:160-169`) ; jamais throw.
- **Access-token denylist** : `authenticated.middleware.ts` consulte `denylist.has(jti)` post-verify, 401 TOKEN_REVOKED, fail-OPEN sur Redis down (R9). Bearer > cookie (anti identity-swap). `msk_` → API-key path.
- **Single-use email tokens** : reset/verify/email-change tous via `createQueryBuilder().update().where(token AND expires>NOW()).returning()` + clear `() => 'NULL'` (pas `undefined` skip TypeORM). Replay → 400 (verifyEmail `user.repository.pg.ts:115`, reset `:85`, email-change `:163`).
- **OTC + nonce single-use** : Redis `GETDEL` atomic (`social-otc-store.ts`, `nonce-store.ts`), TTL 60s/300s, replay → 401.
- **DRY helpers correctement intégrés** : `assertPasswordReauth` dans changePassword(`:23`)/changeEmail(`:26`)/disableMfa(`:18`) — matrice d'erreur unifiée (404 notFound / 400 SOCIAL_ONLY / 401 INVALID_CREDENTIALS, fast-fail no-bcrypt sur social-only). `requireUser` dans toutes les routes authed. `notFound` helper utilisé.
- **TOTP replay-protection** : RFC 6238 §5.2 via `last_used_step` dans challenge(`:68`) ET enroll-verify(`:56`) ; recovery code matching **constant-time** (scan complet, pas d'early return, `recoveryCodes.ts:68-76`) + one-use via `consumedAt`.
- **DSAR export** : self-scoped `req.user.id` anti-IDOR, allow-list par champ (jamais spread entité), secrets exclus, audit durable avant réponse, 1/7j.
- **Erasure** : ordering S3/audio/Brevo AVANT cascade DB (refs encore résolvables), cascade DB-level FK vérifié sur les 6 tables, audit_logs rétenus à dessein.
- **OAuth anti-open-redirect** : `sanitizeReturnTo` rejette `//`,`\`, absolu, >256 chars ; deeplink mobile hardcodé.
- **Consent clear sur logout (FE)** : `AuthContext.clearPerUserFeatureStorage` purge le memo consent namespacé AVANT clearTokens (B8, GDPR Art.7 no inheritance) — ordering correct dans logout(`:300`) ET unauthorizedHandler(`:271`).
- **Token store device-bound** : `authTokenStore.ts:61` `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` (non-backup-migratable, TD-SEC-01).

---

## 3. ⚠️ Ruptures / faiblesses

### R1 — **MFA challenge mobile = dead-end (rupture E2E)** — **HIGH**
- `features/auth/infrastructure/authApi.ts:54-65` : `authService.login()` **throw `Error('MFA_REQUIRED')`** quand le backend renvoie `{mfaRequired}`.
- `features/auth/application/useEmailPasswordAuth.ts:90` : l'appel est dans `loginMutation.mutationFn`, l'erreur tombe dans `loginMutation.error` rendue brute via `getErrorMessage` (`:148`). **Aucune navigation vers `MfaChallengeScreen`.**
- `features/auth/screens/MfaChallengeScreen.tsx:33-41` : composant existe, attend une prop `mfaSessionToken`, MAIS **aucune route Expo Router** (`app/` ne contient que `mfa-enroll.tsx`, pas de `mfa-challenge`) et **rien ne le monte/navigue** (grep navigation = 0 résultat).
- Conséquence : un utilisateur ayant **opté pour le MFA** (enroll réussi) est **verrouillé hors de l'app mobile** au login suivant — login renvoie `mfaRequired`, FE n'affiche qu'une string « MFA_REQUIRED ». Le `mfaSessionToken` n'est jamais récupéré ni transmis au challenge.
- Atténuation sévérité : MFA opt-in pour B2C V1 (forcé seulement admin/super_admin, `mfa-gate.service.ts:14-16`). Mais le flux enroll mobile EXISTE (`mfa-enroll.tsx`, Maestro `mfa-enroll-flow.yaml`) → un user PEUT s'enrôler puis se verrouiller. Web admin n'implémente pas non plus le challenge (grep `museum-web/src` = seulement openapi.ts généré, pas de handler) → admins potentiellement bloqués si enrôlés.
- **Gap E2E : enroll réussit mais challenge n'est pas atteignable → boucle de verrouillage.**

### R2 — **`mfaSessionToken` non single-use (replay fenêtre 5 min)** — **MED**
- `useCase/totp/mfaSessionToken.ts:23-45` : JWT signé avec `expiresIn` seulement, **pas de jti / pas de denylist / pas de consume**. Le même `mfaSessionToken` peut être ré-échangé via `/challenge` ou `/recovery` plusieurs fois pendant sa TTL.
- Atténué par la replay-protection TOTP (`last_used_step`) : un code TOTP donné ne peut servir 2× → un attaquant ne peut pas rejouer un (token+code) capturé. Mais le token seul, avec un NOUVEAU code TOTP valide, émet une nouvelle session sans re-login. Risque réel faible (il faut déjà un code TOTP frais), d'où MED non HIGH.

### R3 — **`recordTosConsent` swallow → user sans ligne de consentement** — **LOW (honnêteté/GDPR-trace)**
- `register.useCase.ts:131-151` : échec de `grantConsentUseCase` loggé mais **n'avorte PAS** le register (commentaire « legal proof is on FE »). En cas d'échec DB transitoire, un user existe sans ligne `user_consents` tos_privacy → trou dans la preuve de consentement côté serveur (surface en DPO dashboard, non bloquant). Comportement documenté/assumé, signalé pour traçabilité.

---

## 4. 🔧 Gaps E2E (synthèse actionnable)

1. **[HIGH] Router le login `mfaRequired` → MfaChallengeScreen** : `authService.login` doit retourner l'enveloppe discriminée (ne pas throw), `useEmailPasswordAuth` doit naviguer vers une route `app/(stack)/mfa-challenge.tsx` (à créer) en passant `mfaSessionToken`. Idem web admin. Sans ça, l'enroll MFA mobile = piège de verrouillage. Couverture UFR-021 manquante : `MfaChallengeScreen.tsx` n'a pas de Maestro flow tap-through (seul enroll est couvert).
2. **[MED] Single-use `mfaSessionToken`** : ajouter jti + consume (Redis GETDEL) à l'échange challenge/recovery, comme l'OTC, pour fermer le replay intra-TTL.
3. **[LOW] Décision produit `recordTosConsent`** : confirmer que le best-effort est acceptable, ou rendre la ligne consent transactionnelle avec le register.

Aucun **bypass authz** trouvé : toutes les routes mutantes/sensibles passent `isAuthenticated` + `requireUser` ; DSAR/delete self-scoped `req.user.id` (anti-IDOR) ; reauth password sur change-pw/email/disable-mfa.
Aucun **erasure-gap réel** : cascade DB-level FK vérifié sur les 6 tables auth + chat ; S3/audio/Brevo nettoyés avant cascade ; audit_logs rétenus à dessein (documenté).
Aucun **token replay** sur les single-use email tokens / OTC / nonce / refresh (rotation+reuse-detection) / verify-email.

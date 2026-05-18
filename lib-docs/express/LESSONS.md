# Lessons — express

Projet-specific gotchas pour Express 5.2.1 dans Musaium. Issu de l'audit enterprise-grade 2026-05-18 (sampled 35/59 consumers).

## 2026-05-18 — Rate-limiter qui lit `req.body` DOIT s'exécuter APRÈS `validateBody`
- **Symptôme** : counter inflation sur requêtes invalides → (a) funnel free-tier corrupted (chat-message dailyChatLimit), (b) DoS amplifié par bucket victim-target (loginByAccountLimiter : attaquant spam POST /login `{email:'victim@x.com', password:123}` invalide Zod → brûle le bucket de la victime sans tenter l'auth).
- **Cause** : middlewares qui MUTATE state (counter, audit, quota) AVANT le Zod validator. Pattern CLAUDE.md "mutating middleware ordering" (R1 §3.3 D3) déjà identifié pour `chat-session.route.ts` mais NON propagé aux autres call sites.
- **Sites identifiés (2026-05-18)** :
  - `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-session.route.ts:101-105` — `/login` : `loginLimiter, loginByAccountLimiter` AVANT `validateBody(loginSchema)`
  - `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-session.route.ts:132-135` — `/refresh` : `refreshLimiter` lit `req.body.refreshToken` AVANT `validateBody(refreshSchema)`
  - `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-session.route.ts:163-166` — `/social-login` : `socialLoginLimiter` AVANT `validateBody(socialLoginSchema)`
  - `museum-backend/src/modules/auth/adapters/primary/http/routes/mfa.route.ts:155-158,201-204` — `/challenge` + `/recovery` : `challengeLimiter`/`recoveryLimiter` lisent body.mfaSessionToken AVANT `validateBody`
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-message.route.ts:169-181` — `POST /sessions/:id/messages` : `dailyChatLimit` AVANT `parsePostMessageRequest` + multer filter
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-media.route.ts:230-241` — `/sessions/:id/audio` : même pattern
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-compare.route.ts:215-224` — `/chat/compare`
- **Fix** : 2 options par call site :
  - **(A)** Déplacer `validateBody` AVANT le limiter (cheap si body-derived key est optionnelle — fallback IP comme déjà fait pour fields manquants)
  - **(B)** Split limiter en 2 phases : `reserve` AVANT validator + `commit` dans handler après succès (refactor lourd, justifié seulement pour endpoints haut-traffic comme `/login` où précision bucket compte)
- **Anti-pattern à éviter** : nouveau endpoint avec rate-limiter qui dérive de body sans Zod-validate avant.
- **Ref** : voir TD-EX-01 dans `docs/TECH_DEBT.md`.

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

## 2026-05-20 — Refresh delta + TD-EX-01 follow-up

Refresh sweep des 7 call sites flaggés 2026-05-18. Express 5.2.1 toujours latest stable (no upstream change). Findings :

- **FIXED** (verified read-only) :
  - `museum-backend/src/modules/auth/adapters/primary/http/routes/auth-session.route.ts:101-130` — `/login` : ordre maintenant `loginLimiter (IP) → validateBody → loginByAccountLimiter (body.email)`. Commentaire inline cite `lib-docs/zod/PATTERNS.md`.
  - même fichier L133-145 (`/refresh`), L165-187 (`/social-login`), L202-214 (`/social-redeem`) — `validateBody` précède désormais le limiter body-derived.
  - `museum-backend/src/modules/auth/adapters/primary/http/routes/mfa.route.ts:157-159` (`/challenge`) + L204-206 (`/recovery`) — pattern identique.
- **FALSE POSITIVE (re-classifié)** :
  - `chat-message.route.ts:169-181`, `chat-media.route.ts:230-241`, `chat-compare.route.ts:215-224` — les limiters utilisent `bySession` (URL `:id`) + `byUserId` (auth-derived) + `dailyChatLimit` (`req.user.id`-derived). **Aucune** lecture de `req.body.*` avant validation. Le risque DoS/bucket-victim du 05-18 ne s'applique pas ici. Le LESSONS 05-18 a été trop large.

**Action** : `docs/TECH_DEBT.md` TD-EX-01 peut être downgradé de MEDIUM BLOCKER → RESOLVED pour les 5 sites auth/MFA fix + flag les 3 sites chat comme `not-a-violation` (raison documentée ci-dessus).

**Nouvelle règle codifiée dans PATTERNS §3.3** : helmet doit être mounted EARLY (avant rate-limit + body-parser) pour que 4xx/5xx héritent CSP/HSTS. Pattern dérivé de TD-HEL-01..03 (incidents 2026-04-30 sur 429 leakant bodies sans headers). `museum-backend/src/app.ts:133` reflète déjà l'ordre.

**Aucun nouveau gotcha upstream** dans la fenêtre 05-18 → 05-20 : pas de release 5.3.x, pas de CVE 5.x ouvert, History.md "Unreleased" = bug-fixes mineurs (`res.redirect` HTML structure, `app.render` null options, `res.send` Content-Type dedup).

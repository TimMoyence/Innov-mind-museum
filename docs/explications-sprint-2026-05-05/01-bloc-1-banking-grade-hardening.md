# 01 — Bloc 1 : le durcissement "banking-grade" (F1 → F13 + Defense-in-Depth)

> **Pour qui ?** Toi, qui veut comprendre ce que chacun des 13 findings de sécurité veut dire concrètement, sans jargon, avec le code réel de Musaium devant les yeux.
> **Durée de lecture :** ~25 minutes en lecture posée.
> **Ton verdict après lecture :** tu dois pouvoir expliquer chaque F-finding à un nouveau dev en 30 secondes.

---

## Pourquoi on appelle ça "banking-grade" ?

Le terme "banking-grade" sonne prétentieux. Voilà ce qu'il recouvre, sans le marketing : **on a appliqué à Musaium les pratiques que les banques en ligne appliquent au login + à la session** :

- Limiter les tentatives (rate-limit).
- Refuser silencieusement les replays (jeton single-use).
- Stocker les tokens dans des cookies inaccessibles à JavaScript (httpOnly).
- Vérifier les mots de passe contre une base de fuites publique (HIBP).
- Forcer le second facteur (MFA) pour tout le monde, pas seulement les admins.
- Noir sur blanc tracer ce qui s'est passé (audit chain).

Avant ce sprint, Musaium avait des défenses correctes mais classiques (JWT, bcrypt, Helmet par défaut). Après, on a verrouillé chaque vecteur identifié dans l'audit interne. Les 13 findings (F1 à F13) sont **les 13 trous spécifiques qu'on a colmatés**, plus quelques mesures complémentaires regroupées sous "Defense-in-Depth" (DiD).

---

## Vocabulaire commun (à connaître pour la suite)

| Terme | Définition pratique |
|-------|---------------------|
| **Rate-limit** | Limite le nombre de requêtes qu'un client peut faire (ex. 30 / minute) sur un endpoint. Empêche le brute-force. |
| **Fail-closed** | Quand une dépendance (ex. Redis) tombe, on **bloque** l'opération plutôt que de continuer en mode dégradé. C'est l'inverse de "fail-open". |
| **httpOnly** | Cookie qu'un script JavaScript du navigateur **ne peut pas lire**. Le navigateur le renvoie automatiquement, mais XSS ne peut pas le voler. |
| **CSRF** | Cross-Site Request Forgery. Un site attaquant déclenche une action sur ton site auth en exploitant le fait que le navigateur envoie automatiquement les cookies. |
| **HMAC** | Une signature cryptographique qui prouve que deux choses sont liées (ex. ce token CSRF a bien été généré pour cet access token). |
| **Constant-time compare** | Comparaison qui prend toujours exactement le même temps, qu'elle réussisse vite ou pas. Empêche les "timing attacks" (l'attaquant mesure le temps pour deviner le secret). |
| **MFA / TOTP** | Multi-Factor Authentication / Time-based One-Time Password. Le code à 6 chiffres dans Google Authenticator. |
| **HIBP** | Have I Been Pwned : base de données publique des mots de passe leakés dans des fuites. |
| **OIDC nonce** | Une chaîne aléatoire qu'on génère côté serveur, qu'on attache à une requête de login social, et qu'on retrouve dans le token retourné par Apple/Google. Empêche le replay d'un ancien token. |
| **CSP** | Content Security Policy : un header HTTP qui dit au navigateur "tu n'as le droit de charger des scripts QUE depuis ce domaine". Bloque les XSS. |
| **HSTS** | HTTP Strict Transport Security : "tu te connectes à ce domaine uniquement en HTTPS pendant 2 ans". Empêche le downgrade HTTP. |

---

## F1 — Limiter le rate sur `/refresh` et `/social-login`

### Le problème en une phrase

Avant le fix, un attaquant pouvait spammer l'endpoint `/refresh` 1000 fois par seconde pour faire tourner sa machine de credential stuffing.

### Analogie

Imagine un distributeur de billets. Tu peux retenter ton code 3 fois, après quoi la carte est avalée. Sans rate-limit, c'est un distributeur où tu peux tenter 1 000 codes à la seconde sans que la carte soit jamais avalée.

### Comment c'est fait dans Musaium

Le middleware Express limite à **30 requêtes/minute par couple `(IP, familyId)`** sur `/refresh`, et **10 req/min par couple `(IP, provider)`** sur `/social-login`.

Le `familyId` est extrait du refresh token : ça veut dire que si un attaquant utilise plusieurs tokens (et donc plusieurs familles), chacun a son propre seau de 30. Mais il reste limité par IP. Bonne combinaison.

`museum-backend/src/modules/auth/adapters/primary/http/helpers/auth-rate-limiters.ts:50-62`

```ts
export const refreshLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_REFRESH_RATE_LIMIT, 30),
  windowMs: toPositiveInt(process.env.AUTH_REFRESH_RATE_WINDOW_MS, 60_000),
  keyGenerator: (req) => {
    const ip = byIp(req);
    const refreshToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
    const familyId = decodeFamilyIdUnsafe(
      typeof refreshToken === 'string' ? refreshToken : undefined,
    );
    return familyId ? `${ip}:${familyId}` : ip;
  },
  bucketName: 'auth-refresh',
});
```

Détail subtil : le limiter est placé **avant** la validation du body (Zod). Pourquoi ? Parce que sinon un attaquant qui envoie du JSON volontairement malformé (qui échoue à `validateBody` avant d'atteindre le limiter) ferait passer ses tentatives "gratuitement".

### Pourquoi c'est pertinent pour Musaium

Sans rate-limit sur `/refresh`, un attaquant qui a volé un refresh token (via fuite Sentry, log mal scrubé, log applicatif d'un middleware tiers) peut le faire tourner en boucle pour générer des access tokens à l'infini. Avec 30 req/min, sa fenêtre devient minuscule.

### Est-ce overkill ?

Non. C'est la base. Toute application qui expose un endpoint d'auth doit avoir ça. La complexité du `keyGenerator` (IP + familyId) est ce qui distingue une implémentation jouet d'une impl prête prod.

---

## F2 — Rate-limit "fail-closed" quand Redis tombe (ADR-011)

### Le problème en une phrase

Avant le fix, si Redis (qui stocke les compteurs de rate-limit) tombait, on basculait silencieusement sur un compteur en mémoire **par instance**. Multi-instance = plusieurs compteurs = limites multipliées par le nombre d'instances. Un attaquant qui détecte cet état attaque pendant l'incident.

### Analogie

Tu as un vigile à l'entrée d'une boîte. Quand il prend sa pause, soit tu fermes la porte (fail-closed), soit tu laisses entrer tout le monde (fail-open). Le code 2026-04 disait : "fermer la porte" plutôt que "laisser entrer tout le monde", parce qu'une boîte sans vigile = bagarre garantie.

### Comment c'est fait dans Musaium

`museum-backend/src/helpers/middleware/rate-limit.middleware.ts:108-132`

```ts
const handleRedisFailure = (redisError: unknown, ctx: BucketContext): void => {
  const { key, res, next } = ctx;
  if (env.rateLimit.failClosed) {
    logger.error('rate_limit_redis_unavailable_failclosed', { key, error: ... });
    captureExceptionWithContext(..., { component: 'rate-limit', mode: 'fail-closed', key });
    res.setHeader('Retry-After', FAIL_CLOSED_RETRY_AFTER_SECONDS.toString());
    next(new AppError({ statusCode: 503, code: 'RATE_LIMIT_UNAVAILABLE', ... }));
    return;
  }
  logger.warn('rate_limit_redis_unavailable_degraded_to_local_bucket', { key });
  consumeMemoryBucket(ctx);
};
```

Le toggle `RATE_LIMIT_FAIL_CLOSED` vaut `true` par défaut en prod, `false` en dev/test (parce qu'en dev tu n'as pas envie d'être bloqué quand tu redémarres Redis local).

### Pourquoi c'est pertinent pour Musaium

Quand Redis tombe en prod, les endpoints rate-limités (login, refresh, social-login) renvoient un `503 Retry-After: 30s` au lieu de devenir un boulevard ouvert au credential stuffing. Sentry t'alerte avec le tag `mode: fail-closed` pour que tu sois prévenu en quelques secondes.

Trade-off honnête : pendant l'incident Redis, **tes utilisateurs légitimes ne peuvent pas se connecter non plus**. C'est documenté dans l'ADR-011. Tu acceptes 5 minutes de friction utilisateur pour éviter une fenêtre d'attaque.

### Est-ce overkill ?

Non. C'est la décision la plus difficile mais la bonne. Pour Musaium, lancer en prod avec un fail-open silencieux serait poser une bombe à retardement.

---

## F3 — Nonce single-use sur le login social (Apple/Google)

### Le problème en une phrase

Avant le fix, si un attaquant capturait l'ID-token retourné par Apple/Google (via MITM, capture mémoire, log mal scrubé), il pouvait le rejouer plusieurs fois pour se connecter en boucle.

### Analogie

Tu vas chez ton boucher avec un ticket numéroté. Le boucher déchire ton ticket après usage : impossible de revenir avec le même ticket. C'est ça, le nonce single-use.

### Comment c'est fait dans Musaium

Côté serveur, on génère un nonce aléatoire qu'on **stocke dans Redis** avec un TTL court. Le client (mobile) l'inclut dans la requête à Apple ou Google. Le provider le renvoie dans le claim `nonce` de l'ID-token. À la réception, on **consomme** le nonce (`GETDEL` atomique sur Redis : lit + supprime en une seule commande).

Cas particulier d'Apple : le SDK iOS hash le nonce côté client avant de l'envoyer. Donc côté serveur, on doit comparer `sha256(nonce_qu_on_a_stocké)` avec ce qui revient. Pour Google, c'est en clair.

`museum-backend/src/modules/auth/adapters/secondary/social/social-token-verifier.ts:166-177`

```ts
const expected =
  provider === 'apple'
    ? crypto.createHash('sha256').update(expectedNonce).digest('hex')
    : expectedNonce;
// Constant-time comparison so timing cannot leak hashed-nonce bytes.
const a = Buffer.from(decodedNonce);
const b = Buffer.from(expected);
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
  throw invalidNonce();
}
```

Le `crypto.timingSafeEqual` empêche les timing attacks (l'attaquant mesure le temps de réponse pour deviner le contenu du nonce attendu).

Détail tactique : on consomme le nonce **avant** de vérifier l'ID-token contre les JWKS d'Apple/Google. Pourquoi ? Parce que la vérif JWKS est coûteuse (signature RSA). Si un attaquant rejoue 1 000 fois le même token, on jette la requête en quelques µs (lookup Redis) au lieu de payer 1 000 vérifs RSA.

### Risque résiduel honnête

Le `RedisNonceStore` existe et est testé, **mais il n'est pas câblé** : `useCase/index.ts:111` instancie un `InMemoryNonceStore`. C'est documenté en commentaire dans le code. **Single-instance prod = OK**. **Multi-instance prod sans sticky session = social login casse au premier load-balancer rotation**.

C'est noté comme **plus haute priorité post-launch** dans `docs/SPRINT_RECAP` § "Risques résiduels".

### Est-ce overkill ?

Non. Le nonce single-use est mandaté par la spec OIDC pour ce cas précis. Ce qui pourrait être overkill = stocker le nonce côté serveur si on n'avait pas de Redis disponible. Mais on en a déjà un pour le rate-limit, donc le coût marginal est nul.

---

## F4 — Insultes multilingues + juge LLM (ADR-015)

### Le problème en une phrase

Le filtre keyword des insultes ne couvrait que FR + EN, alors que le filtre injection couvrait déjà 8 langues. Asymétrie exploitable. En complément, on a ajouté un "juge LLM" optionnel qui tranche en cas de doute.

### Analogie

Tu as un videur à l'entrée qui a une liste de mots interdits. Sa liste est en français et anglais. Quelqu'un vient avec une insulte en italien — le videur la laisse passer. F4 v1 = on étend la liste à 8 langues. F4 v2 = on rajoute un deuxième videur (le juge LLM) qui parle toutes les langues, mais qui n'intervient **que si le premier videur dit "ok"** et **que le message est long** (sinon on dépense un appel LLM pour une trivialité).

### Comment c'est fait dans Musaium

`museum-backend/src/modules/chat/useCase/guardrail/art-topic-guardrail.ts:30-85` — la liste a été étendue à 38 entrées couvrant FR/EN/DE/ES/IT/JA/ZH/AR.

Et la logique du juge LLM, qui ne s'active que dans des conditions très restrictives :

`museum-backend/src/modules/chat/useCase/guardrail/guardrail-evaluation.service.ts:111-130`

```ts
if (!this.llmJudgeEnabled || !this.llmJudge) return { allow: true };
if (text.length <= env.guardrails.judgeMinMessageLength) return { allow: true };
const decision = await this.llmJudge(text);
if (!decision) return { allow: true }; // fail-open
if (decision.decision === 'allow' || decision.confidence < 0.6) {
  return { allow: true };
}
const reason = judgeVerdictToReason(decision.decision);
logger.info('guardrail_judge_block', { ... });
return { allow: false, reason };
```

Trois propriétés importantes :

1. **Le juge ne peut que bloquer**, jamais débloquer ce que le keyword a bloqué.
2. **Confidence floor à 0.6** : si le juge répond "block" mais avec confiance 0.5, on ignore.
3. **Fail-open** : si le juge timeout, plante, ou dépasse le budget, on retombe sur la décision keyword (allow).

### Pourquoi c'est pertinent pour Musaium

Sans extension multilingue : un visiteur italien qui insulte le bot passe à travers le filtre, le bot répond, ça finit en screenshot scandaleux sur Twitter. Avec 8 langues, on couvre les 95 % des locales du marché EU+US+JP+CN+SA.

Le juge LLM est un complément. Il sert à attraper les cas que les mots-clés ratent (insultes obliques, paraphrases, sarcasme). Mais il est **désactivé par défaut** (`GUARDRAILS_V2_CANDIDATE` doit être à `llm-judge` pour qu'il tourne).

### Est-ce overkill ?

La liste multilingue, **non**. Le juge LLM, **discutable** : ça ajoute potentiellement 200-500 ms de latence par message > 50 caractères, et un coût LLM. Pour une V1 lancement, **mon conseil = laisse-le désactivé**, observe combien d'insultes passent à travers les keywords pendant 1 mois, puis active si tu vois un signal. → Voir doc 04 pour le détail latence.

---

## F5 — CSP + HSTS production stricts

### Le problème en une phrase

Les en-têtes HTTP par défaut de Helmet sont OK pour démarrer mais pas suffisants pour une vraie cible XSS. On a verrouillé une CSP custom + HSTS 2 ans.

### Analogie

Helmet par défaut = "ferme la porte du salon". CSP custom = "ferme aussi la porte de la chambre, du grenier, de la cave, et préviens tous les facteurs que tu ne reçois plus que les colis du facteur officiel".

### Comment c'est fait dans Musaium

`museum-backend/src/app.ts:69-93`

```ts
function buildHelmetOptions(isProduction: boolean): Parameters<typeof helmet>[0] {
  if (!isProduction) {
    return { contentSecurityPolicy: false as const, hsts: false as const };
  }
  return {
    hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],   // stop-gap
        imgSrc: ["'self'", 'data:', 'https://*.s3.amazonaws.com', 'https://*.amazonaws.com'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
  };
}
```

Lecture ligne par ligne :

- `hsts: maxAge: 63_072_000` — 2 ans en secondes. Le navigateur refusera HTTP pour ton domaine pendant 2 ans, même si on tape `http://api.musaium.app` à la main.
- `defaultSrc: ['self']` — par défaut, tout (scripts, images, AJAX, etc.) ne peut venir que du même domaine.
- `scriptSrc: ['self']` — pas d'`unsafe-inline`. Si un attaquant injecte `<script>alert(1)</script>` via XSS, le navigateur refusera de l'exécuter.
- `imgSrc: ['self', 'data:', S3]` — on autorise les images depuis notre S3 et les data URLs (utiles pour les SVG inline).
- `frameAncestors: ['none']` — personne ne peut iframer notre domaine. Bloque les attaques de clickjacking.
- `objectSrc: ['none']` — pas de `<object>` ou `<embed>`. Bloque les vieux Flash et plugins louches.

### Le compromis honnête

`styleSrc: ['unsafe-inline']` reste dans le policy. C'est un stop-gap : enlever l'inline-style casserait les `style={{...}}` de React Native Web et certains composants Tailwind générés. Phase 2 = nonces ou CSS modules. C'est dans le backlog post-launch.

### Pourquoi c'est pertinent pour Musaium

L'admin web tourne sur le même domaine que l'API. Si un admin clique sur un lien malicieux qui exploite une XSS dans une page de la console, sans CSP la session admin est volée. Avec cette CSP, le navigateur refuse d'exécuter le code injecté, l'attaque échoue.

### Est-ce overkill ?

Non. C'est une demi-journée de configuration pour une protection qui ferme 80 % des XSS en blast-radius admin. Le seul piège classique = la CSP "casse" parfois des bibliothèques tierces qui injectent du JS inline. Test en staging d'abord.

---

## F6 + F9 — MFA pour tous les rôles + endpoint `/mfa/status`

### Le problème en une phrase

Le code original ne forçait MFA que pour les admins. Or des comptes "museum_manager" ou "moderator" ont aussi un pouvoir d'écriture sur la base. F6 force MFA pour tout user qui a un TOTP enrollé. F9 ferme une fuite secondaire (l'envelope de réponse différait selon le rôle, ce qui leakait l'état MFA d'un user).

### Analogie

Une banque où seul le PDG montre sa carte d'identité au coffre. Un cadre intermédiaire se présente, on le laisse entrer sans vérif. F6 = tout le monde montre sa carte. F9 = on dit pareil à tout le monde au comptoir d'accueil (pas "ah le PDG a sa carte" / "ah le cadre n'en a pas").

### Comment c'est fait dans Musaium

`museum-backend/src/modules/auth/useCase/session/mfa-gate.service.ts:74-92`

```ts
async evaluateMfaGate(
  user: User,
): Promise<MfaRequiredResponse | MfaEnrollmentRequiredResponse | null> {
  const totpRow = await this.totpRepository?.findByUserId(user.id);
  const enrolled = totpRow?.enrolledAt != null;

  if (enrolled) {
    return {
      mfaRequired: true,
      mfaSessionToken: issueMfaSessionToken(user.id),
      mfaSessionExpiresIn: env.auth.mfaSessionTokenTtlSeconds,
    };
  }
  // Non-enrolled: only admins are subject to enrollment-deadline policy.
  if (user.role !== 'admin') {
    return null;
  }
  ...
}
```

Lecture : si l'utilisateur a un TOTP enregistré (`totpRow.enrolledAt`), peu importe son rôle, on renvoie `mfaRequired: true` et le client doit faire le challenge avec le code à 6 chiffres. Si l'utilisateur n'est **pas** enregistré et qu'il n'est **pas** admin, on le laisse passer (l'enrollment reste opt-in pour les visiteurs).

F9 ajoute un endpoint `GET /auth/mfa/status` qui renvoie une enveloppe uniforme pour le user appelant (pas un user cible — pas de risque d'admin impersonation).

### Pourquoi c'est pertinent pour Musaium

Un museum_manager peut éditer la fiche d'un musée. Si son mot de passe fuit (ce qui est statistiquement courant via réutilisation), TOTP empêche le take-over. Coût : 30 secondes pour scanner un QR avec Google Authenticator au premier login post-enrollment.

### Est-ce overkill ?

Non pour les rôles écriture. **Discutable pour les visiteurs** : forcer MFA à un user freemium qui veut juste discuter avec une œuvre va flinguer ton funnel d'acquisition (KR4). C'est pourquoi F6 reste **opt-in pour les visiteurs** — ils peuvent s'enroller volontairement, ce n'est pas forcé. Bon arbitrage produit/sécurité.

---

## F7 — Cookies httpOnly + CSRF double-submit + HMAC

### Le problème en une phrase

Stocker l'access token et le refresh token dans `localStorage` (ce que faisait le web admin) = un seul XSS suffit pour les exfiltrer. F7 les déplace dans des cookies httpOnly + ajoute une protection CSRF.

### Analogie

`localStorage` = ton portefeuille posé sur le comptoir, accessible à n'importe quel script JS. Cookie httpOnly = ton portefeuille dans un coffre que seul le navigateur peut ouvrir, et il l'ouvre uniquement pour envoyer une requête au bon serveur.

Mais cookies httpOnly ouvrent une autre porte : CSRF. Le navigateur les envoie automatiquement, donc un site attaquant peut déclencher des actions à ton insu (`<img src="https://api.musaium.app/account/delete">`). On bloque ça avec le **double-submit pattern + HMAC binding** :

1. À chaque login/refresh, on issue un cookie `csrf_token` (lui n'est pas httpOnly — JS peut le lire).
2. JS doit recopier la valeur dans un header `X-CSRF-Token` à chaque requête mutating.
3. Le serveur vérifie que header == cookie ET que cookie = `HMAC-SHA256(access_token, CSRF_SECRET)`.

Pourquoi le HMAC binding ? Sans lui, un attaquant qui réussit à fixer un cookie csrf à une valeur connue ET à la mettre dans le header passerait. Avec le HMAC, il faudrait aussi connaître `CSRF_SECRET` ET l'access token courant.

### Comment c'est fait dans Musaium

`museum-backend/src/helpers/middleware/csrf.middleware.ts:96-111`

```ts
const headerToken = req.headers['x-csrf-token'];
const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken;
if (typeof headerValue !== 'string' || !headerValue) {
  throw csrfInvalid();
}
if (!safeEqual(csrfCookie, headerValue)) {
  throw csrfInvalid();
}
// HMAC binding: cookie MUST be derived from the active access token,
// not just an arbitrary value the attacker echoed in both places.
const expected = computeCsrfToken(accessTokenCookie);
if (!safeEqual(csrfCookie, expected)) {
  throw csrfInvalid();
}
next();
```

Le `safeEqual` est la version constant-time. `computeCsrfToken` calcule `HMAC-SHA256(accessToken, CSRF_SECRET)`.

### Important : mobile vs web

Mobile (Expo / React Native) **ne reçoit pas les cookies** dans le même mode que le web. Le mobile lit le token via l'enveloppe JSON de `/login` et l'envoie en header `Authorization: Bearer …`. Le middleware CSRF sait ne pas s'activer quand `Authorization` est présent — le navigateur ne le set jamais automatiquement, donc il n'y a pas de CSRF possible.

### Pourquoi c'est pertinent pour Musaium

L'admin web sera la cible la plus alléchante (créer/supprimer des musées, modérer du contenu). Sans F7 + CSP, une seule XSS dans un toast d'erreur affichant un input non échappé = compte admin volé. Avec F7 + CSP F5, l'attaque est neutralisée.

### Est-ce overkill ?

Non. C'est l'OWASP basics pour toute app à session. Le coût d'implémentation est concentré dans `csrf.middleware.ts` (~150 LOC) + 4 tests dans `museum-web/src/lib/api.test.ts`.

---

## F8 — TTL du refresh token resserré : 30j → 14j absolu, idle 14j → 24h

### Le problème en une phrase

Un refresh token valide 30 jours sans usage = un attaquant qui en vole un dispose de 30 jours pour s'en servir. F8 ramène à 14 jours absolu et 24 heures de fenêtre d'inactivité.

### Analogie

Une carte d'accès au bâtiment qui marche 30 jours même si tu ne viens jamais = trop de marge. F8 dit : la carte expire au bout de 14 jours quoi qu'il arrive, et si tu passes 24h sans badger, elle se désactive.

### Comment c'est fait

`museum-backend/src/config/env.ts:81-89`

```ts
accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
// F8 — refresh TTL tightened from 30d -> 14d absolute.
refreshTokenTtl: process.env.JWT_REFRESH_TTL || '14d',
// F8 — sliding idle window tightened from 14d -> 24h.
refreshIdleWindowSeconds: toNumber(process.env.JWT_REFRESH_IDLE_WINDOW_SECONDS, 24 * 60 * 60),
```

Subtilité : les **tokens déjà émis** gardent leur claim `exp` à 30 jours (immuable, c'est dans le JWT signé). Mais la colonne `last_rotated_at` côté serveur s'applique immédiatement. Donc dès qu'un user inactif >24h essaie de refresh, le serveur refuse et il se ré-authentifie.

### Pourquoi c'est pertinent pour Musaium

Public visiteur Musaium = beaucoup de users qui essaient l'app, ne reviennent pas pendant 1-2 semaines, puis reviennent. Avec 14j absolu + 24h idle, **un visiteur "fidèle" (revient dans la semaine) ne ressent rien**. Un visiteur "sporadique" (revient dans le mois) doit re-login. C'est un compromis assumé.

### Est-ce overkill ?

Non. Les valeurs (14j / 24h) sont conservatrices comparées aux banques (typiquement 30 min idle). Pour le profil Musaium (consumer freemium), c'est dans la zone raisonnable.

---

## F10 — Drop des règles de complexité du mot de passe + check HIBP

### Le problème en une phrase

Les règles "1 majuscule + 1 chiffre + 1 caractère spécial" produisent surtout `Password1!`. Le NIST recommande maintenant : **drop ces règles, augmenter la longueur, et vérifier contre HIBP**.

### Analogie

Forcer "1 majuscule + 1 chiffre" = la sécurité aéroport qui demande de retirer les chaussures sans regarder ce qu'il y a dans le sac. Ça donne l'impression de sécurité sans empêcher les attaques. HIBP = le scan du sac.

### Comment c'est fait

Suppression des regex de composition. La longueur min reste à 8 (NIST recommande 8 minimum, 15 idéal — Musaium reste à 8 par contrainte UX).

Le check HIBP utilise le **k-anonymity protocol** : on hash le password en SHA-1, on envoie **les 5 premiers caractères** seulement à l'API HIBP, qui renvoie tous les hashs qui commencent par ces 5 caractères. On compare localement. Le password complet ne quitte jamais ton serveur.

`museum-backend/src/shared/validation/password-breach-check.ts:65-94`

```ts
export async function checkPasswordBreach(
  password: string,
  options: { timeoutMs?: number } = {},
): Promise<BreachCheckResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fullHash = sha1HexUpper(password);
  const prefix = fullHash.slice(0, 5);
  const suffix = fullHash.slice(5);
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(`${HIBP_RANGE_URL}/${prefix}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Musaium/1.0 (+security@musaium.app)' },
      signal: controller.signal,
    });
    ...
```

Notes importantes :

- **`Add-Padding: true`** demande à HIBP d'ajouter du bourrage aléatoire pour qu'un observateur réseau ne puisse pas estimer combien de hashs sont retournés (ce qui rétrécirait l'espace de recherche).
- **2s de timeout** (`DEFAULT_TIMEOUT_MS`).
- **Fail-open avec Sentry warn** : si HIBP est down, on accepte le password (sinon une panne de leur côté empêcherait tous les inscriptions).
- **Sentinel prod** : `env.production-validation.ts:131-136` rejette `PASSWORD_BREACH_CHECK_ENABLED=false` en prod. Empêche un opérateur de désactiver silencieusement la check.

### Pourquoi c'est pertinent pour Musaium

Si un user s'inscrit avec `password123`, on le bloque immédiatement (déjà dans 50+ leaks publics). Sinon, on accepte un mot de passe "faible mais unique" type `bonjourjeveuxvisiterunmusee` qui est ironiquement plus fort que `Password1!`.

### Est-ce overkill ?

Non, c'est même la pratique recommandée par NIST 800-63B-4 § 3.1.1.2 depuis 2017. Musaium était en retard sur le standard, le sprint l'a mis à jour.

---

## F11 — Redact des query strings sensibles dans les logs

### Le problème en une phrase

Si un client envoie `?token=ABC&password=xyz` par erreur dans une URL, le request-logger Express l'imprimait tel quel. Pollue les logs et leak des secrets.

### Comment c'est fait

`museum-backend/src/helpers/middleware/request-logger.middleware.ts:19-39`

```ts
function redactQueryString(originalUrl: string): string {
  const queryIndex = originalUrl.indexOf('?');
  if (queryIndex < 0) return originalUrl;
  const path = originalUrl.slice(0, queryIndex);
  const query = originalUrl.slice(queryIndex + 1);
  const redactedPairs = query
    .split('&')
    .map((pair) => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex < 0) return pair;
      const key = pair.slice(0, eqIndex);
      return SENSITIVE_QUERY_KEYS.has(decodeURIComponent(key).toLowerCase())
        ? `${key}=${REDACTED}`
        : pair;
    })
    .join('&');
  return `${path}?${redactedPairs}`;
}
```

Liste : `token`, `password`, `access_token`, `refresh_token`, `api_key`, `apikey`, `secret`. Source unique de vérité partagée avec le scrubber Sentry (`SENSITIVE_QUERY_KEYS` exporté de `sentry-scrubber.ts`).

### Pourquoi c'est pertinent

Sentry peut indexer un secret leaké dans un log et le rendre searchable par n'importe qui ayant accès à Sentry (devs, ops). Le redact côté logger l'arrête à la source.

### Est-ce overkill ?

Non. C'est 30 lignes de code et 5 tests pour fermer une vraie source de leaks.

---

## F12 — Override `@xmldom/xmldom` pour ne pas casser `expo prebuild`

### Le problème

`@expo/plist` tire `xmldom` en transitive. Une nouvelle version 0.9.x de xmldom casse le parsing de `PrivacyInfo.xcprivacy` (le fichier de déclaration de privacy iOS). Sans override, `pnpm install` peut tirer 0.9.x et `expo prebuild` plante.

Override ajouté dans `museum-frontend/package.json:160` :

```json
"@xmldom/xmldom": "^0.8.10"
```

Cap à `<0.9.0`. Le lockfile pin actuel = `0.8.13`.

### Recommandation

Le floor `^0.8.10` permet 0.8.10 ou 0.8.11, qui sont **sous** la version 0.8.12 où l'advisory de sécurité a été fixé. Resserrer à `^0.8.12` pour fermer cette fenêtre théorique. C'est dans le backlog post-launch.

### Est-ce overkill ?

Non. C'est 1 ligne dans `package.json`. Ne pas le faire = build mobile qui plante au prochain prebuild.

---

## F13 — `LLM_INCLUDE_DIAGNOSTICS` strictement dev only

### Le problème en une phrase

Un toggle interne qui exposait les détails de l'orchestrateur LLM (model name, prompt tokens, etc.) dans la réponse API. Le code original utilisait `nodeEnv === 'production' ? false : ...`, ce qui activait le toggle sur tout sauf prod (donc staging, test, et même un typo "Production" avec majuscule).

### Le fix

`museum-backend/src/config/env.ts:159-161`

```ts
includeDiagnostics:
  nodeEnv === 'development' ? toBoolean(process.env.LLM_INCLUDE_DIAGNOSTICS, true) : false,
```

Strict equality avec `'development'`. Tout autre valeur = `false`. Plus de surprise.

### Pourquoi c'est pertinent

Un attaquant qui voit dans la réponse "model=gpt-4o-mini, provider=openai, tokens_in=120" obtient des infos qui facilitent le model-side attack (tuning du prompt injection pour ce modèle précis). En prod, jamais.

### Est-ce overkill ?

Non. C'est 1 ligne. Garde-fou contre une faute de frappe dans `NODE_ENV`.

---

## F-DiD — Defense-in-Depth : limiter par compte (anti-CGNAT)

### Le problème en une phrase

Un attaquant derrière un CGNAT (une seule IP partagée par 100+ users) ne pouvait pas être rate-limité par IP — l'IP-only bucket était noyé par le trafic légitime. F-DiD ajoute un bucket par email tenté.

### Comment c'est fait

`museum-backend/src/modules/auth/adapters/primary/http/helpers/auth-rate-limiters.ts:32-42`

```ts
export const loginByAccountLimiter: RequestHandler = createRateLimitMiddleware({
  limit: toPositiveInt(process.env.AUTH_LOGIN_ACCOUNT_RATE_LIMIT, 20),
  windowMs: toPositiveInt(process.env.AUTH_LOGIN_ACCOUNT_RATE_WINDOW_MS, 5 * 60_000),
  keyGenerator: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === 'string' && email.length > 0
      ? `email:${email.trim().toLowerCase()}`
      : `email:unknown`;
  },
  bucketName: 'auth-login-account',
});
```

20 tentatives / 5 minutes / email. Combiné avec le limiter IP (10 req / 5 min), on a une protection en couches : un attaquant doit changer **et** d'IP **et** d'email cible pour franchir.

### Pourquoi c'est pertinent

Universités, mobiles 4G/5G français, certains FAI = CGNAT. Sans ce limiter, ces utilisateurs étaient **moins protégés** (un attaquant sur le même CGNAT consomme leur quota IP).

### Est-ce overkill ?

Non. C'est 10 lignes. Ferme un trou réel.

---

## F-DiD — Runbooks ops : rotation secrets + forensics audit chain

3 runbooks ajoutés dans `docs/RUNBOOKS/` :

- **`secrets-rotation.md`** — cadence (JWT 90j, MFA 180j, etc.), protocole dual-key 72h soak.
- **`audit-chain-forensics.md`** — comment réagir si la chaîne d'audit casse.
- **`CERT_ROTATION.md`** — capture du SPKI hash pour le cert pinning, plan de rotation 3-pin.

Pas du code, des procédures. Utile uniquement si tu (ou un futur ops) les lit en cas d'incident. **Action de ta part = aucune tant que rien ne se passe**, mais bien savoir qu'ils existent.

---

## La matrice "défense en profondeur" : qui couvre quoi

C'est ce que le récap appelle "Defense-in-Depth recap". Lecture : **pour chaque type de menace, on a 2 ou 3 couches qui peuvent l'arrêter, donc casser une couche ne suffit pas pour passer**.

| Menace | Couche 1 | Couche 2 | Couche 3 |
|--------|----------|----------|----------|
| Credential stuffing | F1 IP+familyId limiter | F-DiD per-account | F2 fail-closed Redis + F8 idle 24h |
| Replay social token | F3 nonce single-use Redis | F3 vérif vs JWT claim | F1 limiter /social-login |
| Prompt injection direct | Keyword 8 langues | Juge LLM | Boundary marker prompt |
| XSS exfiltrant tokens | F7 cookies httpOnly | F5 CSP no inline-script | F7 SameSite=Strict |
| CSRF | Double-submit | HMAC binding | Constant-time compare |
| Audit log tampering | Insert immuable | Hash chain SHA-256 | Cron nightly + Slack |

**Lecture :** un attaquant qui essaie de faire du credential stuffing doit passer F1 ET F-DiD ET soit avoir lieu pendant un incident Redis (F2 le bloquerait sinon) ET supporter le fait que les sessions expirent en 24h (F8). Probabilité de réussite : faible.

---

## Verdict global : est-ce que tout ce bloc est overkill pour Musaium V1 ?

**Non, mais avec deux nuances.**

**Ce qui est clairement pertinent même pour V1 :**
- F1, F2, F-DiD (rate-limit) — sans ça, credential stuffing trivial.
- F3 (nonce social) — réseau social = vecteur principal de login, doit être propre.
- F5, F7 (CSP + cookies httpOnly) — protège l'admin web qui est ta surface d'attaque la plus juteuse.
- F8 (TTL refresh) — coût UX nul, gain sécu réel.
- F10 (HIBP) — bloque les pires mots de passe sans friction.
- F11, F13 — micro-fix, gros effet de levier.
- F-DiD runbooks — documentation, à zéro coût pendant qu'on attend l'incident.

**Ce qui est plus discutable pour V1 :**
- F4 juge LLM : gain marginal, latence + coût. **Garde-le désactivé en V1**, observe, active si signal clair (cf. doc 04).
- F6 MFA forcé tous rôles : OK pour rôles écriture (museum_manager, moderator, admin), garde opt-in pour visitor.

**Ce qui est documenté résiduel et à régler post-launch :**
- Wire `RedisNonceStore` au lieu d'`InMemoryNonceStore` (priorité #1 si multi-instance).
- Resserrer `@xmldom/xmldom` à `^0.8.12`.
- Fix `/api/health?…` query-string still logged (cosmétique, pas crit).
- F5 `style-src 'unsafe-inline'` → nonces.

---

## Ce que tu dois faire après cette lecture

1. **Aucune action immédiate sur F1-F13.** Tout est shipped et fonctionne.
2. **Décider du cap "InMemoryNonceStore vs RedisNonceStore"** : si V1 tourne sur **une seule instance backend** (cas par défaut sur ton VPS actuel), tu es OK. Si tu scales à 2+ instances post-launch, **wire RedisNonceStore d'abord** (`useCase/index.ts:111`).
3. **Décider de F4 juge LLM** : laisser `GUARDRAILS_V2_CANDIDATE` sur `off` ou `keyword-only` en V1. Voir doc 04 pour le détail.
4. **Avoir lu les 3 runbooks** au moins une fois pour savoir où chercher quand un incident arrivera.

Si après cette lecture tu n'as pas une question précise sur un F-finding, c'est qu'on a bien fait notre boulot. Si tu en as une, on l'éclaire ensemble dans la prochaine doc ou en chat.

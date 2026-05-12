# 05 — Cert pinning Phase 2 + kill-switch : pourquoi désactivé V1, comment activer plus tard

> **Pour qui ?** Toi, qui as vu "Cert pinning Phase 2 scaffold + kill-switch" dans le récap et qui se demande ce que c'est concrètement.
> **Réponse courte :** **scaffold posé, désactivé en V1, à activer post-launch quand tu auras capturé les vraies empreintes du certificat de prod**. Aucune action V1.

---

## Le problème en une phrase

Sans cert pinning, ton app mobile fait confiance à n'importe quel certificat HTTPS valide pour `api.musaium.app`. Si un attaquant arrive à faire émettre un faux certificat (CA compromise, gouvernement autoritaire, captive portal d'aéroport), il peut intercepter et lire tout le trafic mobile (login, chat, photos d'œuvres).

---

## Analogie : le portier et la liste d'invités

Imagine une fête privée. Sans pinning, ton portier (l'app mobile) accepte n'importe qui qui présente une carte d'identité certifiée par n'importe quelle préfecture (n'importe quelle CA). Si une préfecture délivre des fausses cartes (CA compromise), des intrus passent.

**Avec pinning** : tu donnes au portier une **photo précise** de la personne attendue (l'empreinte SHA-256 de la clé publique de TON certificat). Maintenant, même si la préfecture est compromise et délivre une vraie carte au nom de la bonne personne, le portier vérifie la photo et refuse l'intrus.

**Avec kill-switch** : si ta vraie tête change (rotation de cert) et que le portier a la mauvaise photo, tu as un protocole d'urgence pour lui dire "fais confiance à la carte temporairement, je te ferai parvenir une nouvelle photo bientôt". Sans le kill-switch, tu serais brické : le portier refuse tout, l'app ne peut plus joindre l'API.

---

## Vocabulaire indispensable

| Terme | Définition courte |
|-------|-------------------|
| **SSL/TLS pinning** | Le client (ici l'app mobile) accepte uniquement un certificat dont la clé publique correspond à une empreinte hardcodée. |
| **SPKI hash** | Subject Public Key Info hash : SHA-256 de la clé publique du certificat, encodé en base64. C'est ce qu'on "pin". |
| **Leaf cert** | Le certificat directement servi par ton serveur (`api.musaium.app`). Émis par Let's Encrypt typiquement. |
| **Backup CA / pin** | Un deuxième pin "de secours". Permet de rotater le leaf sans casser les apps. |
| **Kill-switch** | Endpoint HTTP côté serveur qui peut désactiver le pinning à distance, pour récupérer d'une mass-mispin (mauvaises empreintes envoyées à l'app). |
| **Mass-mispin** | Catastrophe : tu publies une nouvelle version d'app avec les mauvaises empreintes. Sans kill-switch = tous les users brickés jusqu'à update store. |
| **TrustKit** | Lib iOS de référence pour le pinning, qui exige **deux pins minimum** (par sécurité). |
| **`react-native-ssl-public-key-pinning`** | La lib RN utilisée chez Musaium. Wrapper TrustKit côté iOS + OkHttp CertificatePinner côté Android. |

---

## Pourquoi c'est différent du HTTPS standard ?

HTTPS standard fait :
1. Le client demande la connexion à `api.musaium.app`.
2. Le serveur présente son certificat.
3. Le client vérifie : (a) signature valide par une CA dans le trust store du device, (b) hostname correspond.
4. Connexion établie.

**Le trou de sécurité** : si une CA dans le trust store est compromise (cas réel : DigiNotar 2011, Symantec 2017), elle peut émettre un faux certificat valide pour `api.musaium.app`. Le client accepte. Man-in-the-middle réussi.

Pour mobile en particulier, le risque vient aussi des **certificats installés par l'utilisateur** (charles proxy, mitmproxy, antivirus mobile, MDM enterprise) — ils sont dans le trust store, donc ils peuvent intercepter ton trafic.

**Pinning** ferme ce trou : peu importe que le certificat soit techniquement valide, **l'app vérifie en plus que la clé publique correspond à une empreinte hardcodée**.

---

## Pourquoi le pinning est dangereux à activer naïvement ?

Si tu publies l'app avec `PIN_HASHES = ["abc123..."]` et que demain Let's Encrypt te redélivre un nouveau cert avec une nouvelle clé publique, **toutes les apps installées qui ont l'ancienne empreinte rejettent la connexion**. Les users voient une erreur "impossible de joindre le serveur" et n'ont aucun moyen de débloquer (sauf désinstaller / réinstaller / update, ce qui n'aide pas si le pin reste mauvais dans la nouvelle version).

C'est ce qu'on appelle un **mass-mispin event**. Plusieurs entreprises connues s'y sont brickées : Twitter en 2018, plusieurs banques en 2019.

Trois protections classiques :

1. **Two-pin requirement** : pinner toujours **2 empreintes** (le leaf actuel + un backup). Comme ça, tu peux rotater l'un sans casser les apps.
2. **Pin par CA intermédiaire** plutôt que par leaf : moins précis, mais plus durable (les CAs intermédiaires changent moins souvent).
3. **Kill-switch côté serveur** : un endpoint HTTP que l'app interroge au démarrage pour savoir si elle doit appliquer le pinning ou non. Si tu fais une erreur de release, tu flippes le kill-switch côté serveur, tous les users récupèrent en moins de 1 heure.

Le sprint a buildé l'option (3) en plus du (1).

---

## Comment c'est implémenté chez Musaium

### La config (les empreintes pinées)

`museum-frontend/shared/config/cert-pinning.ts:34-37`

```ts
export const PLACEHOLDER_SPKI_HASHES_TBD_PROD = [
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // leaf — TBD
  'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=', // backup — TBD
] as const;
```

Lecture : ce sont des **placeholders syntaxiquement valides mais qui ne correspondent à AUCUN cert réel**. Ils sont nommés `PLACEHOLDER_..._TBD_PROD` exactement pour que personne ne les active sans les remplacer. Le sprint a posé la structure mais a laissé les vraies empreintes à capturer post-launch (parce qu'on ne connaît pas encore le cert prod final, et qu'on attend la confirmation Let's Encrypt + le cert backup).

### Comment capturer les vraies empreintes (à faire un jour)

`docs/RUNBOOKS/CERT_ROTATION.md` documente la procédure. Résumé :

```bash
# Capturer l'empreinte du leaf cert actuel sur api.musaium.app
echo | openssl s_client -servername api.musaium.app -connect api.musaium.app:443 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl rsa -pubin -outform der 2>/dev/null \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64

# Capture l'empreinte d'un cert backup (DigiCert R5 ou Let's Encrypt R3)
# Procédure similaire avec un cert récupéré depuis le panel Cloudflare ou autre.
```

Ces deux empreintes remplacent les placeholders dans `PLACEHOLDER_SPKI_HASHES_TBD_PROD`. C'est ça qui transforme le scaffold en vraie défense.

### Le kill-switch côté backend

Ton backend expose `GET /api/config/cert-pinning-enabled` qui renvoie `{ "pinningEnabled": true }` ou `false`. L'app le requête au boot et **cache la réponse 1 heure**.

Si tu fais un mass-mispin :
1. Tu vas sur ton VPS, tu mets `pinningEnabled: false` dans la config.
2. Au prochain refresh (max 1 heure), les apps lisent `false` et arrêtent d'appliquer le pinning.
3. Tu as 24-48 heures pour publier une nouvelle version avec les bonnes empreintes.
4. Une fois la nouvelle version déployée, tu remets `pinningEnabled: true`.

### Le wiring runtime

`museum-frontend/shared/infrastructure/cert-pinning-init.ts`

```ts
const isEnvEnabled = (): boolean =>
  String(process.env.EXPO_PUBLIC_CERT_PINNING_ENABLED ?? '').toLowerCase() === 'true';
```

Lecture : la fonction `initCertPinning` ne fait rien si `EXPO_PUBLIC_CERT_PINNING_ENABLED` n'est pas explicitement à `true`. Tant que la build mobile ne set pas ce flag, **rien ne se passe au runtime** — pas d'overhead, pas de risque.

Et la résolution du kill-switch :

```ts
export const resolveKillSwitchState = async (params: {...}): Promise<KillSwitchState> => {
  const store = params.storageImpl ?? storage;
  const cached = await store.getJSON<KillSwitchState>(KILL_SWITCH_CACHE_KEY);
  if (cached && isCacheFresh(cached)) {
    return { ...cached, source: 'cache' };
  }

  if (!params.apiBaseUrl) {
    return FAIL_OPEN_STATE;
  }

  const fetcher = params.fetchImpl ?? fetch;
  try {
    const response = await fetcher(`${params.apiBaseUrl}${KILL_SWITCH_PATH}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return FAIL_OPEN_STATE;
    }
    const json = (await response.json()) as unknown;
    const fresh = parseKillSwitchPayload(json);
    await store.setJSON(KILL_SWITCH_CACHE_KEY, fresh);
    return fresh;
  } catch {
    return FAIL_OPEN_STATE;
  }
};
```

Trois branches importantes :

1. **Cache hit fresh** : on re-utilise la dernière réponse du serveur (≤1 h).
2. **Pas d'API URL** : `FAIL_OPEN_STATE` (pinning autorisé) — sécurité d'abord.
3. **Fetch foire** (network error, 4xx, 5xx, JSON malformé) : `FAIL_OPEN_STATE`.

Le **fail-open** ici est volontaire : si un attaquant bloque le kill-switch endpoint, l'app continue de pinner (sécurité maintenue). L'attaquant ne peut pas désactiver le pinning juste en cassant la requête.

### La limite honnête (déclarée dans ADR-031)

Le fail-open couvre les **réponses malformées et erreurs réseau**. Mais **un attaquant qui forge une réponse `{ "pinningEnabled": false }` parfaitement bien formée**, en MITM sur le tout premier appel après cold launch, peut désactiver le pinning. C'est documenté dans l'ADR-031 Consequences.

Solution future : signer la réponse du kill-switch (HMAC avec un secret embarqué dans l'app). Pas en V1.

---

## Pourquoi c'est désactivé en V1

Trois raisons :

1. **Empreintes pas encore capturées** (les placeholders ne pinnent rien d'utile).
2. **Risque de bricker l'app** au premier déploiement si on s'est trompé. La V1 a déjà beaucoup de risques (iOS 26 crash, voice pipeline). On évite d'en ajouter.
3. **Le kill-switch lui-même n'a pas d'usage tant que le pinning n'est pas activé** — donc rien à tester en prod.

`EXPO_PUBLIC_CERT_PINNING_ENABLED` reste à `false` par défaut. La fonction `initCertPinning` ne s'exécute pas au boot. **Aucun overhead runtime, aucun risque.**

---

## Pourquoi c'est pertinent pour Musaium (un jour)

Musaium est une app **conversationnelle qui transmet du contenu utilisateur en temps réel** : photos d'œuvres, conversations chat, login. Profils sensibles :

- **Touristes en voyage** : connexions sur Wi-Fi public d'aéroport, hôtel, café — terrain idéal pour MITM via faux portail captif.
- **Visiteurs en pays restrictifs** (Chine, Russie, Iran si le marché s'étend) — les CAs étatiques peuvent émettre des faux certs pour intercepter.
- **B2B musée** : si un musée déploie l'app sur ses tablettes, leur réseau Wi-Fi enterprise peut avoir un MDM avec proxy d'inspection — utile pour eux, mais on doit choisir si on tolère ça ou pas.

Sans cert pinning, ces trois cas = trafic interceptable. Avec, **les requêtes refusent de partir** dès que le cert présenté ne match pas l'empreinte attendue.

---

## Quand l'activer post-launch

Plan suggéré (dans 1-2 mois post-launch, après la phase soak) :

### Étape 1 — Capturer les empreintes (1 heure)

Suivre la procédure dans `docs/RUNBOOKS/CERT_ROTATION.md`. Tu obtiens 2 empreintes : le leaf cert actuel + une CA backup.

### Étape 2 — Patch `cert-pinning.ts` (5 minutes)

Remplacer `PLACEHOLDER_SPKI_HASHES_TBD_PROD` par les vraies empreintes :

```ts
export const SPKI_HASHES_PROD = [
  '<empreinte leaf base64>=',
  '<empreinte backup CA base64>=',
] as const;
```

### Étape 3 — Tester en build interne (3 jours)

Build EAS internal-distribution avec `EXPO_PUBLIC_CERT_PINNING_ENABLED=true`. Test sur 5-10 devices iOS + Android. Si tout marche, push en TestFlight.

### Étape 4 — Soak TestFlight (1 semaine)

Vérifier qu'aucun user ne signale "impossible de joindre le serveur". Vérifier dans Sentry les errors `addSslPinningErrorListener`.

### Étape 5 — Activer en build store (1 jour)

Push en App Store + Google Play avec le flag à `true`. Surveiller Sentry pendant 48 h.

### Étape 6 — Le jour où tu rotates le cert (~tous les 90 jours pour Let's Encrypt)

Suivre `docs/RUNBOOKS/CERT_ROTATION.md` § "Planned cert rotation 3-pin transition" : tu pin **trois** empreintes (vieux + nouveau leaf + backup) pendant la transition, puis tu retires le vieux leaf une fois que toutes les apps en circulation sont à jour.

### Étape 7 — Le jour où tu fais une erreur (mass-mispin)

1. Ouvrir le panel admin / SSH sur le VPS.
2. Modifier la config pour que `/api/config/cert-pinning-enabled` retourne `{ "pinningEnabled": false }`.
3. Attendre max 1 heure (TTL cache).
4. Toutes les apps désactivent le pinning, redeviennent fonctionnelles.
5. Push une nouvelle version avec les bonnes empreintes.
6. Une fois la nouvelle version diffusée (~1-2 semaines à toucher 95 % des users via store update), réactiver `pinningEnabled: true`.

---

## Est-ce overkill pour Musaium V1 ?

**Pour V1 : non d'avoir buildé le scaffold (1 jour de dev), oui d'activer.**

Le coût d'avoir buildé est amorti — c'est dans le code, c'est testé, c'est désactivé. Le coût d'activer en V1 = **risque de bricker la V1** si l'empreinte est fausse. La V1 a déjà assez de risques.

**Pour V1.1 ou V2 : oui, à activer.** Surtout si tu cibles les marchés mobile-first (Asie) ou si tu ouvres aux musées B2B (qui peuvent avoir des MDM enterprise sans warning).

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Modifier `cert-pinning.ts` | **Rien à faire en V1**. Les placeholders restent. |
| Setter `EXPO_PUBLIC_CERT_PINNING_ENABLED` | **Rien à faire**. Reste à `false`. |
| Configurer le kill-switch endpoint backend | **Rien à faire en V1**. Pas appelé tant que `EXPO_PUBLIC_CERT_PINNING_ENABLED=false`. |
| Lire `docs/RUNBOOKS/CERT_ROTATION.md` | À faire **une fois** pour comprendre la procédure. |
| Noter dans ROADMAP_TEAM | "Activer cert pinning Phase 2 dans la fenêtre 2026-07 → 2026-08, après stabilisation V1." |

Si tu te poses la question "pourquoi on a fait l'effort si on l'active pas en V1" : parce que **c'est mille fois moins coûteux de scaffold maintenant et activer plus tard que d'attendre l'incident MITM pour faire l'effort**. C'est l'approche Musaium correcte : build, désactive, observe, active.

# Prompt — lancer la suite Maestro iOS en local (48 flows)

> Copie-colle **tout ce qui suit la ligne `---`** dans une session Claude Code neuve, à la racine du repo.
> Rien à adapter : les valeurs sont vérifiées au 2026-07-14.

---

## 0. VERROUS (lis-les avant toute action)

**🔒 COÛT — zéro run GitHub (UFR-023).** Aucun `git push`, aucun `gh workflow run`, aucun `workflow_dispatch` sans accord **explicite** de Tim. Le job iOS tourne sur un runner **macOS = ×10 les minutes Linux**, ~60 min/run ≈ **1500 min facturées** sur un quota de 2000/mois. Tout est reproductible en local, gratuitement. Un run GitHub n'est **jamais** une exploration : c'est la confirmation finale d'un état déjà vert **et prouvé** en local.

**🔒 HONNÊTETÉ (UFR-013).** Chaque affirmation = une preuve (`fichier:ligne`, commande + **exit code réel**, screenshot). Jamais « ça devrait marcher ». Un test rouge n'implique pas un produit cassé : **lis l'artefact (screenshot / hiérarchie de vues) AVANT de toucher au produit.**

**🔒 BYPASS (UFR-020).** Aucun `--no-verify`, aucun `SKIP_*`. Un hook qui bloque à tort → on répare le hook.

**🔒 BRANCHE.** Ne crée ni ne change de branche. Seul Tim les crée.

**⚠️ RTK.** `rtk` corrompt et tronque certaines sorties → préfixe `rtk proxy <cmd>` pour toute commande dont tu **lis** la sortie (`git`, `docker`, `ps`).

---

## 1. LA MISSION

Faire tourner les **48 flows** de la suite `ios-main` sur simulateur iOS, en local, et **atteindre 48/48**.

Les 6 flows historiquement rouges ont été corrigés (commit `6f399abb`, 2026-07-14). Ce run est la **preuve**, pas l'exploration.

---

## 2. PRÉ-VOL — dans cet ordre, sans en sauter un

### a. Le backend

```bash
docker compose -f museum-backend/docker-compose.dev.yml up -d
# attendre /api/health = 200 (peut prendre ~100 s : TypeORM + migrations + workers)
until [ "$(curl -s -m 3 -o /dev/null -w '%{http_code}' http://localhost:3000/api/health)" = "200" ]; do sleep 2; done
echo "backend up"
```

**Vérifier que le LLM répond vraiment** — un backend « healthy » qui rend des gabarits vides fait passer 17 flows chat au vert en ne testant rien (INC-2026-07-14) :

```bash
docker logs dev-backend 2>&1 | grep -c llm_section_success   # doit monter après un message
docker logs dev-backend 2>&1 | grep -c 'Body is unusable'    # DOIT être 0
```

### b. Le simulateur

Deux existent déjà (`xcrun simctl list devices | grep Maestro`). Boote-en un :

```bash
xcrun simctl boot D2285FC8-1B43-4057-88FA-A404EA9D0400   # Maestro-iPhone-265 (iPhone 17 / iOS 26.5)
open -a Simulator
```

Si aucun ne convient : `node museum-frontend/scripts/pick-ios-simulator.mjs` imprime un runtime + un type de device **résolus dynamiquement** (le runner `macos-26` n'a **pas** de runtime iOS 17.5 — tout `simctl create … "iOS17.5"` en dur est une bombe).

**Purge le Keychain.** Il **survit à `clearState` et à une désinstallation** : un refresh token y ressuscite la session, l'app boote past `/auth` directement sur Home, et tous les flows suivants héritent d'un état connecté.

```bash
xcrun simctl keychain D2285FC8-1B43-4057-88FA-A404EA9D0400 reset
```

### c. Le build

```bash
cd museum-frontend
./scripts/build-ios-e2e.sh
```

Ce script encode **toute** la recette (elle était tribale jusqu'au 2026-07-14) :
- les 3 seams e2e **sur la ligne de commande**, jamais dans un `.env` (Metro les inlinerait dans **tout** build local — un `EXPO_PUBLIC_MAESTRO_AUDIO_FIXTURE` dans `.env` embarque un **micro bouchonné** dans chaque archive ; pre-push Gate 36 le refuse désormais) ;
- **pas** de `CODE_SIGNING_ALLOWED=NO` — un binaire non signé n'a pas d'entitlements ⇒ pas de keychain access group ⇒ `expo-secure-store` meurt (`errSecMissingEntitlement`, -34018) ⇒ **login impossible** ;
- `simctl addmedia` de `test-artwork.jpg` — la CI sème la photothèque, le local ne le faisait pas (2 flows rouges pour ça).

⚠️ **Ne jamais stager `museum-frontend/ios/`.** Un `expo prebuild --clean` SUPPRIME `ios/ci_scripts/` (les hooks Xcode Cloud de prod). Si prebuild a tourné : `git checkout -- museum-frontend/ios/`.

---

## 3. LE RUN

```bash
cd museum-frontend
export PATH="$HOME/.maestro/bin:$PATH"
export DB_HOST=localhost DB_PORT=5433   # sinon le re-seed intégré échoue (le .env dit DB_HOST=db, qui ne résout QUE dans le réseau compose)
bash scripts/maestro-run-shard.sh ios-main
```

`ios-main` = tous les shards **sauf `netshape`**, moins `chat-compare.yaml` (exclu d'iOS : SigLIP arrive par `docker pull`, absent des runners macOS — couvert par Android). **48 flows.**

Le script **re-seed la base au démarrage** : `auth-account-delete` DÉTRUIT `apple.test@apple.com`, et les 3 tokens magic-link sont **single-use** (mis à `NULL` à la consommation). Sans re-seed, la 1ʳᵉ run est verte et **toutes les suivantes sont rouges sur une base qu'elles ont elles-mêmes empoisonnée**.

### Les 4 flows netshape (séparément)

Ils exigent un réseau **réellement dégradé** — Toxiproxy natif (les runners macOS n'ont pas Docker) :

```bash
brew install toxiproxy
bash scripts/net-shaping/toxiproxy-up.sh
# puis un 2e build pointé sur le proxy, et :
bash scripts/maestro-run-shard.sh netshape
```

---

## 4. LES SEPT PIÈGES QUI ONT DÉJÀ COÛTÉ CHER

1. **UN simulateur = UN Maestro.** Le driver (`maestro-driver-iosUITests-Runner`) est un **singleton attaché au device**. Deux runners sur le même simulateur se volent le driver → **verdicts invalidés**.
2. **Ne jamais éditer un fichier pendant qu'une run le lit.** Ni un `.yaml`, ni `maestro-run-shard.sh` (bash lit un script **au fil de l'eau**).
3. **Un build e2e est un build RELEASE** → `__DEV__ === false`. Tout seam gaté dessus est **mort dedans**. Le gate correct est un seam de build (`EXPO_PUBLIC_E2E_DEV_ROUTES`), jamais `__DEV__`.
4. **`FREE_TIER_MONTHLY_SESSION_LIMIT` vaut 3 par défaut**, et 17 des 18 flows chat ouvrent une conversation. Dès la 4ᵉ, le backend renvoie 402, la paywall recouvre le composer, `chat-input` disparaît, et **tout ce qui suit tombe**. Il est déjà à 100000 dans `museum-backend/.env` — **vérifie-le**.
5. **`hideKeyboard` atterrit sur le bouton sous le champ (iOS)** : sur l'écran d'auth il touche `auth-submit` et **déclenche le login en avance**. Remède : taper un **texte inerte** (`text: "Welcome back|Bon retour"`) — mais ça ne marche **que** si le formulaire vit dans un `ScrollView keyboardShouldPersistTaps="handled"`. Dans une modale sans ScrollView, le tap est un **no-op** et le test ment.
6. **Le sélecteur `text:` de Maestro est une regex ANCRÉE sur la chaîne entière** (le champ s'appelle `textRegex` dans l'artefact). `visible: "Who painted the Mona Lisa"` ne matche **pas** `"Who painted the Mona Lisa?"`. Utilise `.*…*`.
7. **Un `extendedWaitUntil` ATTEND — il ne SCROLLE pas.** Sur un CTA sous la ligne de flottaison, il ne peut **jamais** aboutir. Utilise `scrollUntilVisible` avec les params prouvés : `timeout: 30000, visibilityPercentage: 50, speed: 25, waitToSettleTimeoutMs: 800`.

---

## 5. INTERPRÉTER UN ROUGE

**Avant de toucher au produit, lis l'artefact.** `.maestro/logs/debug/<flow>/…/` contient screenshots + hiérarchie de vues.

Un rouge peut être :
- **un vrai bug produit** → corrige le produit, **ne réassouplis jamais l'assertion** ;
- **un test faux** (regex ancrée, scroll manquant, `hideKeyboard`) → corrige le test ;
- **un écart d'environnement** (photothèque vide, Keychain sale, quota) → corrige le harnais.

**Ne devine pas laquelle des trois. Le screenshot te le dit.**

⚠️ **Un vert n'est pas une preuve.** Les flows chat assertent désormais que la bulle assistant existe **ET** qu'elle n'est pas le gabarit de repli (`helpers/assert-llm-answered.yaml`), et `chat-flow` exige le mot **« Leonardo »**. Si tu vois un flow chat vert alors que le backend est mort, **c'est le garde qui est cassé** — pas une bonne nouvelle.

---

## 6. À LA FIN

- **48/48** → dis-le avec la sortie réelle. Puis **demande à Tim** avant tout push.
- **< 48/48** → pour chaque rouge : cause **prouvée** (screenshot / log / `fichier:ligne`), classée dans les 3 catégories ci-dessus, et le correctif proposé.
- **Zéro run GitHub sans accord explicite.**

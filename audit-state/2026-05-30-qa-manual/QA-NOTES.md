# QA manuelle — 2026-05-30

> Session de QA manuelle (Tim sur iOS sim) + monitoring logs backend Docker en parallèle.
> **Capture logs live** : `audit-state/2026-05-30-qa-manual/backend-raw.log` (`docker logs -f --timestamps dev-backend`, démarré ~08:13).
> Stack : `dev-backend` (port 3000) + `dev-postgres` (5433) + `dev-redis` + `dev-adminer`. NODE_ENV=production dans le container.
> **Méthode** : Tim signale un retour → je corrèle avec les logs backend → diagnostic code-vérifié (`file:line`) → consigné ici. Consolidation + corrections **après** la passe complète.

Légende statut diagnostic : ✅ **vérifié** (code lu) · 🔶 **hypothèse** (à confirmer) · ⏳ en cours.
Sévérité : 🔴 bloquant launch · 🟠 majeur UX · 🟡 mineur/polish · 🔵 question produit.

---

## Table de suivi

| ID | Écran | Retour | Sév. | Diag | Type |
|----|-------|--------|------|------|------|
| QA-01 | Chat | Câblage IA KO — « Service temporarily unavailable » | 🔴 | ✅ | infra/config dev |
| QA-02 | Chat / menu « + » | Terme « cartel » incompris, trouver autre mot | 🟡 | ✅ | i18n/copy |
| QA-03 | Chat / menu « + » | Boutons taille variable → grille uniforme type WhatsApp | 🟡 | ✅ | UI/layout |
| QA-04 | Tableau de bord | Barre « Modifier » (Tout sélec./Supprimer) cachée derrière la tab bar | 🟠 | ✅ **CORRIGÉ** | UI/positionnement |
| QA-05 | Liste musées | Console Error React Query `["museums","directory"]` CancelledError | 🟠 | ✅ | data/react-query |
| QA-06 | Map → détail musée | Écran détail quasi vide, à câbler ou supprimer | 🟠 | ✅ | data/UX |
| QA-07 | Paramètres | « Mode économie de données » : texte à centrer dans les blocs | 🟡 | ✅ | UI/layout |
| QA-08 | Œuvre du jour | Carte mal centrée + fun-fact « Le saviez-vous » en anglais | 🟠 | ✅ | i18n/data + UI |
| QA-09 | Accueil | « Reprendre votre dernière conversation » → conversation vierge | 🟠 | ✅ **CORRIGÉ** | nav/data |
| QA-10 | Tableau de bord | « Partager » : partage quoi ? Devrait être par conversation ? | 🔵 | ✅ | question produit |

> `*` QA-09 : handler + navigation **vérifiés** ; site exact d'écriture du pointeur = hypothèse forte (tracée structurellement, ligne non épinglée).

---

## QA-01 — 🔴 Câblage IA KO (chat bloqué) ✅

**Symptôme** (Image #2) : « Je suis devant la Joconde » → réponse *« Service is temporarily unavailable. Please retry in a moment — your message was not flagged. »*, badge rouge « Faible — IA seule ».

**Logs backend corrélés** (`requestId 3aaf1d74…`) :
```
chat_service_call postMessage sessionId=db91780b… userId=1
llm_guard_fail_closed   kind=network path=/scan/prompt error="fetch failed"
guardrail_provider_block adapter=llm-guard phase=input rawReason=error mappedReason=service_unavailable
http_request POST /api/chat/sessions/…/messages 201
```

**Cause racine (vérifiée)** :
- `museum-backend/.env:43-45` → `GUARDRAILS_V2_LLM_GUARD_URL=http://llm-guard:8081`, `GUARDRAILS_V2_TIMEOUT_MS=500`, `GUARDRAILS_V2_OBSERVE_ONLY=false` (= layer V2 LLM Guard **actif + bloquant**).
- Le container `llm-guard` **n'est pas lancé** : `docker-compose.dev.yml` n'inclut PAS le service ; il vit dans l'overlay `docker-compose.guardrails.yml`.
- `fetch failed` sur `/scan/prompt` → fail-CLOSED (ADR-047) → tout message chat bloqué. C'est l'incident prod du 2026-05-12 reproduit en local.

**Incohérence de défaut à noter** : l'overlay `docker-compose.guardrails.yml` met `OBSERVE_ONLY=true` (non-bloquant) par défaut, mais `.env` force `false`. Donc le quickstart documenté `docker compose -f docker-compose.dev.yml up` → chat cassé d'office. Le `Dockerfile` du sidecar **existe** (`ops/llm-guard-sidecar/Dockerfile`, 3 Ko) — l'ancien comment « NOT YET BUILT » est périmé.

**Déblocage QA (2 options)** :
1. **Rapide (reco pour continuer la QA chat)** : `.env` → `GUARDRAILS_V2_OBSERVE_ONLY=true` (ou commenter `GUARDRAILS_V2_LLM_GUARD_URL`) + restart `dev-backend`. Chat répond via V1 keyword + V2 judge. ~10 s.
2. **Fidélité prod** : `docker compose -f docker-compose.dev.yml -f docker-compose.guardrails.yml up -d` (1er boot 3-4 min, download modèles HF). Teste le vrai chemin guard.

**À trancher pour le launch** : disponibilité du chat si le sidecar a un hoquet en prod (fail-closed = 100 % refus). Le circuit breaker `LLM_GUARD_CB_*` + scale x2 sont les garde-fous documentés (`docs/OPS_INCIDENT_LLM_GUARD.md`) — à valider.

**✅ DÉBLOQUÉ 2026-05-30** : `museum-backend/.env:45` `GUARDRAILS_V2_OBSERVE_ONLY` `false → true` + `docker compose -f docker-compose.dev.yml up -d --force-recreate --no-deps backend` (health OK ~36 s, observe-only confirmé dans le container). Le guard scanne/logge mais ne bloque plus → chat répond. **Réversible** : remettre `false` ou lancer l'overlay guardrails pour tester le vrai chemin.
**Sous-finding QA-01b** 🟡 : `museum-backend/.env` lignes 41 & 43 dupliquent `GUARDRAILS_V2_LLM_GUARD_URL=http://llm-guard:8081` (inoffensif, dernier gagne — à dédupliquer au passage).
**À faire avant launch** : rendre le stack dev cohérent (soit inclure le sidecar dans `docker-compose.dev.yml`, soit défaut `OBSERVE_ONLY=true` en dev) pour que le quickstart documenté ne casse pas le chat d'office.

---

## QA-02 — 🟡 Terme « cartel » incompris ✅

**Symptôme** (Image #4) : menu « Joindre au message » → option « **Scanner le cartel** ». « cartel » = terme musée correct (étiquette murale) mais incompris du grand public → trouver un mot plus clair.

**Localisation (vérifiée)** :
- Composant : `museum-frontend/features/chat/ui/AttachmentPickerSheetContent.tsx:148-165`
- Clé i18n : `chat.attachmentPicker.scan_cartel`
- Traductions : `shared/locales/{fr,en,de,es,it,ja,zh,ar}/translation.json` (fr:530 « Scanner le cartel », en « Scan cartel », de « Schild scannen »…)
- Action réelle : scan QR de l'étiquette de l'œuvre → `CartelScannerSheetContent.tsx:86-110` (code legacy `ABC-123` → template lookup ; deeplink `musaium://museum/<uuid>/artwork/<uuid>` → contexte session).

**Piste copy** : « Scanner l'œuvre », « Scanner le QR de l'œuvre », « Scanner le code de l'œuvre ». À trancher (8 locales à mettre à jour + tests `AttachmentPickerSheetContent.scan-cartel.test.tsx`).

---

## QA-03 — 🟡 Menu « + » : boutons à uniformiser (style WhatsApp) ✅

**Symptôme** (Image #4 vs #5) : les options du menu sont des **pills de largeur variable** (taille = texte). Tim veut des tuiles **toutes de même taille**, type grille d'icônes WhatsApp (Image #5 = grille de tuiles uniformes).

**Localisation (vérifiée)** : `AttachmentPickerSheetContent.tsx`
- `actionsRow` (l.243-247) : `flexDirection:'row'`, `flexWrap:'wrap'`, `gap` — wrap de pills.
- `actionButton` (l.248-257) : aucun `width`/`flex`/`aspectRatio` → taille = contenu. `minHeight:44`.

**Piste fix** : passer en grille (ex 3 ou 4 colonnes), tuiles `flex-basis`/`width` égales (icône au-dessus, label dessous, `numberOfLines`), `aspectRatio` constant. 1 fichier (+ peut-être tokens DS). Vérifier RTL (`marginStart/End`) + tests snapshot.

---

## QA-04 — 🟠 Barre « Modifier » cachée derrière la tab bar ✅

**Symptôme** (Image #6) : Tableau de bord → « Modifier » → barre « Tout sélectionner » + « Supprimer (1) » apparaît **au même endroit que la tab bar** (Tableau de bord/Musées/Accueil) → invisible/inutilisable.

**Cause racine (vérifiée)** :
- Composant barre : `museum-frontend/features/conversation/ui/ConversationsBulkBar.tsx:60-68` — styles `bulkBar` **sans aucun offset bas** (pas de `position`/`bottom`/`marginBottom`/`zIndex`).
- Rendu : `app/(tabs)/conversations.tsx:269-276` — barre rendue comme **sibling** de la FlashList, sans padding bas.
- Tab bar : `app/(tabs)/_layout.tsx:14-15,84-95` — **absolute** en bas, `TAB_BAR_VISUAL_HEIGHT=64`, `TAB_BAR_FLOATING_GAP=12`.

**Pattern correct existant** (à réutiliser) : `conversations.tsx:40-41` / `home.tsx:39-40` →
`bottomPad = useBottomTabBarHeight() + TAB_BAR_FLOATING_GAP + insets.bottom`, appliqué en `paddingBottom`/`marginBottom`.

**Piste fix** : appliquer `marginBottom: bottomPad` à la barre OU la rendre `position:absolute; bottom: bottomPad; zIndex` au-dessus de la tab bar. 1-2 fichiers.

**✅ CORRIGÉ 2026-05-30** : `app/(tabs)/conversations.tsx:259` — barre enveloppée dans `<View style={{ marginBottom: bottomPad }}>` (`bottomPad = useBottomTabBarHeight() + TAB_BAR_FLOATING_GAP + insets.bottom`, déjà calculé l.41) → remonte au-dessus de la tab bar flottante. Zéro changement de composant/test. Vérif : jest 41/41 (bulk bar + écran), `tsc` 0, eslint 0.

---

## QA-05 — 🟠 Liste musées : Console Error React Query ✅

**Symptôme** (Image #7) : ouverture liste « Musées » → LogBox *« A query that was dehydrated as pending ended up rejecting. [["museums","directory"]]: Error: CancelledError »*.

**Cause racine (vérifiée)** :
- `museum-frontend/shared/data/queryClient.ts:98-102` — `shouldDehydrateQuery` custom **omet le check de statut** :
  ```ts
  export function shouldDehydrateQuery(query) {
    const head = query.queryKey[0];
    if (typeof head !== 'string') return true;
    return !SENSITIVE_QUERY_KEY_PREFIXES.has(head); // BUG: ne vérifie pas status === 'success'
  }
  ```
  Le défaut React Query est `query.state.status === 'success'`. En l'overridant sans ce test, les queries **pending** sont persistées (AsyncStorage via `PersistQueryClientProvider`, `app/_layout.tsx:169-176`).
- Séquence : `useMuseumDirectory` (`features/museum/application/useMuseumDirectory.ts:120-159`) lance la query → app backgroundée pendant qu'elle est pending → dehydrate pending → cold start → React Query reprend la promesse morte → `CancelledError`. Le `signal` est bien forwardé mais inutile une fois sérialisé.

**Piste fix** : `shouldDehydrateQuery` → ajouter `&& query.state.status === 'success'`. Fichier : `queryClient.ts:98-102` (+ test `__tests__/data/queryClient.test.ts`). Fix générique (corrige toutes les queries, pas que museums).

---

## QA-06 — 🟠 Map → détail musée quasi vide ✅

**Symptôme** (Image #8) : tap marqueur map → écran détail « International Art Museum of America » montre seulement nom + adresse + « 269 m » + « Ouvrir dans Plans » + « Démarrer un chat ici ». Aucun détail réel.

**Cause racine (vérifiée — nuancée)** :
- Écran : `app/(stack)/museum-detail.tsx:24-222` (depuis `app/(tabs)/museums.tsx:158-173` → `MuseumSheet` « voir plus »).
- L'écran **est câblé** à l'enrichment : `useMuseumEnrichment` → `GET /api/museums/:id/enrichment?locale=` (type `MuseumEnrichmentView` : `summary, website, phone, imageUrl, openingHours, wikidataQid`). Composant `features/museum/ui/MuseumDetailEnrichment.tsx:66-185` affiche image/summary/horaires/site/tel.
- **Le vrai problème = données** : « International Art Museum of America » (musée test US) **n'a aucune ligne enrichment** → spinner puis « no extra info ». Les seeds riches (Louvre/Orsay/Rijksmuseum, `scripts/seed-knowledge.ts:462+`) existent mais pas pour ce musée. + UX async : 1er rendu = nom/adresse/distance seuls pendant le poll.
- Champs DB riches (`admissionFees`, `collections`, `currentExhibitions`, `accessibility`) existent en base mais **non exposés** par l'API P3.

**Piste fix** : (a) seeder l'enrichment des musées démo affichés, et/ou (b) améliorer l'état de chargement (skeleton au lieu d'un écran « vide »), et/ou (c) exposer les champs JSONB riches si on veut horaires/collections/accessibilité. À trancher selon scope launch (musées démo = B2C V1 in/out).

---

## QA-07 — 🟡 Paramètres : texte « Mode économie de données » à centrer ✅

**Symptôme** (Image #9) : section « Mode économie de données » avec 3 options (Automatique / Économie activée / Désactivée). Tim veut le **texte centré** dans chaque bloc/div d'option (actuellement aligné à gauche ; « Économie activée » wrap sur 2 lignes → les libellés 1-ligne paraissent décalés en haut).

**Cause racine (vérifiée)** :
- Composant : `museum-frontend/features/settings/ui/DataSaverModeSelector.tsx` (styles ~l.112-138, n° approximatifs).
- `styles.option` : `flex:1` (largeurs égales ✓) mais **aucun** `alignItems`/`justifyContent` → texte collé en haut-gauche.
- `styles.optionLabel` : **aucun** `textAlign` → aligné à gauche.
- `styles.row` : pas d'`alignItems` → défaut `stretch` (hauteurs égales mais contenu top-aligné).
- i18n : `settings.dataSaver.title` + `settings.dataSaver.options.{auto,on,off}` + `settings.dataSaver.hint`.

**Piste fix** : `option` += `alignItems:'center'` + `justifyContent:'center'` ; `optionLabel` += `textAlign:'center'`. RTL-safe (`center` autorisé). 1 fichier. Vérifier snapshot test éventuel.

---

## QA-08 — 🟠 Œuvre du jour : fun-fact en anglais (data) + centrage ✅

**Symptôme** (Image #10) : carte « ŒUVRE DU JOUR » (Mona Lisa). Fun-fact « Le saviez-vous ? » **en anglais** (*« The Mona Lisa has her own mailbox… »*) sous UI FR. Carte/texte pas bien centrés.

**Cause racine (vérifiée — c'est de la DATA, pas du wiring)** :
- `museum-backend/src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts` — entrée `mona-lisa` (l.14-31) : `funFact` = **une seule string anglaise**, pas de variante par locale. Vrai pour toutes les entrées du catalogue.
- Type : `museum-backend/src/modules/daily-art/domain/daily-art.types.ts` → `funFact: string` (pas `Record<Locale,string>`).
- Use-case `getDailyArtwork.useCase.ts` + controller `dailyArt.controller.ts` (`GET /api/daily-art?locale=`) : le `locale` est bien parsé/passé end-to-end **mais jamais appliqué au `funFact`** → retour verbatim anglais.
- Frontend `features/daily-art/ui/DailyArtCard.tsx` : le label « Le saviez-vous ? » est localisé (i18n), mais la **valeur** = `artwork.funFact` brut (anglais).

**Piste fix (data)** : `funFact: string` → `Record<Locale,string>` (ou `funFactByLocale`), traduire toutes les entrées, use-case sélectionne `funFact[locale] ?? funFact.en`. Touche : `daily-art.types.ts`, `artworks.data.ts` (toutes entrées), `getDailyArtwork.useCase.ts`, mapper réponse + OpenAPI + types FE générés. ⚠️ feature non-triviale (passe `/team` 5-phase) à cause du changement de contrat.

**Centrage** : style dans `DailyArtCard.tsx` — le bloc header (titre/artiste/musée) est `textAlign:'center'`, le paragraphe funFact probablement non centré (à confirmer ligne exacte à l'impl).

---

## QA-09 — 🟠 « Reprendre votre dernière conversation » → conversation vierge ✅*

**Symptôme** : bouton « Reprendre votre dernière conversation » ouvre une **conversation vierge**, pas la dernière active.

**Mécanisme (vérifié via Read, pas via RTK)** :
- Entrée : `app/(tabs)/home.tsx:44` `useResumableSession()` → `home.tsx:85` `<ConversationResumptionBanner onResume={(id) => router.push(...)} />`. Pas de `handleResumeLastConversation` (claim d'un agent — non confirmé, écarté).
- Sélection : `features/chat/application/useResumableSession.ts` → `pickResumable()` filtre `messageCount > 0 && (now - updatedAt) < 7j`, puis `reduce` **max par `updatedAt`**.
- **Bug** : `updatedAt` est **figé = `createdAt`** (jamais bumpé sur message). Donc « la plus récemment active » est calculée sur un champ qui ne reflète pas l'activité → on rouvre la session la plus récemment **créée** parmi celles qui ont des messages, pas la plus récemment **discutée**.

**Données réelles (DB `postgres`/`museumAI`, user 1, 2026-05-30)** :
| session | created | updated | last_message_at | msgs |
|---|---|---|---|---|
| a1c4f7e2 | 05-23 10:05 | 05-23 10:05 | (null) | 0 |
| 7b2d9f44 Mona Lisa | 05-23 09:58 | 05-23 09:58 | 05-23 09:59 | 2 |
| db91780b | 05-30 06:15 | 05-30 06:15 | 05-30 06:16 | 3 |
| 3f8e9c21 | 05-30 06:14 | 05-30 06:14 | 05-30 06:14 | 3 |
`updated == created` partout ; `last_message_at` correct.

**Contrat FE (vérifié `contracts.ts:207-216`)** : `ListedChatSession` expose déjà `lastMessageAt: string | null` + `messageCount`. → **fix FE-only, pas de changement backend/contrat.**

**Piste fix (FE, 1 fonction)** : `pickResumable` → filtrer `lastMessageAt != null` + `reduce` max par `lastMessageAt` + fenêtre 7j sur `lastMessageAt`. Test existant `__tests__/.../useResumableSession.test.ts` à étendre (red prouvant qu'avec `updated` figé on choisit la mauvaise session).

**⚠️ À confirmer par repro live** : la mécanique exacte du « vierge » observé (sélection d'une session sans contenu visible **vs** rendu vide d'une session dont les messages = refus guard QA-01 filtrés par `useSessionLoader`). Le fix de tri est correct dans tous les cas ; la repro tranchera s'il reste un 2ᵉ effet (rendu).

**Note honnêteté** : un snapshot DB antérieur (creds `museum`/`museum_dev` erronées, sortie RTK) montrait une égalité `updatedAt` fausse — **invalidé**, remplacé par les données ci-dessus.

**✅ CORRIGÉ 2026-05-30 (red→green→vérifié)** :
- `useResumableSession.ts` — `ListSessionItem` reçoit `lastMessageAt?: string | null` ; nouveau helper `activityMs(s) = new Date(s.lastMessageAt ?? s.updatedAt)` ; `pickResumable` filtre **et** classe par `activityMs` (au lieu de `updatedAt` figé). Docstrings mises à jour.
- BE déjà OK : `chatSession.repository.pg.ts` calcule `MAX(m.createdAt) AS lastMessageAt` + ordonne `COALESCE(MAX(m.createdAt), s.createdAt) DESC` ; le champ est dans le contrat (`contracts.ts`). → **fix 100 % FE**, aucun changement backend.
- RED : test Jest `ranks by lastMessageAt` → `Expected "active", Received "stale"`. GREEN : 5/5 Jest, `tsc` 0, eslint 0.
- ⚠️ Reste à confirmer en repro live qu'il ne subsiste pas un 2ᵉ effet de **rendu** (session dont les seuls messages sont des refus guard QA-01 filtrés par `useSessionLoader`).

---

## QA-10 — 🔵 « Partager » dans le tableau de bord : sémantique floue ✅

**Question/Constat** : à quoi sert « Partager » ? Devrait pouvoir partager une conversation précise ?

**Réponse (vérifiée)** :
- `museum-frontend/app/(tabs)/conversations.tsx` (~l.180-205) : `Share.share({ message: t('dashboard.shareMessage'), url: APP_SHARE_URL })` → **partage générique de promo de l'app** (texte d'invitation + lien store/site). Ne partage **ni** le tableau de bord **ni** une conversation. L'intuition de Tim est correcte.
- **Aucun share par conversation** n'existe (ni bouton dans l'écran chat, ni deeplink conversation, ni export transcript, ni endpoint backend de transcript public). Les deeplinks `musaium://` ne couvrent que auth magic-link + contexte musée/œuvre.

**Recommandations** :
- **Court terme (copy)** : renommer « Partager » → « Partager l'app » / « Inviter un ami » pour lever l'ambiguïté.
- **Si share par conversation voulu (décision produit)** : ajouter un bouton dans l'écran chat. Le plus simple/GDPR-safe = **partage texte du transcript côté client** (l'user partage son propre contenu). Un lien public partageable = feature lourde (token backend + revue privacy, conversations = PII).

---

## QA-08 — 🟠 Œuvre du jour : carte mal centrée + fun-fact en anglais 🔶

**Symptôme** (Image #10) : carte « ŒUVRE DU JOUR » (Mona Lisa). Le fun-fact « Le saviez-vous ? » est **en anglais** (*« The Mona Lisa has her own mailbox at the Louvre… »*) alors que l'UI est en FR. + carte/texte pas bien centrés.

**Diagnostic** : 🔶 à confirmer. Hypothèse : le catalogue daily-art (`museum-backend/.../daily-art/.../artworks.data.ts`) n'a le `funFact`/`didYouKnow` qu'en anglais → pas de version FR localisée. Centrage = layout carte. _Vérif en cours._

---

## QA-09 — 🟠 « Reprendre votre dernière conversation » → conversation vierge 🔶

**Symptôme** : le bouton « Reprendre votre dernière conversation » ouvre une **conversation vierge**, pas la dernière.

**Diagnostic** : 🔶 à confirmer. Hypothèse : le handler crée une nouvelle session ou navigue vers le mauvais `sessionId` (ne résout pas la dernière session existante). _Vérif en cours._

---

## QA-10 — 🔵 « Partager » dans le tableau de bord : sémantique floue 🔶

**Symptôme/Question** : à quoi sert « Partager » dans le tableau de bord ? Partage tout le tableau de bord ? Tim suggère que ça devrait pouvoir partager **une conversation en particulier**.

**Diagnostic** : 🔶 à localiser (handler share du dashboard). Question produit + possible re-scope vers share par conversation. _Vérif en cours._

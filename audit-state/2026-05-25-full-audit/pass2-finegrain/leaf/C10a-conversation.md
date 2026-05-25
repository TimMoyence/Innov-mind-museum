# C10a — Feature CONVERSATION (liste/historique sessions) — Audit E2E

**Scope** : flux liste→affichage→reprise→suppression de la feature `conversation`.
**HEAD** : `1fb32f5ba` (dev). Méthode : gitnexus list + grep + Read. READ-ONLY.

---

## 1. Topologie du flux (E2E vérifié)

### Frontend
| Couche | Fichier | Rôle |
|---|---|---|
| Écran | `museum-frontend/app/(tabs)/conversations.tsx` | Compose tout : data, actions, bulk, FlashList, swipe-delete, search, sort |
| UI item | `museum-frontend/features/conversation/ui/ConversationItem.tsx` | Carte memoizée, push vers chat, long-press save |
| UI swipe | `museum-frontend/features/conversation/ui/SwipeableConversationCard.tsx` | Swipe-left → bouton delete (ReanimatedSwipeable) |
| UI autres | `ConversationsHeader.tsx`, `ConversationsBulkBar.tsx`, `ConversationSearchBar.tsx` | header / bulk-bar / search |
| Data | `museum-frontend/features/conversation/application/useConversationsData.ts` | fetch + pagination cursor (`loadDashboard`/`loadMore`) |
| Actions | `useConversationsActions.ts` | sort/filter/share/save/delete (single + bulk) |
| Bulk | `useConversationsBulkMode.ts` | edit-mode, sélection, select-all |
| Store | `infrastructure/conversationsStore.ts` | zustand persist (savedSessionIds + sortMode persistés ; items transients) |
| Resume banner | `museum-frontend/features/chat/application/useResumableSession.ts` | bannière reprise (≠ écran liste, monté sur home) |
| API | `museum-frontend/features/chat/infrastructure/chatApi/metadata.ts` | `listSessions` / `deleteSessionIfEmpty` / `getSession` |
| Mapper | `museum-frontend/features/chat/domain/dashboard-session.ts` | DTO → `DashboardSessionCard` |
| Contrats | `museum-frontend/features/chat/domain/contracts.ts` | type-guards runtime DTO |

### Backend
| Couche | Fichier:ligne | Rôle |
|---|---|---|
| Route | `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-session.route.ts:122` | `GET /sessions` (list), `:130` GET `:id`, `:132` DELETE `:id` |
| Use-case | `museum-backend/src/modules/chat/useCase/session/chat-session.service.ts:217` | `listSessions`, `:278` `deleteSessionIfEmpty`, `:170` `getSession` |
| Accès | `museum-backend/src/modules/chat/useCase/session/session-access.ts:32` | `ensureSessionOwnership` (SEC-19), `:50` `ensureSessionAccess` |
| Repo | `museum-backend/src/modules/chat/adapters/secondary/persistence/chat.repository.typeorm.ts:273` | `listSessions` (cursor), `:120` `deleteSessionIfEmpty` (tx) |

---

## 2. Critères d'audit

### 2.1 Flux liste→affichage→reprise→suppression COMPLET ? — **OUI**

- **Liste** : `useConversationsData.loadDashboard` (`useConversationsData.ts:28-53`) → `chatApi.listSessions({limit:20})` → `mapSessionsToDashboardCards` → `setItems`. Pagination via `loadMore` (`:55-72`) wiré sur `onEndReached` (`conversations.tsx:263`).
- **Affichage** : FlashList `conversations.tsx:248`, rows typés (`sticky`/`session`/`skeleton`/`empty`), skeletons pendant `isLoading`, empty-state, ErrorState inline.
- **Reprise** : `ConversationItem.tsx:52` `router.push('/(stack)/chat/${item.id}')` → route `app/(stack)/chat/[sessionId].tsx:58` lit `params.sessionId` → `useChatSession(sessionId)` (`:100`). Param name match (`[sessionId]` ↔ `sessionId`). **Correct.**
- **Suppression** : swipe single (`useConversationsActions.ts:73-97`) + bulk (`:99-131`), confirm Alert puis `chatApi.deleteSessionIfEmpty` + `removeItems`. **Voir 2.4.**

### 2.2 RTL border bug `SwipeableConversationCard.tsx:121-122` — **CONFIRMÉ comme écart de convention, MAIS non-flaggé par l'audit RTL, et impact visuel ~nul**

`SwipeableConversationCard.tsx:121-122` :
```
borderTopRightRadius: semantic.card.paddingLarge,
borderBottomRightRadius: semantic.card.paddingLarge,
```
- **Écart vs CLAUDE.md** : la doctrine RTL exige `borderStart/EndRadius` (logique) plutôt que physique `Right`. Ici c'est physique → en RTL (arabe), le swipe vient de la gauche et le bouton delete devrait avoir ses coins arrondis du côté logique opposé. Coins physiques `Right` non-mirrorés.
- **MAIS** : l'audit automatique `__tests__/rtl/_rtl-style-audit.ts:22-31` (`PHYSICAL_KEYS`) ne liste QUE `marginLeft/Right`, `paddingLeft/Right`, `borderLeft/RightWidth/Color`, positional `left/right`, `textAlign`. **`borderTopRightRadius`/`borderBottomRightRadius` NE SONT PAS dans la liste** → le sentinel ne flag pas, aucun test ne casse. (Pattern identique non-flaggé sur 6+ autres fichiers : `ImageCompareCard.tsx:120-121`, `SourceCitation.tsx:158-159`, `BottomSheetContainer.tsx:357-358`, etc. — `borderTopLeftRadius`+`borderTopRightRadius` ensemble = top symétrique.)
- **Impact réel** : le `width: space['20']` du delete-action est un carré derrière la carte ; la carte wrappée (`ConversationItem.tsx:105`) utilise `borderRadius` symétrique. Les radius `Right` sur l'action sont cosmétiques (coin droit du bouton révélé). En RTL le swipe direction est aussi un sujet RNGH non couvert ici. **Severité : LOW** — écart de convention cosmétique, pas un bug fonctionnel, invisible à l'audit. Fix propre = `borderStartEndRadius`/`borderEndEndRadius` ou ajouter ces clés à `PHYSICAL_KEYS` du sentinel.

### 2.3 `listSessions` paginé/scopé userId ? — **OUI, robuste**

- **Scopé userId** : route `chat-session.route.ts:122-128` exige `requireUser(req)`, passe `user.id` à `service.listSessions(query, user.id)`. Service `chat-session.service.ts:218-220` rejette `badRequest('Authenticated user id is required')` si userId absent/invalide. Repo `chat.repository.typeorm.ts:277` `.where('session."userId" = :userId')`. **Pas de fuite cross-user.**
- **Paginé** : cursor keyset stable `chat.repository.typeorm.ts:278-293` (`orderBy updatedAt DESC, id DESC` + `take(limit+1)` + tie-break `(updatedAt < cursor OR (= AND id < cursorId))`). `hasMore`/`nextCursor` corrects (`:296-304`). Cursor validé `chat-session.service.ts:223` (`isValidSessionListCursor`). limit clampé `[1,50]` (`:228`, repo `:274`).
- **Cache** : key `sessions:user:${userId}:${cursor}:${limit}` (`:229`), TTL `listTtlSeconds ?? 300`, invalidé par prefix au create/delete (`:107`, `:289`).

### 2.4 Resumable session correct ? — **OUI (avec note ordering)**

`useResumableSession.ts` : fetch `limit:10` une fois au mount, filtre `messageCount>0 && age<7j` (`pickResumable:66-77`), pick max-by-updatedAt **côté client** (commentaire `:65` « ne suppose pas l'ordre BE » — correct, défensif). Dismiss 24h via storage (`:171-181`, optimiste). Cancellation via `cancelledRef` post-await (pattern closure-cell). Tolère échecs API/storage silencieusement. `deriveLastArtworkTitle` (`chat-session.service.ts:37-52`) guarde le jsonb nullable (typeof). **Correct.** Note : c'est une feature `chat` montée hors écran liste — pas une « reprise » depuis la liste elle-même (celle-là = tap carte 2.1).

### 2.5 Swipe-delete confirme + persiste ? — **OUI, avec subtilité best-effort**

- **Confirme** : `SwipeableConversationCard.tsx:81-85` `handleDelete` (haptic + close) → `onDelete` → `ConversationItem.tsx:94` `confirmDeleteSingle(item.id)` → Alert destructive (`useConversationsActions.ts:85-97`). Bulk idem `:113-131`.
- **Persiste** : `deleteSession` (`:73-83`) appelle `chatApi.deleteSessionIfEmpty` PUIS `removeItems` **inconditionnellement** (catch silencieux). BE `deleteSessionIfEmpty` (`chat.repository.typeorm.ts:120-145`) **ne supprime QUE si messageCount===0** (transaction). 
  - **ÉCART SÉMANTIQUE (NOTÉ, by-design mais piégeux)** : pour une session AVEC messages, le BE renvoie `deleted:false` (pas supprimée en DB), MAIS le FE retire quand même la carte de la liste (`removeItems`). Après refresh/`loadDashboard`, la session **réapparaît**. Le nommage `deleteSessionIfEmpty` + le contrat best-effort est cohérent côté code, mais l'UX « je swipe-delete une conversation pleine, elle revient au refresh » est un piège produit. **Severité : MEDIUM (UX)** — pas un crash, pas une fuite, mais comportement contre-intuitif. `useConversationsActions.ts:76-79` commentaire « remove from UI regardless ».
- **Scopé** : DELETE route exige `isAuthenticated` + `ensureSessionAccess` (ownership SEC-19) avant suppression (`chat-session.service.ts:282`). Pas de cross-user delete.

### 2.6 Coverage Maestro/test ? — **Jest fort, Maestro partiel**

- **Jest (FE)** : très bien couvert — `__tests__/screens/conversations.test.tsx`, `components/{ConversationsScreen,ConversationsHeader,ConversationSearchBar,SwipeableConversationCard,ConversationsBulkBar,ConversationResumptionBanner,SkeletonConversationCard}.test.tsx`, `hooks/{useConversationsBulkMode,useConversationsData,useConversationsActions}.test.ts`, `infrastructure/conversationsStore.test.ts`, `features/chat/useResumableSession.test.tsx`.
- **Maestro (E2E)** : 
  - `conversations.tsx` est **grandfathered** dans `.maestro/coverage-baseline.json:15` (écran pré-UFR-021).
  - **Happy path "Start New Conversation" COUVERT** : `.maestro/nav-stack-deep-links.yaml:107-124` tap Dashboard → "Start New Conversation" → send-button (création + nav chat).
  - **NON COUVERT par Maestro** : (a) **swipe-to-delete** (single/bulk), (b) **reprise par tap sur une carte de liste** (le deep-link teste create, pas resume-from-list), (c) **swipe RTL**. `nav-tabs-roundtrip.yaml:48` ne fait que round-trip le tab (titre).
  - **GAP UFR-021** : l'écran liste est grandfathered, donc pas de violation du sentinel `screen-test-coverage`, mais le happy-path critique « reprendre une conversation existante » et « supprimer par swipe » n'ont pas de flow tap-through. Risque type DOB-2026-05-17 (Jest mocke l'interaction qui casse).

---

## 3. Ruptures / risques (path:line)

| # | Sévérité | Path:line | Description |
|---|---|---|---|
| R1 | MEDIUM (UX) | `useConversationsActions.ts:76-83` + `chat.repository.typeorm.ts:138-140` | Swipe-delete d'une session NON-vide : BE renvoie `deleted:false`, FE retire la carte quand même → réapparaît au refresh. Best-effort by-design mais contre-intuitif. |
| R2 | LOW (RTL/cosmétique) | `SwipeableConversationCard.tsx:121-122` | `borderTop/BottomRightRadius` physique au lieu de logique. Non-flaggé par `_rtl-style-audit.ts:22-31` (radius absents de PHYSICAL_KEYS). Impact visuel quasi-nul. |
| R3 | LOW (E2E gap) | `.maestro/coverage-baseline.json:15` | Pas de Maestro flow pour swipe-delete ni reprise-par-tap (grandfathered, donc toléré). Create couvert. |

**Aucune** rupture de flux fonctionnel, aucune fuite cross-user, pagination/scoping/ownership solides.

---

## 4. Santé E2E : 8.5/10

Flux complet, scoping userId rigoureux (3 couches : route/service/repo), pagination keyset propre, resumable défensif, Jest exhaustif. Pénalités : R1 (incohérence delete best-effort UX), R3 (gap Maestro swipe/resume), R2 (RTL cosmétique non-flaggé).

# C7 — REVIEW (NPS) + SUPPORT E2E trace

Branch `dev` @ `89852f2a1`. READ-ONLY architect (UFR-022). Toutes les claims = `path:line` vérifié (Read/Grep), sauf mention « supposé ».

---

## 1. REVIEW (NPS) — entrée → data

```
[Mobile review screen]
app/(stack)/reviews.tsx
  rating useState(0)   :49     ← StarRating interactive, 1-5 SEULEMENT
  userName useState    :51     ← input texte requis (:68 guard, :183 disabled)
  StarRating onRatingChange=setRating :127  → features/review/ui/StarRating.tsx
        [1,2,3,4,5].map   :31   accessibilityValue {min:1,max:5}  :29  → cap 5
  onSubmit :67 → submitReview(rating, comment, userName)  :69
        │
        ▼
features/review/application/useReviews.ts
  submitReview(rating, comment, userName)  :93-120
  reviewApi.submitReview(rating, comment, userName)  :98
  catch: err.message.includes('409') → 'already_reviewed'  :110-113   ⚠ DEAD
        │
        ▼
features/review/infrastructure/reviewApi.ts
  POST /api/reviews  body {rating, comment, userName}  :32-36   ⚠ userName GHOST
        │
        ▼ HTTP
museum-backend modules/review/adapters/primary/http/routes/review.route.ts
  POST /  isAuthenticated + validateBody(createReviewSchema)  :43-46
  const { rating, comment } = req.body   :50     ← userName JAMAIS lu (drop silencieux)
  author = resolveAuthor(authedUser.id)  :55     ← nom dérivé JWT, pas du body (:41 SEC)
  createReviewUseCase.execute({ user, rating, comment, museumId: authedUser.museumId ?? null })  :63-68
        │
        ▼
useCase/public/createReview.useCase.ts
  rating 0-10 guard  :48          ← NPS range OK
  derivedName = buildReviewDisplayName(user)  :57  ("Firstname L.", :29-35)
  createInput.museumId si non-null  :68-70
        │
        ▼
adapters/secondary/pg/review.repository.pg.ts
  createReview → repo.save({userId, userName, rating, comment, museumId})  :35-44
        │
        ▼ TABLE reviews
domain/review/review.entity.ts : userName varchar(128) :18-19, rating smallint :21,
  status default 'pending' :27-28, museum_id integer NULL FK :38-40
migration 1779401558315-AddMuseumIdToReviews : museum_id + FK ON DELETE SET NULL + partial idx  :40-50
migration 1774543500000-CreateReviewsTable : AUCUN unique constraint  (:14-22, pas de UQ)
```

### Lecture publique / stats
- `GET /api/reviews` → listApprovedReviewsUseCase (status='approved', PAS de museumId) `listApprovedReviews.useCase.ts:19-24`
- `GET /api/reviews/stats` → getReviewStatsUseCase → `getAverageRating()` = AVG+COUNT **global** `getReviewStats.useCase.ts:13`, repo `:134-146`. **PAS** de NPS, PAS de scope museum.

### NPS aggregate (data layer présent, jamais branché)
- `aggregateNps(museumId)` SQL FILTER promoters 9-10 / passives 7-8 / detractors 0-6 + formule `%prom-%detr` `review.repository.pg.ts:88-107` ✅ correct
- `findByMuseum(museumId)` scope par tenant `:71-80`
- **ZÉRO caller** : grep `aggregateNps`/`findByMuseum` → uniquement def repo + interface (`review.repository.interface.ts:42,35`). Aucun useCase, aucune route, aucun web admin. → **DEAD CODE**.

---

## 2. SUPPORT (tickets / contact) — entrée → data

```
[Web contact]  museum-web/.../support/ContactForm.tsx
  fetch('/api/support/contact')  :25  (POST, rate-limited 5/10min byIp)
        ▼
modules/support/.../routes/support.route.ts
  POST /contact  :31  → submitSupportContactUseCase (email best-effort, PAS de ticket persistant)

[Mobile create ticket]  app/(stack)/create-ticket.tsx
  ticketApi.createTicket(body)  :59
        ▼ features/support/infrastructure/ticketApi.ts
  POST /api/support/tickets  body {subject, description, priority?, category?}  :55-60
        ▼
support.route.ts POST /tickets  isAuthenticated + validateBody  :55-58
  createTicketUseCase.execute({ userId, subject, description, priority, category,
        museumId: req.user?.museumId ?? null  :76,  ip, requestId })  :67-79  ← tenant scope threadé ✅
        ▼ useCase/ticket-user/createTicket.useCase.ts
        ▼ adapters/secondary/pg/support.repository.pg.ts  museumId persisté :64
        ▼ TABLE support_tickets  museum_id integer NULL FK (migration 1779401558316 :29-39)

[Mobile list/detail]
  GET /tickets       :85  → listUserTicketsUseCase (scope userId)  :97-103
  GET /tickets/:id   :109 → getTicketDetailUseCase (userId + userRole guard)  :112-116
  POST /tickets/:id/messages  :121 → addTicketMessageUseCase (senderId + senderRole)  :130-135
        ▼ TABLE ticket_messages (ticketMessage.entity.ts)
```

---

## 3. ADMIN moderation (web + BE RBAC)

```
museum-web/.../admin/reviews/page.tsx   useFetchData → GET /api/admin/reviews   (refetch :60)
museum-web/.../admin/tickets/page.tsx   GET /api/admin/tickets                  (refetch :73)
museum-web/.../admin/layout.tsx         AUCUN role guard front (:1-19) — RBAC = serveur seul
        ▼
modules/admin/.../routes/admin.route.ts
  GET  /reviews        requireRole('admin','moderator')  :419-422   → adminReviewFacade.list  :427
  PATCH/reviews/:id    requireRole('admin','moderator')  :437-441   → moderateReview  :452
  GET  /tickets        requireRole('admin','moderator')  :372-374   → adminSupportFacade.list  :379
  GET  /tickets/:id    requireRole('admin','moderator')  :391-393
  PATCH/tickets/:id    requireRole(...) → updateTicketStatus
        ▼ facades : admin-review.facade.ts:17-22 / admin-support.facade.ts:17-22  (pass-through, PAS de museumId)
        ▼ listAllReviews.useCase.ts:30-33  filters SANS museumId   ← scope read NON appliqué
        ▼ listAllTickets.useCase.ts:35-39  filters SANS museumId    ← scope read NON appliqué
```

CSV export : `admin-export.route.ts:125 requireRole('admin','museum_manager')` mais
`:154-157` — reviews/tickets export hard-locked `super_admin` only, commentaire « reviews + tickets lack museum_id » **STALE/FAUX** (museum_id ajouté par #295).

---

## ✅ Solide
- Review submit→persist→moderate chemine bout-en-bout : POST→useCase→repo→table, moderation PATCH + audit (`moderateReview.useCase.ts:78-89` AUDIT_ADMIN_REVIEW_MODERATED) + email notif best-effort opt-in (`:96-129`). ✅
- userName anti-spoofing : dérivé JWT server-side, jamais du body (`review.route.ts:41,50-55` + `createReview.useCase.ts:57`). Sécurité ✅.
- NPS 0-10 validé 2 couches : Zod `createReviewSchema.rating.min(0).max(10)` `review.schemas.ts:19` + useCase guard `createReview.useCase.ts:48`. ✅
- museum_id colonne + FK ON DELETE SET NULL + partial index, reviews & support_tickets (migrations 1779401558315/316). Back-compat NULL nullable. ✅
- Tenant scope **write** threadé : review.route.ts:67 + support.route.ts:76 (museumId ← JWT claim). ✅
- Support repo SAIT filtrer par museumId (`support.repository.pg.ts:102-103`, `ListTicketsFilters.museumId support.types.ts:20`). Review repo idem (`review.repository.pg.ts:57-58`). ✅ (plomberie présente)
- Ticket detail/message ownership guard (userId + userRole) `support.route.ts:112-116,130-135`. ✅

## ⚠️ Faible / rupture
- **[HAUTE] NPS aggregate = DEAD CODE.** `aggregateNps()` `review.repository.pg.ts:88-107` + `findByMuseum() :71-80` : ZÉRO caller (grep exhaustif BE/web/FE). KR2 « NPS true 0-10 per-museum » = **descopé de facto** : data layer existe, aucun endpoint/useCase/UI ne l'expose. Public `/stats` = AVG global (`getReviewStats.useCase.ts:13`), pas NPS, pas per-museum.
- **[HAUTE] NPS 0-10 inatteignable côté mobile.** `StarRating.tsx:31` boucle `[1,2,3,4,5]`, `accessibilityValue max:5` `:29`. UI plafonne à 5. Aucun écran ne produit rating 6-10 → buckets promoters(9-10)/passives(7-8) **toujours vides** depuis l'app. NPS calculé sur data qui ne peut pas dépasser 5 = toujours -100% côté mobile.
- **[HAUTE] Scope read admin NON appliqué.** `listAllReviews.useCase.ts:30-33` + `listAllTickets.useCase.ts:35-39` ne settent jamais `filters.museumId` ; facades pass-through ; routes ne passent pas de museumId. → admin/moderator voient TOUS les tenants en lecture. BOLA-adjacent (mais pas exploitable par museum_manager, cf. ci-dessous).
- **[MOYENNE] `museum_manager` 403 sur toute la modération.** `/admin/reviews` `:422`, `/admin/reviews/:id` `:440`, `/admin/tickets` `:374`, `/admin/tickets/:id` `:393` = `requireRole('admin','moderator')` — museum_manager **absent** de l'allow-list. Le rôle n'a accès qu'aux stats analytics (`:249`) + export (`:125`, mais reviews/tickets re-bloqués super_admin `:155`). → un museum_manager ne peut PAS modérer ses propres reviews/tickets.
- **[MOYENNE] Ghost field `userName`.** FE `reviews.tsx:51,68,183` le collecte + le rend OBLIGATOIRE (bouton disabled si vide), `useReviews.ts:17,94,98` le transmet, `reviewApi.ts:35` l'envoie ; BE `review.route.ts:50` ne le lit jamais (drop silencieux). User tape un nom qui n'est jamais persisté → friction UX inutile + confusion (nom affiché = dérivé JWT, pas celui tapé). TOUJOURS PRÉSENT.
- **[MOYENNE] Dead branch 409 `already_reviewed`.** `useReviews.ts:110-113` map err 409 → 'already_reviewed'. Aucun 409 / unique constraint côté BE (grep review module = 0 ; `CreateReviewsTable.ts:14-22` sans UQ ; `Check.ts` sans UQ_reviews). Branche morte. TOUJOURS PRÉSENTE.
- **[BASSE] Commentaire export stale/faux.** `admin-export.route.ts:154` « reviews + tickets lack museum_id » contredit migrations #295. Lock super_admin `:155` désormais arbitraire vs intention (UFR-013 honnêteté doc).
- **[BASSE] `updateTicketStatus.useCase.ts`** : aucune vérif museumId/scope (grep = 0). Non exploitable museum_manager (403 en amont), mais si le rôle était un jour ajouté à l'allow-list, write cross-tenant possible.

## 🔧 Gaps E2E
1. KR2 NPS per-museum : exposer `aggregateNps` via route admin (`/admin/reviews/nps?museumId` ou facade) + brancher museum_manager scope, OU enterrer `aggregateNps`/`findByMuseum` (UFR-016) si descopé V1. Actuellement entre-deux malhonnête (code écrit, jamais câblé).
2. NPS UI : `StarRating` 1-5 incompatible avec capture 0-10. Soit composant NPS 0-10 dédié, soit accepter que le 0-10 BE ne sert que data legacy/seed (clarifier intention).
3. Scope read admin : thread `museumId` dans `listAllReviews`/`listAllTickets` + facades + routes (forcer JWT claim pour museum_manager comme `admin.route.ts:257` le fait déjà pour les stats).
4. RBAC moderation : ajouter `museum_manager` aux allow-lists `/admin/reviews*` + `/admin/tickets*` (sinon B2B « opérateur modère son tenant » impossible) — OU acter que la modération reste centralisée admin V1.
5. Nettoyer ghost `userName` (FE) + dead branch 409 (FE) + commentaire export stale (BE).
6. Export reviews/tickets : aligner le gate `:155` sur la réalité museum_id (autoriser museum_manager scopé) ou corriger le commentaire.

---
### Verdict synthèse
Submit→persist→moderate **fonctionnel** pour le chemin centralisé (admin/moderator). Multi-tenant B2B (KR2) = **plomberie data présente mais non câblée** (NPS dead code + scope read non appliqué + museum_manager exclu de la modération). Mobile ne peut pas produire de note NPS 0-10. Plusieurs résidus FE (ghost userName, dead 409) + 1 commentaire BE stale.

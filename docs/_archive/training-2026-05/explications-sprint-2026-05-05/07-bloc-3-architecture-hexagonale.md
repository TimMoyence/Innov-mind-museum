# 07 — Bloc 3 : architecture hexagonale + import discipline + god-files

> **Pour qui ?** Toi, qui veux comprendre pourquoi 246 fichiers du module chat ont été déplacés en un seul commit, ce que ça apporte, et ce que ça change pour ta lecture quotidienne du code.
> **Durée de lecture :** ~12 minutes.

---

## Pourquoi "hexagonal" ?

L'architecture hexagonale (aussi appelée "Ports & Adapters", popularisée par Alistair Cockburn en 2005) part d'un constat simple : **le cœur métier de ton application ne devrait pas savoir si tu utilises Postgres, Express, Redis ou n'importe quoi d'autre**. Ces "trucs" sont des détails d'implémentation qu'on doit pouvoir remplacer sans toucher au métier.

### Analogie

Une cafetière. Le mécanisme de percolation (le métier) ne sait pas si tu utilises de l'eau du robinet, de l'eau Volvic, ou de l'eau filtrée. Tu peux changer la source d'eau (l'adapter d'entrée) sans changer le percolateur. Pareil pour la sortie : tu peux verser dans une tasse, un mug, ou un thermos.

Le percolateur définit deux **ports** : "eau qui entre" et "café qui sort". Les adapters branchent ces ports à du concret.

### En code

- **Domain** = le percolateur. Tes entités métier (User, ChatSession, Museum…) + les **ports** (interfaces abstraites de ce dont le métier a besoin).
- **useCase** = les "recettes" (préparer un latte, un espresso…). Une couche au-dessus du domain qui orchestre les entities et appelle les ports sans savoir qui les implémente.
- **Adapters** = les bouts concrets. Un adapter Postgres qui implémente `ChatRepository`. Un adapter Express qui appelle `chatService.postMessage`. Un adapter S3 qui implémente `ImageStorage`.

---

## Ce qu'il y avait avant le sprint

Le code était déjà découpé en modules (auth, chat, museum…) mais **chaque module faisait son propre layout interne**. Certains avaient un `controllers/` + `services/` + `repositories/` (style Spring), d'autres avaient un `routes/` + `models/` + `db/`, d'autres avaient tout en flat à la racine. Inconsistant. Quand tu ouvrais un module pour la première fois, il fallait 5 minutes pour comprendre où chercher.

### Symptômes concrets

- Un dev qui voulait ajouter un endpoint à `chat` devait fouiller `routes/`, `services/`, `controllers/` pour deviner où poser sa logique.
- Les tests d'intégration mockaient parfois la DB, parfois l'orchestrateur LLM, parfois les deux — sans règle claire.
- Le module `chat` était devenu un "fourre-tout" avec 246 fichiers à la racine de subgroups inconsistants.

---

## Ce qu'on a fait dans le sprint

### Le layout canonique (3 couches × subgroups)

Chaque module BE a maintenant exactement la même squelette :

```
modules/<module>/
├── domain/
│   ├── <aggregate>/             ← entities + repository interface par aggregate
│   ├── ports/                   ← interfaces de ports outbound
│   └── <module>.types.ts        ← types partagés cross-aggregate
├── useCase/
│   ├── <capability>/            ← un dossier par capability métier
│   └── index.ts                 ← (optionnel) barrel public
├── adapters/
│   ├── primary/http/
│   │   ├── routes/              ← un fichier par groupe d'endpoints
│   │   ├── schemas/             ← validation zod request/response
│   │   ├── helpers/             ← cookies, sse, route plumbing
│   │   └── <module>.contracts.ts ← DTO publics
│   └── secondary/
│       ├── pg/                  ← repos TypeORM
│       ├── notifier/, social/, search/, storage/, …
│       └── …                    ← catégorie par concern externe
├── jobs/                        ← (optionnel) BullMQ workers / crons
├── <module>-module.ts           ← (composition root pattern)
├── wiring.ts                    ← accessors lazy runtime
└── index.ts                     ← barrel lifecycle public
```

### Exemple concret : le module chat avant/après

**Avant :**
- 246 fichiers répartis dans des dossiers improvisés.
- Difficile de répondre à "où est la logique de transcription audio ?" sans grep.

**Après** (`museum-backend/src/modules/chat/`) :

```
domain/
├── art-keyword/    ← entité art_keywords + repo interface
├── memory/         ← entité user_memories + repo interface
├── message/        ← entité chat_message + repo interface
├── session/        ← entité chat_session + repo interface
├── voice/          ← types voix TTS
├── ports/          ← interfaces des dépendances externes (LLM, image, audio…)
└── chat.types.ts   ← types partagés inter-aggregate

useCase/
├── audio/          ← STT + TTS use cases
├── describe/       ← describe-artwork use case
├── enrichment/     ← knowledge-base + web-search enrichment
├── guardrail/      ← keyword + judge LLM evaluation
├── image/          ← upload + processing image
├── knowledge/      ← extraction post-message
├── llm/            ← prompt building + cache
├── location/       ← in-museum vs city resolution
├── memory/         ← UserMemory merge logic
├── message/        ← post-message orchestration
├── orchestration/  ← chat.service (top-level)
├── retention/      ← prune anciennes données
├── session/        ← create/get session
└── web-search/     ← Brave wrapper

adapters/
├── primary/http/
│   ├── routes/     ← un fichier par groupe (chat.route, walk.route…)
│   ├── schemas/    ← zod schemas
│   ├── helpers/    ← SSE plumbing, cookie helpers
│   └── chat.contracts.ts
└── secondary/
    ├── persistence/ ← TypeORM repos
    ├── llm/        ← langchain.orchestrator + tracing
    ├── search/     ← Brave client
    ├── storage/    ← S3 + local stub
    ├── audio/      ← OpenAI transcribe + TTS
    ├── image/      ← upload pipeline
    ├── pii/        ← Presidio wrapper
    └── guardrails/ ← llm-guard adapter

jobs/               ← BullMQ workers
chat-module.ts      ← composition root (DI graph)
wiring.ts           ← lazy runtime accessors
index.ts            ← public lifecycle barrel
```

Maintenant si tu cherches "la logique de transcription audio", tu sais : c'est dans `useCase/audio/`. Si tu cherches "le client OpenAI Whisper", c'est dans `adapters/secondary/audio/`. **Plus jamais de grep sauvage.**

### Les deux patterns de composition

Le sprint a formalisé deux façons d'assembler la DI (qui crée qui) :

**Pattern A — Barrel** (utilisé par `admin`, `auth`, `museum`, `review`, `support`) : `useCase/index.ts` re-exporte les services qui ont besoin d'être consommés ailleurs.

```ts
// modules/auth/useCase/index.ts
export { LoginUseCase } from './session/login.useCase';
export { RegisterUseCase } from './registration/register.useCase';
// etc.
```

**Pattern B — Composition root** (utilisé par `chat`, `knowledge-extraction`) : il n'y a pas de barrel `useCase/index.ts`. À la place, un fichier `<module>-module.ts` construit le graphe DI explicitement :

```ts
// modules/chat/chat-module.ts (ébauche)
export function buildChatModule(deps: ChatModuleDeps): ChatModule {
  const messageRepo = new ChatMessageRepoPg(deps.dataSource);
  const sessionRepo = new ChatSessionRepoPg(deps.dataSource);
  const llmOrchestrator = new LangchainOrchestrator(deps.env);
  const imageStorage = deps.useS3 ? new S3ImageStorage() : new LocalImageStorage();
  // ...
  const chatService = new ChatService({
    messageRepo, sessionRepo, llmOrchestrator, imageStorage, ...
  });
  return { chatService, /* etc. */ };
}
```

**Pourquoi deux patterns ?** Le chat a 14 capabilities et ~30 dependencies. Un barrel d'export deviendrait illisible. Le composition root explicite est plus clair pour les modules complexes.

---

## Import discipline (codemod 154 fichiers)

### Le problème

Avant le sprint, on voyait dans le code :

```ts
import { something } from '../../../../shared/foo';   // 4 niveaux relatifs, illisible
import { other } from '@modules/chat/useCase/orchestration/chat.service';
import { same } from './chat.service';   // l'un OU l'autre selon les fichiers
```

Pas de cohérence. Un dev mettait du relatif `../`, un autre mettait l'alias `@modules/`. Pour les renames, c'était la galère.

### La règle unique

```
Même répertoire        → from './X'
Cross-dir même module  → from '@modules/<m>/<layer>/<sub>/<file>'
Cross-module / shared  → from '@modules/.../X' | '@shared/...' | '@data/...'
4-level relative path  → INTERDIT (use alias)
Self-aliases           → INTERDIT (use './X')
```

Composition layer (`<module>-module.ts`, `wiring.ts`, `jobs/*`) exempt — peut utiliser du relatif vers `adapters/`.

### Le codemod

Un script ast-grep a parcouru 154 fichiers et appliqué automatiquement la règle. Plus jamais de PR refusée pour "tu as utilisé `../../`". Aujourd'hui, ESLint+`eslint --fix` maintient la règle.

### Pourquoi c'est pertinent

**Vélocité de lecture** : quand tu vois `from '@modules/chat/...'`, tu sais que tu changes de zone. Quand tu vois `from './...'`, tu sais que tu restes dans le même dossier. Pas d'ambiguïté.

**Vélocité de refactor** : quand tu déplaces un fichier, l'IDE peut mettre à jour les imports alias en une opération. Avec du relatif `../../../../`, la moindre erreur de chemin = bug.

---

## Barrel-file policy (sources Atlassian +75% builds)

### Le problème

Un "barrel file" est un `index.ts` qui re-exporte tout :

```ts
// modules/chat/useCase/orchestration/index.ts
export * from './chat.service';
export * from './chat.handlers';
export * from './chat.types';
// etc.
```

Pratique pour écrire `import { X } from '@modules/chat/useCase/orchestration'` sans préciser le sous-fichier. **Mais ça pète les builds** : le bundler doit charger TOUT le contenu du barrel pour résoudre l'import même d'un seul nom. Atlassian a publié [un article](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) montrant +75 % builds après suppression des barrels internes.

### La règle Musaium

- **`<module>/index.ts`** garde sa raison d'être : c'est le **barrel public** du module (lifecycle + factory). Reste.
- **`<module>/useCase/index.ts`** existe pour les modules barrel-pattern (admin/auth/museum/review/support). Reste.
- **Tous les autres barrels internes** (`domain/<aggregate>/index.ts`, `adapters/secondary/<category>/index.ts`) : **interdits**. Import direct du fichier.

```ts
// MAUVAIS
import { ChatRepository } from '@modules/chat/domain/session';
// BON
import { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
```

### Pourquoi c'est pertinent

Sur le BE Musaium en croissance, chaque seconde gagnée au build = 50+ secondes gagnées en CI/jour (chaque PR build). Sur 6 mois de dev = ~10 heures de CI économisées.

---

## God-files split (11 fichiers oversized)

### Le problème

Un "god file" est un fichier qui fait trop de choses. Symptômes : >300 LOC, multi-responsibility, impossible à tester unitairement sans mock everything.

### Ce qui a été splitté

| Fichier | LOC pre → post | Comment |
|---------|----------------|---------|
| `langchain.orchestrator.ts` | 671 → 416 | 3 sibling helpers extraits |
| `chatApi.ts` (FE) | 721 → 5 modules + façade | Un module par capability |
| `env.ts` | 554 → 390 | Helpers + resolvers extraits |
| `museum-detail` (FE screen) | 464 → 212 | Composants extraits |
| `chat session` (FE screen) | 483 → 281 | Composants extraits |
| `privacy` (FE screen) | 468 → 268 | Styles + MetaRow extraits |
| `MuseumMapView` | 583 → 299 | Hooks + helpers extraits |
| `web landing page` | 726 → 67 orchestrator + 9 sections | StorySection + 8 autres |
| `authSession.service.ts` | 568 → 227 façade + 3 SRP siblings | `token-jwt.service` + `session-issuer.service` + `mfa-gate.service` |
| `auth.route.ts` | 647 → 24 lignes composing 5 sub-routers | session/profile/password/email/api-keys |
| `overpass.client.ts` | split en 6 modules | Single-responsibility |

### Garantie zero-behavior-change

Chaque split est **vérifié par tests + lint + GitNexus impact analysis**. Le split est purement organisationnel : **aucune logique métier modifiée**.

### Exemple : le split de `authSession.service.ts`

Avant : un fichier de 568 lignes qui faisait :
- Issuance JWT + refresh
- Rotation des refresh tokens
- Vérification MFA gate
- Construction de la session response

Après :
- `authSession.service.ts` (227L) — façade qui appelle les 3 helpers
- `token-jwt.service.ts` (161L) — issuance + verify JWT
- `session-issuer.service.ts` (171L) — création de session + cookies
- `mfa-gate.service.ts` (127L) — évaluation MFA

**Bénéfice** : `session-issuer.service.ts` est maintenant un Stryker hot file (cf. doc 16). Avant le split, on ne pouvait pas le tracker isolément parce qu'il était noyé dans le god file.

### Pourquoi c'est pertinent

**Lecture** : un dev qui débarque sur la rotation refresh token ouvre `session-issuer.service.ts` (171L), comprend en 5 minutes. Avant, il ouvrait 568 lignes dont 70 % n'étaient pas pertinentes.

**Tests** : un test unitaire ciblé sur le MFA gate n'a plus besoin de mocker la JWT issuance + la session construction. Réduit le temps test + le risque de mock-divergence.

---

## Pourquoi c'est pertinent pour Musaium

### Trois bénéfices concrets

1. **Onboarding** : un nouveau dev (ou un agent V12) qui arrive comprend l'organisation en 10 minutes au lieu de 1 jour. Squelette canonique partout.
2. **Refactor safety** : les imports alias + le codemod garantissent que tu peux déplacer/renommer sans casser. GitNexus impact analysis (cf. CLAUDE.md) tracke les call sites.
3. **Test isolation** : domain pur (sans dépendance Express ou TypeORM) → testable sans mock infrastructure.

### Coût du sprint

- ~9 commits chronologiques pour la migration module par module.
- 1 codemod pour les imports.
- 11 splits manuels de god-files.

Total : ~3-4 jours de travail concentré, étalé sur le sprint via parallélisme V12.

---

## Est-ce overkill ?

**Non**, parce qu'on n'aurait pas fait mieux en remettant à plus tard. Trois raisons :

1. **Coût marginal de migration grandit avec la taille du codebase**. À ~30 modules, refactor possible en 4 jours. À ~80 modules dans 1 an, 12 jours.
2. **Les agents V12 paient pour ce sprint dans leur structure**. Spec Kit obligatoire = doc en `spec.md` + `design.md` + `tasks.md`. Si le code n'est pas organisé canoniquement, les agents ne savent pas où poser le code → boucle infernale.
3. **Le coût pour un développeur humain de comprendre un module est divisé par ~3** post-migration. Ratio retour sur investissement excellent.

Le seul cas où ce serait overkill = projet jouet de <5000 LOC. Musaium est à ~80 000 LOC backend, c'est largement au-dessus du seuil.

---

## Ce que ça change pour toi au quotidien

1. **Quand tu lis du code** : utilise le squelette canonique comme map. Cherche dans `domain/<aggregate>/` pour les entities, `useCase/<capability>/` pour la logique, `adapters/secondary/<category>/` pour les intégrations externes.
2. **Quand tu écris un nouveau fichier** : pose-le au bon endroit selon le squelette. ESLint te tape sur les doigts si tu mets un import à 4 niveaux relatifs.
3. **Quand tu vois une PR qui touche `chat-module.ts` ou `wiring.ts`** : c'est de la composition layer, lecture attentive (la DI graph se rejoue à chaque boot).

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Migrer manuellement quelque chose | **Rien à faire**. Tout est mergé. |
| Adopter le squelette pour les nouveaux modules | À faire pour tout nouveau module BE post-launch. |
| Lire le `chat-module.ts` une fois pour comprendre la composition root pattern | Recommandé (~10 min). |
| Référence : `CLAUDE.md` § "Backend — Hexagonal" | Doc canonique. À ré-ouvrir quand tu te poses la question "où je mets ça ?". |

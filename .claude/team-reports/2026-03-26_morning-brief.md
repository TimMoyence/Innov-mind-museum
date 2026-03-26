# 2026-03-26 — Morning Brief

> **Etat: SAIN | Tests: 1088 (0 fail) | Typecheck: 0 errors | L2 | EP ouverts: 1 (mineur) | Maturite: ~4.0/5**

---

## 1. Etat du codebase

### Sante globale

| Indicateur | Valeur | Tendance |
|-----------|--------|----------|
| Backend tests (passed) | 951 | +42 hier |
| Frontend tests (jest+node) | 137 (47+90) | +31 hier |
| Typecheck errors (3 packages) | 0 | stable |
| Coverage stmts (BE) | 66.6% | +0.6pp |
| Coverage branches (BE) | 50.9% | +0.9pp |
| as any (tests) | 0 | maintenu depuis V1.1 |
| OpenAPI paths | 42 (100% routes) | +20 hier |
| Error Patterns ouverts | 1 (EP-004 mineur) | -6 hier |
| Score maturite | ~4.0/5 | +0.48 hier |
| Autonomie | L2 (6/10 vers L3) | promu hier |

### Risques residuels

| Risque | Severite | Impact |
|--------|----------|--------|
| 108 couleurs hardcodees hors theme | MOYEN | Dark mode inconsistent, rebranding difficile |
| 0 component tests frontend | MOYEN | Regressions UI non detectees |
| 0 E2E tests (Detox/Maestro) | MOYEN | Flows critiques valides manuellement |
| Guardrail keyword bypassable (M22) | MOYEN | LLM exploitation par attaquant determine |
| FlatList au lieu de FlashList | FAIBLE | Performance degradee 100+ messages |
| AsyncStorage au lieu de MMKV | FAIBLE | Latence stockage sur appareils bas de gamme |

### Livrables non deployes

- museum-web W1+W2 pret pour VPS deploy (Dockerfile + nginx + CI en place)
- Dependabot + Trivy actifs en CI mais pas encore sur le repo live
- Redis rate-limit configure mais Redis optionnel en dev

---

## 2. Trois taches pretes a lancer

### Tache 1 : Store Submission Polish (PM/produit - URGENT)

**Scope** : Preparer la soumission App Store + Google Play
**Justification** : Le produit est fonctionnellement complet avec les corrections d'hier (ErrorBoundary, i18n, offline). Les screenshots, descriptions et metadata sont les derniers bloquants pour la mise en store.
**Items** :
- Screenshots App Store (6.7", 6.5", 5.5", iPad) — 4 langues minimum (EN, FR, ES, DE)
- App Store description + keywords + What's New
- Google Play Feature Graphic (1024x500)
- Google Play Data Safety form (deja documente)
- Privacy Policy hosted URL (museum-web /privacy ou externe)
**Agents recommandes** : Frontend Architect (screenshots), DevOps (build EAS)
**Taille** : L (1 run)

### Tache 2 : Component Tests + FlashList (technique - URGENT)

**Scope** : Combler les 2 gaps techniques les plus critiques identifies en R8
**Justification** : 0 component tests = 0 couverture du rendu UI. FlatList = performance degradee sur longs chats. Ces 2 items ont le meilleur ratio effort/impact du backlog technique.
**Items** :
- 5 component render tests (ChatMessageList, AuthScreen, WelcomeCard, ErrorBoundary, ConversationsScreen)
- Remplacer FlatList par FlashList dans ChatMessageList + MuseumDirectoryList
- Ajouter `estimatedItemSize` / `getItemLayout`
- React Compiler (babel-plugin-react-compiler) — bonus S
**Agents recommandes** : QA Engineer (tests), Frontend Architect (FlashList + Compiler)
**Taille** : M (1 run)

### Tache 3 : Theme Centralization — Quick Win (impact fort)

**Scope** : Eliminer les 108 couleurs hardcodees et centraliser sur le theme
**Justification** : 108 hex colors dans 31 fichiers. Le systeme de theme existe (22 tokens) mais est bypass. Quick win car chaque fichier est un remplacement mecanique.
**Items** :
- Audit des 108 occurrences (25 features/, 53 app/, 18 shared/ui/, 6 ErrorBoundary)
- Remplacer par `theme.*` tokens via `useTheme()` hook
- Etendre la palette si tokens manquants
- Tester dark mode apres chaque batch
**Agents recommandes** : Frontend Architect
**Taille** : M (1 run)

---

## 3. Audit matinal — Template de prompt

Copier-coller ce prompt pour lancer un audit rapide de l'etat du codebase :

```
/team

Mode: chore (audit matinal)
Taille: S

Mandat: verification rapide post-cloture

1. Verifier les 3 gates :
   - `cd museum-backend && pnpm lint` (tsc --noEmit)
   - `cd museum-backend && pnpm test`
   - `cd museum-frontend && npm test`

2. Verifier que les EP fermes hier sont toujours fermes :
   - EP-007: grep "devDependencies" dans Dockerfile.prod (doit etre absent du runtime stage)
   - EP-009: grep "ErrorBoundary" dans app/_layout.tsx (doit etre present)
   - EP-012: verifier .github/dependabot.yml existe

3. Comparer les metriques avec le morning brief :
   - Tests total >= 1088
   - Coverage stmts >= 66.6%
   - Typecheck errors == 0

4. Rapport: OK / ALERTE avec detail si regression detectee.

Pas de code. Juste verification et rapport.
```

---

## 4. Features livrees hier — Tests manuels

### Flow 1 : Error Boundary (C1)

1. Lancer l'app en mode dev
2. Forcer une erreur JS (ajouter `throw new Error('test')` dans un composant)
3. **Verifier** : ecran de fallback s'affiche (pas un crash blanc)
4. **Verifier** : bouton "Reload" fonctionne
5. Retirer le throw

### Flow 2 : Persistance chat (C2+C3)

1. Ouvrir une conversation et envoyer un message
2. Naviguer vers l'ecran conversations (onglet)
3. Revenir sur la conversation
4. **Verifier** : les messages sont toujours la (pas de re-fetch)
5. Fermer l'app completement (kill)
6. Rouvrir
7. **Verifier** : les sessions recentes sont restaurees depuis le store

### Flow 3 : Offline enqueue + dequeue (M5)

1. Activer le mode avion
2. Envoyer un message dans le chat
3. **Verifier** : message s'affiche en optimistic avec indicateur "pending"
4. Desactiver le mode avion
5. **Verifier** : message envoye et reponse recue (flush automatique)

### Flow 4 : i18n erreurs (M6)

1. Changer la langue de l'app (FR, ES, DE, etc.)
2. Provoquer une erreur reseau (couper le backend)
3. **Verifier** : le message d'erreur s'affiche dans la langue choisie
4. **Verifier** : l'ErrorBoundary affiche aussi dans la bonne langue si crash JS

### Flow 5 : Auto-retry 429 (M7)

1. Envoyer des messages rapidement (>60/min) pour declencher le rate-limit
2. **Verifier** : l'app retente automatiquement apres le delai (pas d'erreur brute)
3. **Verifier** : dans les logs, le retry avec backoff est visible

### Flow 6 : museum-web landing (W1+W2)

1. `cd museum-web && npm run dev`
2. Ouvrir `http://localhost:3000/fr`
3. **Verifier** : 6 sections visibles (hero, how-it-works, features, showcase, testimonials, download)
4. **Verifier** : animations Framer Motion au scroll
5. Basculer `/en` — verifier i18n
6. Aller sur `/fr/admin` — verifier login form
7. Se connecter avec un compte admin
8. **Verifier** : dashboard stats, users table, audit logs table

### Flow 7 : Zod validation auth (R9)

1. Envoyer un POST `/api/auth/register` avec email invalide
2. **Verifier** : erreur 400 structuree (pas 500)
3. Envoyer un POST `/api/auth/login` avec body vide
4. **Verifier** : erreur 400 avec details Zod

### Flow 8 : Zero-downtime deploy (C8)

1. Sur le VPS, `docker compose up -d` avec la nouvelle config
2. **Verifier** : migration run dans conteneur ephemere AVANT restart
3. **Verifier** : 0 downtime pendant le restart (curl en boucle)
4. **Verifier** : healthcheck passe apres restart

---

## Rappels process (R10)

- **AM-002** : Feature Existence Check — verifier si le code existe AVANT d'implementer
- **AM-003** : KB FINALIZE obligatoire — mettre a jour les 7 fichiers KB a chaque fin de run
- **AM-004** : Sprint tracking VERIFIED — checker PROGRESS_TRACKER + SPRINT_LOG dans le SHIP gate
- **PE-008 a PE-011** : 4 nouveaux prompt enrichments a injecter dans les mandats agents

# Error Patterns — Fix Connus

| Pattern | Code | Frequence | Derniere occurrence | Fix connu | Agent concerne |
|---------|------|-----------|---------------------|-----------|----------------|
| Spread args sur fonction sans rest param | TS2556 | 1 | 2026-03-24 S8 | Remplacer `(...args: unknown[]) => fn(...args)` par `() => fn()` | QA Engineer |
| `as any` au lieu de `jest.Mocked<T>` | convention | 3+ | 2026-03-24 V1.1 | `jest.Mocked<InterfacePort>` pour repos injectes, `makeFakeRepo()` factory pour mocks complexes, `as unknown as Type` pour casts explicites | QA Engineer, Backend Architect |
| Double mock module-level + path | jest/mock | 1 | 2026-03-24 S8 | Utiliser injection constructeur ou un seul jest.mock | QA Engineer |
| Import concret adapter dans useCase/application | hexa/import-violation | 8 | 2026-03-24 V1.1 | Creer interface port dans `domain/ports/`, adapter `implements` le port, composition root seul autorise les imports concrets | Backend Architect |
| grep path relatif retourne 0 au lieu du count reel | tooling | 2 | 2026-03-24 | Toujours utiliser `cd /repo/root && grep -r` ou chemin absolu. Le hook rtk peut interferer. | Tech Lead |
| console.* non conditionne __DEV__ en frontend | convention | 4 | 2026-03-24 Phase 0 | Supprimer ou wrapper dans `if (__DEV__)`. Les erreurs non-critiques (logout, token clear) peuvent etre silencieuses. | Tech Lead |
| NSPrivacyCollectedDataTypes vide | apple-review | 1 | 2026-03-24 Phase 0 | Renseigner avec les types reels de donnees collectees. Expo utilise `NSPrivacyCollectedDataType` (pas `...Identifier`). | Frontend Architect |
| devDependencies dans image Docker prod | docker/size | 1 | 2026-03-24 audit | `pnpm install --prod` dans le runtime stage ou prune apres COPY | DevOps Engineer |

# 19 — Bloc 10 : TypeScript strictness FE + BE

> **Pour qui ?** Toi, qui veux comprendre pourquoi 176 fichiers FE ont été modifiés en un seul commit, et pourquoi les `as unknown` casts ont été divisés par 2.
> **Durée de lecture :** ~7 minutes.

---

## Le contexte

Le BE Musaium était déjà strict TypeScript (`strict: true` + `noUncheckedIndexedAccess: true`). Le FE ne l'était pas autant : pas de `noUncheckedIndexedAccess`. Le sprint a aligné le FE.

Et en bonus, on a réduit l'usage des `as unknown as X` casts qui sont des "trous" dans le système de types.

---

## Le problème en deux phrases

**`noUncheckedIndexedAccess: false`** (la valeur par défaut TypeScript) considère que `arr[i]` retourne un `T`. **`true`** considère que ça retourne `T | undefined` (parce que techniquement `arr[5]` peut être `undefined` si l'array a 3 éléments).

C'est plus rigoureux mais **bruyant** : ton code doit gérer le `undefined` partout.

---

## Analogie : le panier de courses

Tu vas chercher la 5ème pomme dans le panier.

- **Sans `noUncheckedIndexedAccess`** : "voilà, c'est une pomme" (le compilateur te ment si le panier est vide).
- **Avec** : "voilà, c'est peut-être une pomme, peut-être rien — vérifie d'abord avant de croquer".

Plus prudent. Tu évites de mordre dans du vide.

---

## Vocabulaire TS

| Terme | Définition |
|-------|------------|
| **`noUncheckedIndexedAccess`** | Compiler option qui force `arr[i]` à être typé `T \| undefined`. |
| **`as unknown as X`** | Double cast forcé qui dit "fais-moi confiance, c'est un X". Trou dans le typage. |
| **Type guard** | Fonction `function isX(v): v is X` qui narrow le type au runtime. |
| **`Strict`** | Set de plusieurs options strict TypeScript activées d'un coup. |

---

## Ce qui a été fait

### FE — `noUncheckedIndexedAccess: true`

Activé dans `museum-frontend/tsconfig.json`. Conséquence : 176 sites de code se sont mis à râler. Le sprint a fixé chacun avec **des guards explicites**, pas des `as` cast shortcuts.

Patterns de fix typiques :

```ts
// AVANT
const first = items[0].name;

// APRÈS — guard explicite
const first = items[0]?.name;   // optional chaining
// OU
const first = items[0];
if (first) {
  doSomething(first.name);
}
```

```ts
// AVANT
const value = obj[key];
return value.toUpperCase();

// APRÈS
const value = obj[key];
if (value === undefined) throw new Error(`missing key ${key}`);
return value.toUpperCase();
```

### Drop des 60 ESLint warnings

Activer `noUncheckedIndexedAccess` a aussi déclenché 60 warnings ESLint (rules type `@typescript-eslint/no-unnecessary-condition` qui voient maintenant des chaînes `?.` "inutiles" dans certains contextes). Commit `b8243d69e` a clean ces warnings en parallèle.

### BE — `as unknown` casts narrowés (12 → 6)

Audit du codebase BE : 12 occurrences de `as unknown as X`. Le sprint en a éliminé 6 en réécrivant les passages en type guards proper. Les 6 restants sont **intentionnels** (trust boundaries : payloads JWT décodés, raw DB rows pré-validation Zod) — ils ont chacun un commentaire `eslint-disable -- justification` (cf. CLAUDE.md ESLint discipline).

### FE — `as unknown` casts narrowés (6 → 2 en production tree)

Pareil côté frontend. Les 2 restants sont aussi documented + justifiés.

---

## Pourquoi `noUncheckedIndexedAccess` ?

### Bug typique attrapé

```ts
function getPriceForCurrency(prices: Record<string, number>, currency: string): number {
  return prices[currency];  // ← TypeScript dit "number", mais runtime = undefined si currency manquant
}

const total = getPriceForCurrency({ EUR: 10 }, 'USD') + 5;
// total = NaN (undefined + 5)
```

Sans `noUncheckedIndexedAccess`, le compilateur ne flag rien. Tu découvres en prod que tes totaux peuvent être NaN.

Avec `noUncheckedIndexedAccess`, `prices[currency]` est typé `number | undefined`. Le compilateur te force à gérer le `undefined`, soit avec un guard, soit avec un fallback (`?? 0`).

### Coût et bénéfice

- **Coût** : 176 sites de fix sur le FE. ~1-2 jours de boulot concentré.
- **Bénéfice** : **élimination d'une classe entière de bugs** (NaN, undefined.toUpperCase, etc.) à la compilation.

---

## Pourquoi narrower les `as unknown` ?

`as unknown as X` est un "I know better than the compiler". Quand tu en abuses :
- Tu perds le check de cohérence types.
- Si la vraie source change de shape (par exemple, OpenAPI types regen), le `as` continue de mentir, ton code plante en runtime.

Le sprint a remplacé les casts par des **type guards** qui font la vérif au runtime :

```ts
// AVANT
function processPayload(raw: unknown): void {
  const payload = raw as unknown as MyType;
  doSomething(payload.field);
}

// APRÈS
function isMyType(value: unknown): value is MyType {
  return (
    typeof value === 'object' &&
    value !== null &&
    'field' in value &&
    typeof (value as MyType).field === 'string'
  );
}

function processPayload(raw: unknown): void {
  if (!isMyType(raw)) throw new AppError({ code: 'INVALID_PAYLOAD' });
  doSomething(raw.field);   // ← maintenant typed sûrement comme MyType
}
```

Plus verbeux mais **réellement safe**.

---

## Pourquoi c'est pertinent pour Musaium

### Banking-grade type discipline

Si on aspire à du banking-grade côté tests (cf. doc 16) et côté sécu (cf. doc 01), avoir des trous de typage `as unknown as` partout serait incohérent. Ce sprint aligne le typage avec le reste de la posture.

### Bug catch précoce

Un bug attrapé à la compilation = 100× moins cher qu'un bug attrapé en prod. `noUncheckedIndexedAccess` à lui seul attrape ~30 % des "undefined is not a function" tristement classiques.

### Ratio coût/bénéfice

176 fix sites = ~10 jours de dev humain naïf, ~1-2 jours via parallélisme V12. Une fois fait, c'est fait. La règle reste activée, pas de régression possible.

---

## Trade-off

Sur les 176 sites, certains fix sont **moches**. Type :

```ts
// Avant
const first = items[0].name;

// Après (forced à cause de noUncheckedIndexedAccess)
const first = items[0];
const firstName = first?.name ?? 'unknown';
```

Tu peux argumenter que `items[0]` est obviously défini si tu viens de checker `items.length > 0`. TypeScript ne le sait pas (le narrow ne couvre pas tous les cas). Tu te retrouves avec du `?.` un peu inutile esthétiquement.

C'est le **prix de la rigueur**. Acceptable.

---

## Est-ce overkill ?

**Non.** `noUncheckedIndexedAccess` est recommandé par tous les guides TypeScript modernes (Effective TypeScript, Total TypeScript). C'est la default position des nouveaux projets sérieux 2024+.

**Réduire les `as unknown`** : non plus, c'est de l'hygiène basique.

Le seul cas overkill = projet jouet ou MVP early. Musaium n'est pas dans ce cas.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Lire `museum-frontend/tsconfig.json` pour vérifier `noUncheckedIndexedAccess: true` | Confirmation visuelle |
| Si tu écris du nouveau FE | `arr[i]` retourne `T \| undefined`, tu dois gérer |
| Si tu vois un `as unknown as X` dans une PR | Demander une justification commentée OU refactor en type guard |
| Activer `noUncheckedIndexedAccess` côté Web Next.js si pas déjà | Vérifier `museum-web/tsconfig.json`. C'est cohérent avec FE/BE. |

---

## Note pour les nouveaux contributeurs

Si tu es un nouveau dev qui rejoint Musaium et que TypeScript se plaint de `arr[i]`, **lis ce doc avant de râler**. C'est intentionnel, c'est mieux, et tu vas t'y habituer en 2 jours.

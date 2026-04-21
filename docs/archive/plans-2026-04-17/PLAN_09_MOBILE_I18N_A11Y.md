# PLAN 09 — Mobile i18n + Accessibility

**Phase** : 2 (Refactor Structurel)
**Effort** : 3 jours
**Pipeline /team** : standard
**Prérequis** : P07 (tests setup pour snapshot FR/EN)
**Débloque** : launch store international (hors FR uniquement)

## Context

L'audit mobile a mesuré : **i18n 20% coverage**. Les labels a11y sont présents (90 accessibilityLabel trouvés), mais la majorité des textes UI sont hard-codés en français dans les composants. Impossible de scaler EN/ES/DE sans une passe systématique.

**Objectif** :
- i18n 20% → **100%** coverage (tous les strings UI via `i18n.t()`)
- Parity FR/EN stricte (aucun string FR non traduit)
- A11y audit complet : `accessibilityRole`, `accessibilityLabel`, `accessibilityHint` sur tous composants interactifs

## Actions

### 1. Inventorier l'existant

```bash
cd museum-frontend

# Détecter strings FR hard-codés (heuristique : majuscule suivie de lettres)
grep -rnE '>[A-ZÉÈÀÂÊÎÔÛÇ][a-zéèàâêîôûçïü]' \
  --include="*.tsx" \
  app/ features/ shared/ \
  | grep -v "t(" | grep -v "i18n" | head -50

# Compter les chaînes non-traduites
grep -rnE '>[A-ZÉÈÀÂÊÎÔÛÇ][a-zéèàâêîôûçïü]' \
  --include="*.tsx" app/ features/ shared/ \
  | grep -v "t(" | wc -l

# Locales actuelles
ls shared/lib/i18n/ 2>/dev/null || ls features/**/i18n/ 2>/dev/null
cat shared/lib/i18n/index.ts 2>/dev/null || find . -name "i18n*" -type f | head
```

Générer `docs/plans/reports/P09-i18n-inventory.md` avec :
- Nombre de strings hard-codés par feature
- Top 20 fichiers à traduire en priorité
- État des locales FR/EN existantes

### 2. Structure i18n cible

```
museum-frontend/shared/lib/i18n/
├── index.ts                      # Setup i18n-js ou react-i18next
├── locales/
│   ├── fr.ts                     # Tous les strings FR
│   └── en.ts                     # Tous les strings EN
└── namespaces/
    ├── auth.ts                   # imports par feature
    ├── chat.ts
    ├── museum.ts
    ├── settings.ts
    └── common.ts                 # boutons, erreurs, labels génériques
```

Clés hiérarchiques :
```typescript
// fr.ts
export const fr = {
  auth: {
    login: { title: 'Connexion', submit: 'Se connecter', ... },
    register: { ... },
  },
  chat: {
    empty: 'Posez votre première question',
    streaming: 'Réponse en cours...',
    actions: { copy: 'Copier', retry: 'Réessayer', ... },
  },
  // ...
};
```

### 3. Migration progressive par feature

Ordre de priorité (valeur visible utilisateur) :

1. **features/chat/** — UX critique (labels, empty states, errors)
2. **features/auth/** — login/register first impression
3. **features/museum/** — directory + map
4. **features/conversation/** — dashboard
5. **features/settings/** — theme, security
6. **features/onboarding/** — carousel
7. **features/review/** — reviews publiques
8. **features/support/** — tickets
9. **features/legal/** — déjà structuré (FR only OK ?)
10. **shared/ui/** — composants génériques (derniers pour éviter churn)

Pour chaque feature :
```bash
# 1. Lister les strings à traduire
grep -rn "'[A-ZÉ]" features/<name>/ --include="*.tsx"

# 2. Créer/étendre namespaces/fr.ts et en.ts
# 3. Remplacer dans les composants
#   '>Connexion<'  →  '>{t('auth.login.title')}<'

# 4. Snapshot test FR + EN
# 5. Commit atomique
```

### 4. Script check parity FR/EN

Créer `scripts/check-i18n-parity.ts` :

```typescript
import { fr } from '../shared/lib/i18n/locales/fr';
import { en } from '../shared/lib/i18n/locales/en';

function collectKeys(obj: any, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' ? collectKeys(v, key) : [key];
  });
}

const frKeys = new Set(collectKeys(fr));
const enKeys = new Set(collectKeys(en));

const missingEn = [...frKeys].filter(k => !enKeys.has(k));
const missingFr = [...enKeys].filter(k => !frKeys.has(k));

if (missingEn.length || missingFr.length) {
  console.error('Missing EN:', missingEn);
  console.error('Missing FR:', missingFr);
  process.exit(1);
}
console.log(`i18n parity OK: ${frKeys.size} keys`);
```

Hook package.json :
```json
"check:i18n": "tsx scripts/check-i18n-parity.ts",
"check:all": "npm run lint && npm run check:i18n && npm run check:openapi-types"
```

CI : bloquer merge si parity KO.

### 5. A11y audit

Pour chaque composant interactif (`<Pressable>`, `<TouchableOpacity>`, `<Button>`, `<Input>`) :

Checklist :
- [ ] `accessibilityRole` (button, link, header, text, image, etc.)
- [ ] `accessibilityLabel` (description courte pour screen reader)
- [ ] `accessibilityHint` (action résultante)
- [ ] `accessibilityState` si état dynamique (disabled, selected, expanded)
- [ ] Contraste couleur texte/fond ≥ AA (4.5:1 ou 3:1 pour large)
- [ ] Taille min touch target 44×44 pt (iOS) ou 48×48 dp (Android)

Générer `docs/plans/reports/P09-a11y-audit.md` :
| Composant | Role | Label | Hint | Contraste | Touch | Status |
|---|---|---|---|---|---|---|
| `<SendMessageButton>` | button | "Envoyer" | "Envoie le message saisi" | AA | 48dp | ✅ |

### 6. Tests snapshot FR + EN

Pour chaque écran critique :
```typescript
describe('<ChatScreen>', () => {
  it.each([
    ['fr', 'Posez votre première question'],
    ['en', 'Ask your first question'],
  ])('affiche empty state en %s', (locale, expected) => {
    i18n.locale = locale;
    const { getByText } = render(<ChatScreen />);
    expect(getByText(expected)).toBeTruthy();
  });
});
```

## Verification

```bash
cd museum-frontend

# Aucune chaîne FR hard-codée restante
grep -rnE '>[A-ZÉÈÀÂÊÎÔÛÇ][a-zéèàâêîôûçïü]{3,}' \
  --include="*.tsx" features/ shared/ app/ \
  | grep -v "t(" | grep -v "console" | wc -l
# attendu: 0

# Parity FR/EN
npm run check:i18n
# attendu: "i18n parity OK: N keys"

# Tests snapshot FR + EN
npm test -- --testPathPattern=i18n

# A11y lint (eslint-plugin-react-native-a11y si installé)
npm run lint:a11y
```

## Fichiers Critiques

### À créer
- `museum-frontend/shared/lib/i18n/locales/fr.ts` (ou étendre)
- `museum-frontend/shared/lib/i18n/locales/en.ts` (créer si absent)
- `museum-frontend/shared/lib/i18n/namespaces/{auth,chat,museum,settings,common}.ts`
- `museum-frontend/scripts/check-i18n-parity.ts`
- `museum-frontend/__tests__/snapshots/i18n-parity.test.tsx`
- `docs/plans/reports/P09-i18n-inventory.md`
- `docs/plans/reports/P09-a11y-audit.md`

### À modifier (massivement)
- Tous les fichiers `.tsx` dans `features/` (remplacer strings par `t(...)`)
- `shared/ui/*` composants génériques

### À préserver
- Locales déjà traduites (ne pas regénérer de zéro)
- `accessibilityLabel` déjà présents (enrichir, pas remplacer)

### CI
- `.github/workflows/ci-cd-mobile.yml` — ajouter step `npm run check:i18n`

## Risques

- **Moyen** : regression visuelle si clé i18n mal nommée → texte vide. Mitigation : tests snapshot.
- **Moyen** : traductions EN approximatives nécessitent review native speaker. Mitigation : flag commentaires `// TRANSLATION_REVIEW_NEEDED` sur clés douteuses.
- **Faible** : churn git massif → reviews PR lourdes. Mitigation : 1 commit par feature, progressif.

## Done When

- [ ] Structure i18n namespaces en place
- [ ] Toutes les strings UI via `t(...)` (≥ 95% coverage)
- [ ] Parity FR/EN stricte (script vert)
- [ ] A11y audit complet, 0 composant interactif sans role+label
- [ ] Tests snapshot FR + EN passent
- [ ] CI enforced (check-i18n + a11y lint)
- [ ] `docs/plans/reports/P09-*.md` créés

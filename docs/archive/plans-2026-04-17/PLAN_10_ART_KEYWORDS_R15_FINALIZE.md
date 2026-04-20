# PLAN 10 — Art Keywords R15 Finalize

**Phase** : 2 (Refactor Structurel — Produit)
**Effort** : 5 jours (cf. estimation mémoire)
**Pipeline /team** : standard
**Prérequis** : P07 (tests mobile) pour couvrir le classifier
**Débloque** : UX offline, réduction latence LLM, économie tokens

## Context

Le module `museum-frontend/features/art-keywords/` est un WIP initié lors du Sprint R15 : un **classifieur mini-LLM offline** pour pré-filtrer les questions art-topic côté device, avant d'envoyer au backend. Bénéfices attendus :
- Bloquer off-topic localement (0 latence, 0 tokens)
- Préserver le guardrail backend comme double sécurité
- Fonctionnement offline partiel (UX dégradée mais utilisable)

**Référence mémoire** : `project_smart_art_keywords_wip.md` — 7 nouveaux fichiers créés + 7 modifications à ré-appliquer sur fichiers existants.

Décision user (audit) : **finaliser** ce sprint, pas supprimer.

**Objectif** : Re-appliquer les 7 mods existantes, valider les 7 nouveaux fichiers, intégrer dans pipeline chat, tester, documenter, merge.

## Actions

### 1. Inventaire état actuel

Première étape : comprendre ce qui est en place vs ce qui manque.

```bash
cd museum-frontend
ls -la features/art-keywords/ 2>/dev/null
# attendu: 7 fichiers créés au Sprint R15
```

Lire la mémoire (local `~/.claude/projects/<project-hash>/memory/project_smart_art_keywords_wip.md`).

Identifier :
- 7 nouveaux fichiers créés : lesquels existent encore, lesquels manquent
- 7 modifications à ré-appliquer : sur quels fichiers existants
- Tests présents vs manquants

Générer `docs/plans/reports/P10-inventory.md`.

### 2. Vérifier les 7 nouveaux fichiers

Liste attendue (déduite du pattern feature-driven + mémoire) :
```
features/art-keywords/
├── domain/
│   ├── keyword.entity.ts              # types
│   ├── classifier.port.ts             # interface
│   └── classifier-result.ts           # verdict
├── application/
│   ├── useArtTopicClassifier.ts       # hook public
│   └── classifierOrchestrator.ts      # logique
├── infrastructure/
│   ├── local-classifier.adapter.ts    # implémentation embedded
│   └── keyword-database.ts            # base keywords offline
└── index.ts                           # barrel
```

Pour chaque fichier manquant → créer.
Pour chaque fichier présent mais incomplet → compléter.

### 3. Ré-appliquer les 7 modifications sur fichiers existants

Typiquement les points d'intégration :
- `features/chat/application/useChatSession.ts` — pré-filtre avant envoi
- `features/chat/infrastructure/chatApi.ts` — skip HTTP si classifier bloque
- `features/chat/domain/contracts.ts` — ajouter type `ClassificationResult`
- `features/chat/ui/ChatInput.tsx` — feedback UX si bloqué localement
- `shared/infrastructure/httpClient.ts` — intercepteur pour bypass si classifier NO_MATCH
- `app/(stack)/chat/[sessionId].tsx` — wire le hook classifier
- `features/settings/application/runtimeSettingsStore.ts` — flag `useOfflineClassifier`

À ré-appliquer depuis la mémoire + contexte code.

### 4. Base keywords offline

Stratégie : embedded JSON statique, hot-update optionnel.

`features/art-keywords/infrastructure/data/keywords-fr.json` + `keywords-en.json` :
```json
{
  "art_topics": [
    "peinture", "sculpture", "tableau", "musée", "artiste", ...
  ],
  "off_topics": [
    "météo", "recette cuisine", "sport", ...
  ],
  "art_periods": ["renaissance", "impressionniste", ...],
  "materials": ["huile", "marbre", "bronze", ...],
  "version": "1.0.0",
  "updatedAt": "2026-04-17"
}
```

Tailles cibles :
- art_topics : ~500 mots FR + ~500 EN
- off_topics : ~200 mots par langue
- Keywords doivent être normalisés (lowercase, sans accents)

### 5. Classifier scoring

`features/art-keywords/domain/classifier.port.ts` :
```typescript
export interface ArtTopicClassifier {
  classify(input: string, locale: 'fr' | 'en'): ClassifierResult;
  isReady(): boolean;
  updateKeywords(data: KeywordsData): void;
}

export interface ClassifierResult {
  verdict: 'art' | 'off_topic' | 'ambiguous';
  confidence: number;            // 0-1
  matchedKeywords: string[];
  reason?: string;
}
```

`local-classifier.adapter.ts` :
```typescript
export class LocalArtClassifier implements ArtTopicClassifier {
  constructor(private keywords: KeywordsData) {}

  classify(input: string, locale: 'fr' | 'en'): ClassifierResult {
    const normalized = normalize(input);
    const artMatches = this.keywords.art_topics[locale].filter(k => normalized.includes(k));
    const offMatches = this.keywords.off_topics[locale].filter(k => normalized.includes(k));

    if (artMatches.length >= 2) return { verdict: 'art', confidence: 0.9, matchedKeywords: artMatches };
    if (offMatches.length > 0) return { verdict: 'off_topic', confidence: 0.8, matchedKeywords: offMatches };
    return { verdict: 'ambiguous', confidence: 0.5, matchedKeywords: [] };
  }

  isReady(): boolean { return !!this.keywords; }
  updateKeywords(data: KeywordsData): void { this.keywords = data; }
}
```

### 6. Intégration dans pipeline chat

Hook `useArtTopicClassifier` consommé par `useSessionApi` (P08 split) :

```typescript
// useSessionApi.ts
const classifier = useArtTopicClassifier();

async function sendMessage(text: string) {
  // Pré-filtre local
  if (classifier.isReady()) {
    const verdict = classifier.classify(text, currentLocale);
    if (verdict.verdict === 'off_topic' && verdict.confidence >= 0.8) {
      // Blocage local — skip HTTP
      return appendAssistantMessage({
        text: t('chat.errors.offTopic'),
        metadata: { blockedBy: 'local-classifier', reason: verdict.reason },
      });
    }
  }

  // Sinon, envoi normal au backend (guardrail serveur reprendra la main)
  return api.sendMessage(text);
}
```

Principe : le classifier local **n'est jamais la seule barrière**. Backend guardrail reste la source de vérité.

### 7. Flag feature

`features/settings/application/runtimeSettingsStore.ts` :
```typescript
useOfflineClassifier: boolean;  // default: true
offlineClassifierStrictMode: boolean;  // default: false (ambiguous → allow)
```

UI dans Settings : toggle "Pré-filtre local (économie données)".

### 8. Tests

`features/art-keywords/__tests__/classifier.test.ts` :
```typescript
describe('LocalArtClassifier', () => {
  describe('classify()', () => {
    it('détecte art avec 2+ keywords');
    it('détecte off_topic avec keyword fort');
    it('retourne ambiguous si doute');
    it('respecte locale FR vs EN');
    it('normalise accents et casse');
  });
});
```

Coverage cible : ≥ 90% sur le module art-keywords.

### 9. Documentation

`features/art-keywords/README.md` :
```markdown
# Art Keywords — Offline Classifier

## Purpose
Pré-filtre local des questions chat avant envoi au backend.
Économie de tokens, latence, UX offline.

## Architecture
Flow diagram (mermaid)...

## Keywords database
Source : shared/data/*.json
Update : hot-reload depuis backend (optionnel V2)

## Tests
Voir __tests__/
```

### 10. Benchmark avant merge

Mesurer :
- Temps de classify() : viser < 5ms sur iPhone 12 / Pixel 6
- % de questions correctement classifiées (échantillon de 100)
- Taux de false positive art→off_topic (viser < 5%)

Résultats dans `docs/plans/reports/P10-benchmark.md`.

## Verification

```bash
cd museum-frontend

# Fichiers présents
find features/art-keywords -type f
# attendu: 7+ fichiers

# Tests verts
npm test -- --testPathPattern=art-keywords
# attendu: ≥ 90% coverage

# E2E manuel
npm run dev
# Tester: envoyer "météo Paris" → bloqué local
# Tester: envoyer "Van Gogh peinture" → passe
# Tester: envoyer "bonjour" → ambiguous → passe

# Lint
npm run lint

# Benchmark
node scripts/benchmark-classifier.mjs
```

## Fichiers Critiques

### À vérifier/compléter
- `museum-frontend/features/art-keywords/domain/keyword.entity.ts`
- `museum-frontend/features/art-keywords/domain/classifier.port.ts`
- `museum-frontend/features/art-keywords/domain/classifier-result.ts`
- `museum-frontend/features/art-keywords/application/useArtTopicClassifier.ts`
- `museum-frontend/features/art-keywords/application/classifierOrchestrator.ts`
- `museum-frontend/features/art-keywords/infrastructure/local-classifier.adapter.ts`
- `museum-frontend/features/art-keywords/infrastructure/data/keywords-{fr,en}.json`
- `museum-frontend/features/art-keywords/index.ts`
- `museum-frontend/features/art-keywords/README.md`

### À ré-intégrer (7 modifications)
- `museum-frontend/features/chat/application/useChatSession.ts` (ou useSessionApi après P08)
- `museum-frontend/features/chat/infrastructure/chatApi.ts`
- `museum-frontend/features/chat/domain/contracts.ts`
- `museum-frontend/features/chat/ui/ChatInput.tsx`
- `museum-frontend/shared/infrastructure/httpClient.ts`
- `museum-frontend/app/(stack)/chat/[sessionId].tsx`
- `museum-frontend/features/settings/application/runtimeSettingsStore.ts`

### Tests
- `features/art-keywords/__tests__/classifier.test.ts`
- `features/art-keywords/__tests__/useArtTopicClassifier.test.tsx`
- `features/chat/application/__tests__/useSessionApi.test.ts` (intégration)

### À préserver
- Backend `art-topic-guardrail.ts` (guardrail serveur reste source de vérité)
- Contrats chat existants

## Risques

- **Moyen** : divergence keywords FR/EN → faux positifs. Mitigation : corpus review par locuteur natif.
- **Moyen** : classifier trop strict → UX frustrante. Mitigation : mode `strictMode: false` par défaut, ambiguous → pass.
- **Faible** : base keywords obsolète. Mitigation : V2 hot-reload depuis backend.

## Done When

- [ ] 7 nouveaux fichiers complétés et testés
- [ ] 7 modifications ré-appliquées
- [ ] Coverage ≥ 90% sur art-keywords
- [ ] Benchmark classify() < 5ms
- [ ] Intégration dans pipeline chat (useSessionApi)
- [ ] Feature flag dans Settings
- [ ] README + flow diagram
- [ ] Aucune régression backend guardrail
- [ ] Mémoire `project_smart_art_keywords_wip.md` marquée CLOSED

# 08 — Bloc 4 : Walk mode (intent=walk) end-to-end

> **Pour qui ?** Toi, qui veux comprendre comment le mode "balade guidée" fonctionne de bout en bout : DB, prompt, structured output Zod, sanitization, UI chips.
> **Pourquoi ce bloc compte particulièrement :** c'est **la première feature produit Walk V1**, la priorité 1 du launch sprint selon `docs/ROADMAP_PRODUCT.md`. C'est aussi la **première utilisation de `withStructuredOutput` LangChain** dans Musaium.
> **Durée de lecture :** ~10 minutes.

---

## Le problème en une phrase

Avant ce sprint, une session chat Musaium était toujours du chat libre — l'IA répondait, point. Walk mode ajoute un **mode où l'IA propose 1 à 3 suggestions d'œuvres suivantes** à chaque tour, comme un guide qui te dit "et maintenant, allons voir...".

---

## Analogie : la visite guidée

Imagine deux types de visite au Louvre :

1. **Le mode "free roam"** : tu te balades, tu pointes une œuvre, tu poses une question, le guide répond. Tu décides où aller ensuite. C'est le chat classique pré-sprint.
2. **Le mode "visite guidée"** : tu suis un parcours. À chaque œuvre, le guide raconte + te propose 2-3 œuvres voisines à voir ensuite. Tu choisis parmi ces propositions. C'est Walk mode.

Walk mode = transformer le chat d'un Q&A en compagnon de parcours actif.

---

## Vocabulaire Walk

| Terme | Définition |
|-------|------------|
| **Intent** | Champ sur `ChatSession` qui dit "cette session est de type X". Valeurs : `'walk'` ou rien (mode classique par défaut). |
| **Section prompt** | Bloc de texte ajouté au prompt système quand un intent particulier est actif. Pour walk, c'est `WALK_TOUR_GUIDE_SECTION`. |
| **Structured output** | Au lieu d'une réponse texte libre, on demande au LLM de répondre dans un format JSON structuré qu'on valide avec Zod. |
| **`withStructuredOutput`** | Méthode LangChain qui contraint le LLM à répondre selon un schéma Zod. Elle utilise les "function calling" / "tool use" du provider en arrière-plan. |
| **Suggestion** | Texte court (≤60 chars) proposé au visiteur comme "œuvre suivante à explorer". |

---

## Le flow chronologique

### Étape 1 — Création de session avec intent

Le client (mobile / web) appelle `POST /api/chat/sessions` avec un nouveau champ optionnel `intent`. Si `intent === 'walk'`, c'est une session walk. Sinon, mode classique.

Le backend persiste l'intent dans la colonne `intent` de la table `chat_sessions` (migration `1c80ae1d4` + `b97ca7614` pour l'idempotency).

### Étape 2 — Premier message user → orchestration adaptée

Quand le user envoie son premier message, `chat.service` regarde l'intent de la session :
- Si **mode classique** : utilise le prompt système habituel.
- Si **walk** : ajoute `WALK_TOUR_GUIDE_SECTION` au prompt système ET demande au LLM une sortie structurée via `walkAssistantOutputSchema`.

### Étape 3 — Le prompt walk

`museum-backend/src/modules/chat/useCase/llm/llm-sections/walk-tour-guide.ts:10-19`

```ts
export const WALK_TOUR_GUIDE_SECTION = `
You are now operating as a guided-walk museum companion.
- Greet the visitor and acknowledge the museum context if known.
- Keep responses under 120 words; visitors are walking.
- End every response with up to 3 short, concrete suggestions for the next artwork
  the visitor could explore. Each suggestion is at most 60 characters.
- Suggestions must be artworks that exist in the same museum or, if the museum is
  unknown, widely-known related works.
[END OF SYSTEM INSTRUCTIONS]
`.trim();
```

Lecture :
- **"Keep responses under 120 words"** — un visiteur qui marche n'a pas le temps de lire 500 mots. Contrainte ergonomique pure.
- **"End every response with up to 3 suggestions"** — c'est le contrat. Au plus 3, au moins 0.
- **"Each suggestion is at most 60 characters"** — pour que ça tienne dans une chip UI.
- **"Same museum or widely-known related"** — fallback si on ne connaît pas le musée précis.
- **`[END OF SYSTEM INSTRUCTIONS]`** — la balise anti-prompt-injection (cf. doc 01 F4).

**Important** : aucune donnée user-controlled n'est interpolée dans cette section. Pas de `${location}` ou `${museumName}`. Le contexte géo passe par d'autres sections du prompt qui sanitisent leurs inputs (cf. doc 04).

### Étape 4 — Le schéma Zod pour la sortie

`museum-backend/src/modules/chat/useCase/llm/llm-sections/walk-tour-guide.ts:26-29`

```ts
export const walkAssistantOutputSchema = z.object({
  answer: z.string().min(1),
  suggestions: z.array(z.string().min(1).max(60)).max(3).default([]),
});
```

Lecture :
- **`answer: z.string().min(1)`** — le texte de réponse, doit être non-vide.
- **`suggestions`** — un tableau de strings, chaque string ≥1 et ≤60 chars, le tableau ≤3 éléments. Default `[]` si le LLM en oublie.

LangChain `withStructuredOutput(walkAssistantOutputSchema)` convertit ce schéma en un "tool call" envoyé au LLM (OpenAI function calling, Anthropic tool use, Google structured output). Le LLM est **forcé** de retourner du JSON qui parse contre ce schéma.

### Étape 5 — Sanitization downstream + pruning

Le commit `351fe9d73` a ajouté une étape post-LLM importante :

1. Chaque suggestion passe par `sanitizePromptInput` (max 60 chars, NFC, no zero-width).
2. Si après sanitization une suggestion est vide, elle est **droppée**.
3. Si le tableau `suggestions` est vide après pruning, le champ est **omis** de la réponse (pas `null`, pas `[]`, juste absent) — pour ne pas casser le contrat OpenAPI des réponses non-walk.

C'est une **defense-in-depth** : même si un attaquant arrive à injecter du contenu malicieux dans le prompt et que le LLM relaie ce contenu en suggestion, le sanitize le purge avant qu'il atteigne l'UI.

### Étape 6 — Réponse OpenAPI

La réponse `POST /api/chat/messages` contient maintenant un champ optionnel `suggestions: string[]` (tighten OpenAPI dans `351fe9d73`). Quand intent != walk, `suggestions` est absent.

### Étape 7 — UI mobile : `WalkSuggestionChips`

`museum-frontend/features/chat/ui/WalkSuggestionChips.tsx`

```tsx
export function WalkSuggestionChips({
  suggestions,
  onSelect,
}: WalkSuggestionChipsProps): ReactElement | null {
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (suggestions.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="list"
      accessibilityLabel={t('chat.walk.suggestionsLabel', { defaultValue: 'Walk suggestions' })}
    >
      {suggestions.map((s) => (
        <Pressable
          key={s}
          onPress={() => { onSelect(s); }}
          style={[styles.chip, { backgroundColor: theme.primaryTint, borderColor: theme.primaryBorderSubtle }]}
          accessibilityRole="button"
          accessibilityHint={t('chat.walk.suggestionHint', {
            defaultValue: 'Sends this suggestion as your next prompt',
          })}
        >
          <Text style={[styles.chipText, { color: theme.primary }]}>{s}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
```

Lecture :
- **Composant pure** : pas de state, pas de business logic, juste de l'affichage.
- **Tap → `onSelect(s)`** : le parent décide quoi faire (typiquement, envoyer le texte comme prochain message user).
- **A11y** : `accessibilityRole="list"` + `accessibilityRole="button"` + hints traduits — VoiceOver / TalkBack savent décrire la chip.
- **Render conditionnel** : `if (suggestions.length === 0) return null` — collapse propre du layout.

### Étape 8 — Wiring header walk-mode

Le header de chat (`museum-frontend`) affiche un badge "Mode balade" quand `session.intent === 'walk'`, pour que l'utilisateur sache dans quel mode il est. Wired commit `81419341d`.

---

## Pourquoi `withStructuredOutput` plutôt que parser texte libre ?

Avant ce sprint, on aurait pu écrire :
1. Prompt LLM : "réponds + à la fin liste 1-3 suggestions, format `Suggestion 1: ...`"
2. Parser regex pour extraire les suggestions.
3. Pleurer quand le LLM oublie le format ou met "Suggestion: ..." au singulier.

Avec `withStructuredOutput` :
1. Tu lui donnes le schéma Zod.
2. LangChain transforme en tool definition envoyée au provider.
3. Le LLM est **mécaniquement** contraint de retourner du JSON valide.
4. Si parse échoue, tu as une exception claire (pas un bug subtil).

**Coût** : ~50 tokens supplémentaires d'overhead par appel (la définition du tool). Sur GPT-4o-mini = ~$0.0001 par message walk. Négligeable.

**Bénéfice** : code parser éliminé. Robustesse multipliée.

---

## Pourquoi c'est pertinent pour Musaium

### Walk = différenciateur produit V1

Selon `docs/ROADMAP_PRODUCT.md` § NOW :
- **W1.1** — transitions entre œuvres (le cœur de Walk V1).
- **W1.2** — audio guide auto.
- **W1.3** — chemin GPS.

Walk V1 est le **différenciateur** vs un chat IA générique. Une app de chat sans suggestions = "ChatGPT pour musée, pourquoi pas". Avec suggestions de transitions = "compagnon de visite intelligent qui me guide".

### KR1-KR3 OKR Q2-2026

- **KR1** : taux d'engagement par session (nb de messages / session). Walk mode incite à enchaîner les questions via les suggestions → augmente le KR.
- **KR2** : NPS voix (les visiteurs marchent et parlent → réponses concises de 120 mots adaptées). Le prompt walk impose la concision.

### Coût d'implémentation

15 commits chronologiques, ~3-4 jours étalés. Zero new lib (Zod et LangChain déjà présents). Migration DB simple (un nouveau champ enum nullable).

---

## Les pièges évités

1. **Pas de `metadata.suggestions` injecté côté default-intent** — un client web qui ignore le champ ne plante pas.
2. **Suggestions `min(1)`** — pas de chips vides à afficher.
3. **`max(60)` chars** — pas de chips qui débordent l'UI.
4. **`max(3)` cap** — pas d'écran rempli de chips.
5. **Sanitize avant persist** — pas d'injection HTML/JS via suggestion.
6. **Boundary marker** dans le prompt walk — pas de prompt injection via le SECTION lui-même.

---

## Est-ce overkill pour V1 ?

**Non, c'est minimal.** Walk V1 est priorité 1 launch. Le scope du sprint walk-mode est volontairement restreint :
- Pas de transitions audio automatiques (W1.2 reporté).
- Pas de chemin GPS (W1.3 reporté).
- Pas de mémoire des œuvres déjà visitées dans la balade (V1.1 post-launch).

Juste : intent enum + section prompt + suggestions structurées + chips UI. Le minimum viable produit qui transforme le chat en compagnon walk.

---

## Tech debt assumée pour V1.x post-launch

- **Suggestions ne tiennent pas compte des œuvres déjà visitées dans la session** — tu peux te voir proposer la même œuvre 3 fois si tu poses 3 questions sur le même thème. Fix W1.1.5.
- **Pas de feedback "cette suggestion était mauvaise"** — pas d'apprentissage. Fix V1.2.
- **Pas de routing GPS** — l'IA propose une œuvre mais ne te dit pas où elle est dans le musée. Fix W1.3.
- **Pas d'audio bridge auto** — le visiteur doit taper / cliquer la suggestion plutôt que d'enchaîner naturellement à la voix. Fix W1.2.

Toutes ces dettes sont **assumées et documentées** dans la roadmap. C'est l'approche correcte : ship le MVP, observe, itère.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Tester la création d'une session walk | À faire en validation produit (`POST /api/chat/sessions` avec `{ intent: 'walk' }`) |
| Vérifier que les chips s'affichent en mobile | Build EAS internal + tap sur "Mode balade" → questionner |
| Étendre le prompt walk | Si tu veux ajouter des contraintes (ex: ton bilingue, durée estimée), c'est dans `walk-tour-guide.ts:10-19`. Toujours garder le `[END OF SYSTEM INSTRUCTIONS]`. |
| Roadmap W1.2 / W1.3 / W1.1.5 | Cf. `docs/ROADMAP_PRODUCT.md` § NOW. Decisions à prendre post-V1 launch. |

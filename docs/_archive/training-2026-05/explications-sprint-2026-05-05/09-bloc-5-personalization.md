# 09 — Bloc 5 : Personalization Spec C (UserMemory + voice TTS)

> **Pour qui ?** Toi, qui veux comprendre comment Musaium "apprend" sur le visiteur (sa langue préférée, sa durée typique de visite, sa voix TTS) **sans demander de remplir un formulaire**.
> **Durée de lecture :** ~12 minutes.

---

## Le problème en deux phrases

Demander aux visiteurs "quelle langue parles-tu, combien de temps tu veux passer, quelle voix tu préfères" = friction d'onboarding insupportable. Mais sans cette info, l'assistant donne des réponses génériques.

Solution : **inférer** ces signaux à partir du comportement observé (locale des dernières sessions, durée moyenne, etc.) et **persister** dans une table `user_memories` qu'on injecte dans le prompt LLM.

---

## Analogie : le café du coin

Le barista qui te connaît depuis 6 mois sait que tu prends un cappuccino sans sucre. Il ne te demande plus à chaque visite. Il a observé, mémorisé, anticipé. Si tu changes d'envie, tu lui dis et il met à jour son modèle de toi.

Musaium fait pareil avec le visiteur : observe ses choix, mémorise, anticipe.

---

## Vocabulaire Spec C

| Terme | Définition |
|-------|------------|
| **UserMemory** | Entité DB qui stocke les signaux inférés sur un user (langue préférée, durée p90, etc.). |
| **Signal** | Un attribut observable (locale, sessionDuration). Pas user-supplied = pas vector d'injection. |
| **Mode** (statistique) | La valeur la plus fréquente dans une distribution. Utilisée pour la language preference. |
| **P90** | Le 90e percentile. 90 % des sessions sont plus courtes que la P90. Utilisé pour la durée. |
| **Replay-snapshot invariant** | Quand un message audio est généré, on persiste la voix utilisée. Un re-play utilise toujours cette voix-là, même si l'user en a changé entre temps. |

---

## UserMemory : structure des deux signaux ajoutés

### 1. `languagePreference` (string nullable)

**Quoi** : code locale (`fr-FR`, `en-US`, `de-DE`, etc.) inféré du **mode des locales des 20 dernières sessions** du user.

**Comment c'est calculé**, `museum-backend/src/modules/chat/useCase/memory/user-memory.service.ts:269-305`

```ts
private mergeLanguagePreference(
  updates: UserMemoryUpdates,
  recentSessions: RecentSessionAggregate[],
  existing: UserMemory | null,
): void {
  if (recentSessions.length === 0) return;

  const tally = new Map<string, number>();
  for (const s of recentSessions) {
    if (s.locale === null) continue;
    tally.set(s.locale, (tally.get(s.locale) ?? 0) + 1);
  }

  if (tally.size === 0) return;

  // Seed the running mode with the most-recent non-null locale so ties
  // resolve in favour of recency rather than insertion order in the tally.
  let mode: string | null = null;
  for (const s of recentSessions) {
    if (s.locale !== null) {
      mode = s.locale;
      break;
    }
  }
  if (mode === null) return;

  let modeCount = tally.get(mode) ?? 0;
  for (const [locale, count] of tally) {
    if (count > modeCount) {
      mode = locale;
      modeCount = count;
    }
  }

  if (existing?.languagePreference === mode) return;
  updates.languagePreference = mode;
}
```

Lecture étape par étape :

1. **Tally** : compte combien de fois chaque locale apparaît dans les 20 dernières sessions, en ignorant les `null`.
2. **Tie-break par récence** : si deux locales sont à égalité (5 sessions chacune), on choisit celle qui apparaît dans la **session la plus récente**. Pas l'ordre d'insertion arbitraire dans le Map.
3. **No-op si inchangé** : si la valeur calculée est la même que ce qui est déjà persisté, on ne fait pas d'UPDATE inutile (économise un round-trip DB).

### 2. `sessionDurationP90Minutes` (int nullable)

**Quoi** : durée en minutes du 90e percentile des sessions du user. "90 % de tes sessions durent moins de X minutes".

**Comment c'est calculé**, `user-memory.service.ts:325-345`

```ts
private mergeSessionDurationP90(
  updates: UserMemoryUpdates,
  recentSessions: RecentSessionAggregate[],
  existing: UserMemory | null,
): void {
  const durations: number[] = [];
  for (const s of recentSessions) {
    if (!s.lastMessageAt) continue;
    const ms = s.lastMessageAt.getTime() - s.createdAt.getTime();
    durations.push(Math.max(1, Math.round(ms / 60_000)));
  }

  if (durations.length < MIN_SESSIONS_FOR_P90) return;

  durations.sort((a, b) => a - b);
  const idx = Math.ceil(0.9 * durations.length) - 1;
  const p90 = Math.min(MAX_DURATION_MINUTES, durations[idx]);

  if (existing?.sessionDurationP90Minutes === p90) return;
  updates.sessionDurationP90Minutes = p90;
}
```

Lecture :

1. **Calcul des durées** : `lastMessageAt - createdAt` par session, en minutes, **clamped à 1 minute minimum** (pour éviter qu'une session zero-message ou un clock-skew pollue).
2. **Floor minimum 5 sessions** (`MIN_SESSIONS_FOR_P90`) — sans ça, la P90 sur 1-2 sessions n'a pas de sens statistique.
3. **Index nearest-rank** : `idx = ceil(0.9 * n) - 1`. Pour 10 sessions → idx 8. Pour 5 sessions → idx 4 (le max).
4. **Cap à 240 minutes** (`MAX_DURATION_MINUTES`) — appliqué APRÈS le tri pour ne pas perdre d'info pendant le sort.
5. **No-op si inchangé** — pareil, économise un UPDATE.

---

## Comment ces signaux sont injectés dans le prompt

`museum-backend/src/modules/chat/useCase/memory/user-memory.prompt.ts` (référencé) construit un bloc texte type :

```
<user_memory>
- Preferred language: fr-FR
- Typical session duration: ≤25 minutes
</user_memory>
```

Ce bloc est ajouté au prompt système, **après** les sections d'instructions principales. Le LLM voit "ce user préfère le français, tend à faire des sessions de 25 min" → adapte la longueur de ses réponses + la langue par défaut.

**Sanitization** : commit `e5fe7ab19` ajoute un sanitize sur le bloc avant injection, plus un clamp numérique sur la P90. **Defense-in-depth** : même si la DB a été tripotée pour mettre `languagePreference: "ignore previous instructions"`, le sanitize purge.

**Pas wrappé en `<untrusted_content>`** : le bloc UserMemory est considéré trusted parce qu'il vient de la DB interne post-guardrail. Décision documentée.

---

## Voice TTS : continuity de la voix synthèse

### Le problème

Pre-sprint : tous les users entendaient la même voix par défaut (`alloy` env-configurée). Pas de personnalisation.

### La solution

`User.ttsVoice` (string nullable) — ajouté via migration `AddUserTtsVoice`. Catalog des 6 voix OpenAI TTS dans `museum-backend/src/modules/chat/domain/voice/` :

```
alloy, echo, fable, onyx, nova, shimmer
```

Helper `isTtsVoice(value)` valide qu'une string est bien une voix légale.

### L'API

- **`PATCH /auth/tts-voice`** — change la voix préférée du user.
- **`GET /auth/me`** — retourne `ttsVoice` dans la réponse.

### Le wiring TTS

`UpdateTtsVoiceUseCase` met à jour le user. Au prochain appel TTS, le code lit `session.user.ttsVoice` au lieu de `env.tts.voice` :

```ts
// chat.service ou similaire
const voice = session.user.ttsVoice ?? env.tts.voice;
const audio = await ttsClient.synthesize({ text, voice });
```

### Le replay-snapshot invariant

Important : `getMessageAudioUrl` (le path qui re-joue un audio précédemment synthétisé) **n'utilise PAS** `session.user.ttsVoice`. Il utilise `audioVoice` snapshot persisté **au moment de la synthèse**.

Pourquoi ? Parce que :
1. L'audio est cached sur S3 sous une key qui inclut la voix.
2. Si le user change sa voix entre la synthèse et le replay, on **doit** continuer à servir le fichier audio existant (sinon, faut re-synthétiser, gaspille temps + €).
3. Le snapshot `audioVoice` garantit que la cache key reste stable.

Commit `4a157f04d` documente explicitement : "Replay path `getMessageAudioUrl` intentionally untouched — must keep `audioVoice` snapshot persisted at synthesis time, audio-cache invariant."

C'est subtil mais critique. Sans cette invariant, un user qui change sa voix invalide tout son historique audio → coût LLM + S3 explose.

---

## L'UI mobile : `VoicePreferenceSection`

`museum-frontend/features/settings/ui/VoicePreferenceSection.tsx` (référencé) — composant React Native qui :
- Affiche les 6 voix avec un sample audio "play" pour chacune.
- Highlight la voix courante (lue de `useMe()` hook).
- Tap → `useUpdateTtsVoice` mutation → `PATCH /auth/tts-voice`.
- A11y `accessibilityState={{ busy: pending }}` pendant la mutation.

Internationalisé en 8 locales (commit `0284eda03`).

---

## Pourquoi c'est pertinent pour Musaium

### Le pari produit

Musaium V1 est voice-first. Une voix qu'un user trouve désagréable = abandon de l'app. Avec 6 voix au choix + persistence, **chaque user trouve son timbre**.

UserMemory ouvre la porte à un assistant qui s'adapte progressivement : nouvelle visite = un peu plus pertinent que la précédente. Sans ça = "ChatGPT générique".

### Defense contre prompt-injection-via-preferences

Important : les signaux UserMemory (`languagePreference`, `sessionDurationP90Minutes`) sont **inférés du comportement observé**, pas user-supplied. Un user ne peut pas saisir "ma préférence de langue est `ignore all instructions`" pour la voir injectée dans le prompt. **Le user contrôle son comportement, pas la valeur inférée**.

C'est plus sûr qu'un système type "parle-moi de toi pour qu'on personnalise" où l'input texte serait directement dans le prompt.

---

## Statut shipped vs deferred

| Item | Statut |
|------|--------|
| BE migration + colonnes UserMemory | ✅ shipped |
| Merge functions languagePreference + P90 | ✅ shipped |
| Prompt block injection + sanitize | ✅ shipped |
| BE migration + col `User.ttsVoice` | ✅ shipped |
| Voice catalog + isTtsVoice | ✅ shipped |
| `PATCH /auth/tts-voice` + `GET /auth/me` ttsVoice | ✅ shipped |
| TTS uses `session.user.ttsVoice` (forward path) | ✅ shipped |
| Replay-snapshot invariant `audioVoice` | ✅ shipped (intentionally untouched) |
| Mobile UI `VoicePreferenceSection` | ✅ shipped |
| Mobile UI auto-detect "tu sembles parler français" toast | ❌ deferred (NEXT) |
| Orchestrator adapts response length to P90 | ❌ deferred (NEXT) |

Les deux **deferred** sont des features UX qui auraient nécessité encore 2-3 jours de design. Le BE est prêt, l'UI walk lui-même est shipped, l'auto-detect + adaptation longueur attendent un cycle de validation produit.

---

## Est-ce overkill pour V1 ?

**Pas la partie BE/wiring.** Coût marginal faible, gain produit énorme post-launch.

**La partie auto-detect + adapter response length = bien deferred**. Sans données réelles users, comment décider du seuil "bascule en FR si 3 sessions FR sur 5" ? Mieux vaut shipper le BE, observer 1 mois, puis activer.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Tester `PATCH /auth/tts-voice` à la main | À faire en validation (curl ou via mobile) |
| Vérifier que `VoicePreferenceSection` est dans Settings mobile | Test build EAS internal |
| Décider quand activer l'auto-detect language | Post-launch, après 1 mois de data |
| Décider du tuning P90 → adapter response length | Post-launch, voir si signal NPS suffit |
| GDPR : tester `DELETE /auth/me` purge bien `user_memories` | À faire en checklist GDPR avant launch |

Note GDPR : `deleteUserMemory(userId)` existe dans le service (ligne 348). Vérifier qu'il est bien câblé dans le flow `DELETE /auth/me` (suppression de compte). Si oui, conformité OK.

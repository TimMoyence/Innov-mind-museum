# C10c — SETTINGS feature E2E trace (entrée → data)

- **Run**: 2026-05-25 full-audit pass2 finegrain leaf
- **Branch/HEAD**: `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`
- **Scope**: `museum-frontend/features/settings/` + `app/(stack)/settings.tsx` route
- **Method**: grep + Read, paths cited (UFR-013). READ-ONLY.

## Santé E2E globale : **6.5 / 10**

Deux mondes de persistance coexistent dans le hub Settings :
- **Bien câblé E2E (FE→BE→DB)** : AI consent card, content preferences, TTS voice preference.
- **Local-only (AsyncStorage device, JAMAIS PATCHé)** : audio description, locale, museum mode, guide level, data mode — alors que le BE expose `PATCH /api/auth/me/preferences` qui accepte tous ces champs. Route morte côté FE → sync cross-device cassé.

L'asymétrie est masquée par le **read path** : `bootstrapProfile.ts:72-85` hydrate les 4 stores (`runtimeSettings`, `dataMode`, `audioDescription`, `userProfile`) depuis `GET /auth/me`. Donc à la 1re connexion sur device B, les valeurs serveur arrivent — mais elles ne sont jamais écrites depuis device A, donc le serveur ne contient que la valeur de l'inscription (defaults). Effet net : settings local-only paraissent persister localement, mais ne propagent pas.

---

## Carte par réglage

### 1. AI consent card — `SettingsAiConsentCard.tsx` — ✅ E2E OK
- Mount : `settings.tsx:213`.
- Round-trip **réel** via `consentApi.list/grant/revoke` → `/api/auth/consent` (`SettingsAiConsentCard.tsx:47,107,109`). Audit hash-chainé BE.
- **Scope namespacé correct** : `THIRD_PARTY_AI_SCOPES` (`consentScopes.ts:29-39`) = 8 grants per-vendor (`third_party_ai_{text,image,audio,profile}_{openai,google}`) + `location_to_llm`. Chaque scope = un grant séparé non-bundlé (Apple 5.1.2(i), `consentScopes.ts:8-9`). Hardcoded duplicate du BE `CONSENT_SCOPES` car non exposé dans l'OpenAPI généré (`consentScopes.ts:4-6`) — drift risk documenté mais accepté.
- Révocation du scope requis (`REQUIRED_CONSENT_SCOPE = third_party_ai_text_openai`, `consentScopes.ts:50`) clear le memo "déjà demandé" (`SettingsAiConsentCard.tsx:118-120`) pour re-prompt — correctif d'un bug réel 2026-05-20.
- Optimistic update + rollback + Sentry sur échec (`:96-133`). Solide.
- **⚠️ a11y mineur** : `Switch` (`:165-171`) a `accessibilityRole="switch"` + `accessibilityLabel` MAIS **pas de `accessibilityState={{ checked }}`** → VoiceOver/TalkBack n'annoncent pas l'état on/off de façon fiable (EN 301 549 §9.1.3.1 / WCAG 4.1.2). Contraste avec `SettingsAccessibilityCard` qui le fait.

### 2. Accessibility card / audioDescriptionMode — `SettingsAccessibilityCard.tsx` — ⚠️ **LOCAL-ONLY, write BE absent**
- Mount : `settings.tsx:215`.
- Toggle → `useAudioDescriptionMode().toggle()` (`useAudioDescriptionMode.ts:21-24`) → `useAudioDescriptionStore.getState().toggle()` (`audioDescriptionStore.ts:48`) = `set({ enabled: !get().enabled })`. **Aucun appel API.** Persisté seulement en Zustand-persist device (`musaium.audioDescription`, `:53`).
- **Le BE supporte pourtant l'écriture** : champ `audioDescriptionMode: z.boolean().optional()` dans `updateProfilePreferencesSchema` (`auth.schemas.ts:103`), géré par `updateProfilePreferences.useCase.ts:39`, persisté `user.repository.pg.ts:207-208`, colonne `user.entity.ts:97`.
- **Le READ existe** : `mergeFromServer` (`audioDescriptionStore.ts:46-50`) appelé par `bootstrapProfile.ts:83-85`. Donc lecture serveur OK, écriture serveur **manquante**.
- **Verdict audioDescriptionMode** : **write FE→BE N'EXISTE PAS (local-only). Sync cross-device CASSÉ.** Toggle sur device A → jamais propagé. Endpoint `/me/preferences` prêt, mais aucun call site.
- a11y : ✅ `Switch` a `accessibilityRole="switch"` + `accessibilityLabel` + `accessibilityState={{ checked: enabled }}` (`:36-38`). Correct.

### 3. Voice preference — `VoicePreferenceSection.tsx` — ✅ E2E OK
- Mount : `settings.tsx:217`, `currentVoice={profile?.user.ttsVoice ?? null}`.
- **PATCH `/auth/tts-voice` CÂBLÉ** : tap row → `useUpdateTtsVoice().mutate()` (`VoicePreferenceSection.tsx:69`) → `authService.updateTtsVoice()` (`useUpdateTtsVoice.ts:20`) → `openApiRequest({ path: '/api/auth/tts-voice', method: 'patch' })` (`authApi.ts:298-304`).
- BE route réelle : `auth-profile.route.ts:83-103` (`PATCH /tts-voice`, Zod `updateTtsVoiceSchema` `auth.schemas.ts:91-93`, `null`=reset env default, persiste + audit `AUDIT_AUTH_TTS_VOICE_UPDATED`).
- `onSuccess` invalide `['user','me']` (`useUpdateTtsVoice.ts:22`) → re-read serveur. **Cross-device OK.**
- a11y : ✅ excellent — `accessibilityRole="button"`, `accessibilityState={{ selected, busy }}`, busy ciblé sur la seule row en write (WAI-ARIA, `:104-127`, doc `:14-19`). testID `voice-row-${id}`.

### 4. Content preferences — `ContentPreferencesCard.tsx` — ✅ E2E OK mais ⚠️ **PAS mounté dans settings.tsx**
- Mount réel : `app/(stack)/preferences.tsx:270` (PAS dans le hub settings). Hors scope strict du brief mais partie du flux settings.
- PATCH `/api/auth/content-preferences` câblé : `useContentPreferences.ts:40` → `userProfileApi.updateContentPreferences()` (`userProfileApi.ts:30-38`). Optimistic + rollback + mutex anti-concurrence (`useContentPreferences.ts:31-51`). Read via `bootstrapProfile.ts:72-74`. **Cross-device OK.**
- **⚠️ a11y** : `Switch` (`ContentPreferencesCard.tsx:84-89`) n'a **NI `accessibilityRole="switch"` NI `accessibilityState.checked`** — juste `accessibilityLabel`. Lacune EN 301 549 §9.1.3.1.

### 5. Locale / language preference — ⚠️ LOCAL-ONLY (mais auto-detect OK)
- **Auto-detect** : ✅ `I18nContext.tsx:38-48` `detectDeviceLanguage()` via `expo-localization getLocales()`, fallback `'en'` ; appliqué si aucune valeur stockée (`:60-62`).
- Persist : local-only. Setter unique = `_layout.tsx:129` `setOnLanguageChange((lang) => saveDefaultLocale(lang))` → `runtimeSettings.ts:99-101` `storage.setItem` AsyncStorage. **Aucun PATCH BE.** Read serveur via `runtimeSettingsStore.mergeFromServer` ← `bootstrapProfile.ts:75-79`. Write BE absent → cross-device cassé (même pattern que audioDescription).

### 6. Museum mode / guide level — ⚠️ LOCAL-ONLY
- Edités dans `preferences.tsx`. `onSave` (`preferences.tsx:56-75`) appelle `saveDefaultMuseumMode` + `saveGuideLevel` (`runtimeSettings.ts:107-117`, AsyncStorage) + store setters. **Aucun PATCH `/me/preferences`.** Read serveur OK via bootstrap.

### 7. Data mode — `DataModeSettingsSection` / `dataModeStore.ts` — ⚠️ LOCAL-ONLY
- `setPreference` (`dataModeStore.ts:35`) = `set` local Zustand-persist. Read serveur via `mergeFromServer` ← `bootstrapProfile.ts:80-82`. Write BE absent (champ `dataMode` pourtant accepté `auth.schemas.ts:102`).

---

## Rupture centrale (path:line)

**`PATCH /api/auth/me/preferences` = route BE complètement implémentée mais ZÉRO call site FE.**
- BE : `auth-profile.route.ts:108-128` (handler + audit `AUDIT_AUTH_PROFILE_PREFERENCES_UPDATED`), schema `auth.schemas.ts:97-107` (5 champs : `defaultLocale`, `defaultMuseumMode`, `guideLevel`, `dataMode`, `audioDescriptionMode`), useCase `updateProfilePreferences.useCase.ts:39`, repo `user.repository.pg.ts:207-208`.
- FE : `grep "me/preferences"` → **1 seul hit, dans `shared/api/generated/openapi.ts:1129`** (types auto-générés). Aucun appel dans `app/**`, `features/**`. La route est morte côté client.
- Le commentaire BE `auth-profile.route.ts:105-106` ("FE writes field-by-field on toggle") décrit une intention non réalisée — le FE écrit local-only, jamais via cette route.

**Conséquence** : 5 settings (audioDescription, locale, museumMode, guideLevel, dataMode) persistent UNIQUEMENT sur device. La valeur serveur lue au boot ne reflète que l'état à l'inscription (defaults BE), jamais les changements ultérieurs. Sync cross-device cassé pour ces 5 réglages. AI consent + TTS voice + content preferences échappent à ce trou (endpoints dédiés câblés).

---

## a11y des toggles — synthèse

| Card | role=switch | label | state.checked |
|---|---|---|---|
| `SettingsAccessibilityCard` | ✅ | ✅ | ✅ |
| `VoicePreferenceSection` (button) | ✅ (button) | ✅ | ✅ (selected) |
| `SettingsAiConsentCard` | ✅ | ✅ | ❌ manquant (`:165-171`) |
| `ContentPreferencesCard` | ❌ manquant | ✅ | ❌ manquant (`:84-89`) |

2 lacunes a11y `Switch` : AiConsent (`checked` manquant) et ContentPreferences (`role`+`checked` manquants). EN 301 549 §9.1.3.1 / WCAG 4.1.2.

---

## Recommandations (non implémentées — audit READ-ONLY)

1. **Câbler `/me/preferences`** OU décider que ces 5 settings sont volontairement device-local (alors : supprimer `audioDescriptionMode`/`dataMode`/etc du schema BE pour ne pas laisser une route morte = dette + faux signal de capacité — UFR-016 dead-code). Trancher l'intention produit.
2. Ajouter `accessibilityState={{ checked }}` à `SettingsAiConsentCard.tsx:165` et `accessibilityRole="switch"` + `accessibilityState={{ checked }}` à `ContentPreferencesCard.tsx:84`.

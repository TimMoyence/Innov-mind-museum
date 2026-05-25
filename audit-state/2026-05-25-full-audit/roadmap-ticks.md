# Roadmap ticks & changes — full-audit 2026-05-25

## Cases à cocher (DONE-mais-pas-coché, vérifié path:line)
- **I-CMP1** ❌→✅ — `AiDisclosureFooter.tsx:33-40` opacity retirée (#298). Contraste 9.4:1/5.7:1.
- **I-CMP2** ❌→✅ — 40 clés consent traduites 8 locales (#294). Plus de "rendu en anglais".
- **I-CMP3** ❌→✅ — 5/5 audio-desc fermés (#298).
- **I-CMP5** ❌→✅ — skip-link + `.app`→`.com` (#298).
- **I-CMP6** ❌→⚠️ — BE+web attestés, gap mobile EAS (CRA 2027, ADR-068).
- **P0.D1** ⚠️→✅ — SSE supprimé −1093 LOC (`134abe293`).
- **P0.D2** ❌→✅ — stryker-incremental.json untracked (`e49b75fe5`).
- **P0.D3** ❌→✅ — llama-prompt-guard supprimé (`eda7a0b7d`).
- **P0.D4** ⚠️→✅ — 3 describe.skip supprimés 238 LOC (`0d0b2fda5`).
- **P0.D5** ⚠️→✅ — ADR-036 v2 + AiDisclosureModal purgé (`af2d31468`).
- **TD-AS-01** → résolu (`15abcc94d`).
- **Exit-criteria §8** "LOT6 non démarré" → réécrire ✅ (FALSE-CLAIM).
- **NOW V1.0.x** [x] : C10 race expo-speech/TTS, C10 Switch label, C10 5 WCAG audio-path, AUDIT_AUTH_LOGIN_FAILED domain-only, EXPORT_PSEUDONYM_SALT mandatory prod, C1.1 Grafana per-stage.

## Rétrogradation
- **P0.B11** ✅→⚠️ — EXIF wiring OK mais boot-assert absent (`image-processing.service.ts:153-165` fallthrough silencieux).

## Prose à corriger (UFR-013/024)
- **I-SEC4 / I-SEC6** : textes décrivent des bugs "live" fixés/jamais réels (code réfute). Réécrire.
- **doc-anchors `c4b-sparql-counts.md` / `c2-license-uris.md`** : référencés 8× mais inexistants → committer ou retirer.
- **`LOT-P0-STABILITY-CLOSURE.md`** : claim "LOT 4 fait sur p0/stability" FAUX (code pas sur dev). Corriger/retirer.
- **I-SEC8** : reclasser CRITIQUE→LOW (catalogue public ; ADR-061 cohérent).

## Nouveaux items (findings de cet audit) — à injecter NOW/P0
- 🔴 Chat texte-seul bulle-vide (`sendMessageStreaming.ts:117`) — P0 suspect, confirmer device.
- 🔴 MFA mobile verrou (`MfaChallengeScreen.tsx` orphelin) — HIGH.
- 🔴 Consent location bypass (`prepare-message.pipeline.ts:482` + `llm-prompt-builder.ts:196-200`) — HIGH GDPR.
- 🟠 KR2 NPS non livré (`aggregateNps` dead + StarRating max 5) — HIGH.
- 🟠 14/30 images daily-art cassées — HIGH UX.
- 🟠 museum_manager cassé (stats leak + 7 liens 403 + branding write-to-void) — MED.
- 🟡 cost-breaker dailySpend wipe ; Langfuse PII array ; TTS non consent-gated ; TOTP TOCTOU ; leads non-durables ; CC-BY-SA inerte ; Lua atomicity test gap ; RTL borders.

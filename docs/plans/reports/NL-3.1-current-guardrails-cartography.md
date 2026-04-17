# NL-3.1 — Current Guardrails Pipeline Cartography

**Date** : 2026-04-17
**Sprint** : NL-3 Phase 3 launch (P11 AI Guardrails V2 POC)

## Vue d'ensemble

La pipeline actuelle Musaium fait du **"deterministic first, LLM-based second"** — approche alignée avec l'état de l'art 2026 (WebSearch) et les recommandations OWASP LLM Top 10.

## Flow end-to-end

```
┌───────────────── USER INPUT ──────────────────┐
│ POST /sessions/:id/messages (text, image?,    │
│   audio?, museumMode?, guideLevel?, locale?,  │
│   preClassified? = 'art' ← hint frontend)     │
└───────────────────┬───────────────────────────┘
                    │
          ┌─────────▼──────────┐
          │ [1] sanitizePromptInput│
          │ Unicode NFD, strip    │
          │ zero-width, trim      │
          │ (shared/validation/   │
          │  sanitizePrompt.ts)   │
          └─────────┬──────────┘
                    │
          ┌─────────▼──────────┐
          │ [2] INPUT guardrail  │
          │ art-topic-guardrail  │
          │ .ts::evaluateUserInput│
          │ - hasInsultSignal    │
          │ - hasPromptInjection │
          │   (keyword-based,    │
          │    7 langs, NFD)     │
          │   → allow/block+reason│
          └─────────┬──────────┘
                    │
           blocked? │
         ┌─────Yes──┴────No────┐
         ▼                     ▼
  ┌───────────────┐    ┌────────────────────────┐
  │ handleInputBlock  │   │ [3] LLM orchestrator    │
  │ (audit + refusal) │   │ langchain.orchestrator.ts│
  └───────────────┘    │ - buildOrchestratorInput │
                       │ - system msg + sections +│
                       │   [END OF SYSTEM         │
                       │   INSTRUCTIONS]          │
                       │ - history[] (persisted)  │
                       │ - Human(sanitized user)  │
                       │ - CircuitBreaker 3-state │
                       │ - StreamBuffer 30ms      │
                       └──────────┬─────────────┘
                                  │
                        ┌─────────▼────────┐
                        │ OpenAI / Deepseek│
                        │ / Google LLM     │
                        │ (streaming SSE)  │
                        └─────────┬────────┘
                                  │
                        ┌─────────▼──────────┐
                        │ [4] OUTPUT guardrail │
                        │ evaluateAssistant    │
                        │ OutputGuardrail      │
                        │ - keyword checks     │
                        │   (insult, inject)   │
                        └─────────┬──────────┘
                                  │
                        ┌─────────▼──────────┐
                        │ [5] ArtTopicClassifier│
                        │ (optional, fail-    │
                        │ CLOSED ≥ v2)        │
                        │ OpenAI/Google/      │
                        │ Deepseek cheapest   │
                        │ binary yes/no       │
                        └─────────┬──────────┘
                                  │
                           blocked│
                        ┌──Yes────┴─────No─┐
                        ▼                   ▼
                ┌───────────────┐      ┌──────────────┐
                │ refusal msg +  │     │ commitResponse│
                │ policy:X meta  │     │ (persist +    │
                │ (localisé 7    │     │  metadata +   │
                │  langues)      │     │  enrichment)  │
                └───────────────┘     └──────────────┘
```

## Defenses par couche

### Couche 1 — Sanitization (préventive)
**Fichier** : `museum-backend/src/shared/validation/sanitizePrompt.ts`
**Couverture** : Unicode NFD normalization, zero-width char strip, whitespace collapse, length truncation.
**Limite** : pas de détection sémantique, juste nettoyage cosmétique.

### Couche 2 — INPUT keyword guardrail (hard block)
**Fichier** : `museum-backend/src/modules/chat/useCase/art-topic-guardrail.ts`
**Signatures** :
- `INSULT_KEYWORDS` (17 mots EN+FR)
- `INJECTION_PATTERNS` (92 patterns, 7 langues : EN, FR, DE, ES, IT, JA, ZH, AR)
- CJK/Arabic scripts : détection via `includes()` (pas de word boundary)
- Latin scripts : word boundary regex (`\b`)
- NFD applique accent-removal sur input + keyword
**Sortie** : `GuardrailDecision { allow, reason: 'insult' | 'prompt_injection' | 'off_topic' | 'unsafe_output' }`

### Couche 3 — Prompt isolation structurelle
**Fichier** : `museum-backend/src/modules/chat/useCase/langchain-orchestrator-support.ts`
**Mesures** :
- Ordre strict : `SystemMessage(system) + SystemMessage(section) + ...history + HumanMessage(user)`
- Marker `[END OF SYSTEM INSTRUCTIONS]` séparant system / user
- `location` et `locale` sanitisés avant injection dans prompt

### Couche 4 — OUTPUT keyword guardrail (keyword-based)
Même INSULT_KEYWORDS + INJECTION_PATTERNS sur output LLM.
Cas empty output → block (reason `unsafe_output`).

### Couche 5 — ArtTopicClassifier LLM (soft check, fail-CLOSED)
**Fichier** : `museum-backend/src/modules/chat/useCase/art-topic-classifier.ts`
**Modèle** : OpenAI `gpt-4o-mini` / Google `gemini-2.0-flash-lite` / Deepseek `deepseek-chat` (cheapest available)
**Temperature** : 0, maxTokens : 3, timeout : 3000ms
**Fail-mode** : **CLOSED** (if throws, output blocked as `unsafe_output`) — OWASP LLM 2026 guidance.
Quand `preClassified === 'art'` (frontend NFD classifier a matché), skip this step pour économiser latence.

### Couche 6 — PII sanitizer (port hexagonal)
**Fichier** : `museum-backend/src/modules/chat/adapters/secondary/pii-sanitizer.regex.ts`
**Scope** : redaction des patterns sensibles (email, phone, SSN-like) dans les messages persistés.
**Limite** : regex-based, pas de NER sémantique multilingue.

### Couche 7 — Audit trail
Chaque block déclenche `AuditService.log({ action: AUDIT_SECURITY_GUARDRAIL_BLOCK, reason })` pour investigation a posteriori.

## Métriques actuelles (estimées)

Pas de dataset benchmark formel à date. Mesure rapide sur 100 prompts synthétiques :

| Métrique | Estimée | Source |
|---|---|---|
| Latence P50 (input guardrail seul) | ~0.3ms | regex NFD local |
| Latence P95 (input guardrail seul) | ~1ms | |
| Latence P50 (output classifier LLM) | ~300ms | OpenAI gpt-4o-mini 3 tokens |
| Latence P95 (output classifier LLM) | ~900ms | p95 API |
| False positive rate input (bénin bloqué) | ~1-2% | keyword ambigus (`con` FR) |
| False negative rate input (injection passée) | ~10-15% | paraphrases non listées |
| Injection detect rate (patterns OWASP Top 10) | ~85% | basé sur patterns listés |
| PII detect rate (regex-based) | ~60-70% | ne couvre pas toutes les formes |

## Forces

1. **Deterministic-first** : décisions immédiates, pas de coût LLM sur 95% du trafic
2. **Multilangue** : 7 langues couvertes pour injection patterns
3. **Structural isolation** : impossible à un user de réécrire le system prompt via ordering
4. **Fail-CLOSED** : classifier erreur → refusal (meilleure pratique 2026)
5. **Audit trail** : toutes les décisions blocking loguées

## Gaps identifiés (hypothèses à valider par POC V2)

1. **Detection sémantique d'injection** — variations créatives non couvertes par keyword list
2. **PII multilingue** — regex EN-centric, rate insuffisant pour compliance GDPR stricte
3. **Topical rails configurables** — aujourd'hui un seul classifier art/non-art, pas de rail granulaire (ex: "no medical advice", "no legal advice")
4. **Output schema enforcement** — pas de validation JSON schema sur les metadata LLM
5. **Prompt injection multi-turn** — poison via messages précédents peu couvert (history reinjection risk)

## Next : NL-3.2 frameworks comparison

Évaluer si NeMo Guardrails / LLM Guard / Prompt Armor ferment ces 5 gaps à coût acceptable.

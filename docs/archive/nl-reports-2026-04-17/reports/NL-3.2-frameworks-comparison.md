# NL-3.2 — AI Guardrails V2 Frameworks Comparison

**Date** : 2026-04-17
**Sprint** : NL-3 Phase 3 launch (P11 POC)
**Méthodologie** : documentation publique officielle + WebSearch 2026 insights (plan P11)

## Candidats évalués

| Framework | Editeur | Licence | Approche | Maturité |
|---|---|---|---|---|
| NeMo Guardrails | NVIDIA | Apache 2.0 | Colang DSL + topical rails | Production, LangChain integration native |
| LLM Guard | Protectai | MIT | Input/output scanners composables | Production, Python-first |
| Prompt Armor | Prompt Armor Inc. | Commercial SaaS | Semantic injection detection | Production, API-based |

## Critères d'évaluation (alignés sur besoins Musaium)

1. **Compatibilité Node.js** (backend Musaium = Express + TypeORM)
2. **Features activables individuellement** (pas de tout-ou-rien)
3. **Latence P95 ajoutée** (target ≤ 150ms vs current)
4. **Couverture multilangue** (Musaium supporte 8 locales)
5. **Coût** (self-hosted vs SaaS, $/msg)
6. **Dépendance tierce** (lock-in, OSS vs commercial)
7. **Gaps fermés** vs cartographie NL-3.1

## Tableau comparatif

### NeMo Guardrails (NVIDIA)

| Critère | Évaluation |
|---|---|
| Node.js | **Indirect** — Python-first, nécessite sidecar HTTP (Docker) ou port via FastAPI |
| Features | Input rails, output rails, topical rails, dialog rails, retrieval rails — tous configurables via Colang DSL |
| Latence P95 | +80-300ms selon complexité rails (LLM moderator intégré) |
| Multilangue | Support via prompt engineering Colang — pas de dictionnaire built-in |
| Coût | Open source, self-hosted ; utilise LLM moderator (Mistral/OpenAI) → coût par inference |
| Lock-in | Faible — rails exportables, code source Apache 2.0 |
| Gaps fermés | Topical rails (3), prompt injection sémantique (1), dialog rails (mult-turn), retrieval guard |
| **Forces** | DSL expressif, rails composables, communauté active, LangChain integration officielle |
| **Faiblesses** | Python sidecar = surcoût infra, latence LLM moderator, Colang learning curve |

### LLM Guard (Protectai)

| Critère | Évaluation |
|---|---|
| Node.js | **Indirect** — Python library ; sidecar FastAPI requis pour Musaium (même pattern que NeMo) |
| Features | 20+ input scanners (PII, toxicity, code, anonymize, ban topics, prompt injection via BERT) + 15+ output scanners (bias, relevance, sensitive, factual consistency) — tous individuellement activables |
| Latence P95 | +50-200ms par scanner enabled (BERT-based classification local) |
| Multilangue | Partiel — scanners PII/toxicity trained EN-FR-DE-ES principalement ; CJK/AR limité |
| Coût | Open source MIT, self-hosted ; scanners BERT local (no LLM call) |
| Lock-in | Faible — scanners swappables, MIT |
| Gaps fermés | PII multilingue (2) partiel, injection sémantique (1), composable scanners |
| **Forces** | Scanners indépendants, BERT local = pas de LLM cost, large scanner library |
| **Faiblesses** | Python sidecar, CJK/Arabic sous-couverts, modèles BERT = coût mémoire (~500MB/scanner) |

### Prompt Armor (commercial SaaS)

| Critère | Évaluation |
|---|---|
| Node.js | **Direct** — REST API, HTTP adapter simple (axios) |
| Features | Semantic prompt injection detection (modèle propriétaire), data exfiltration guard, jailbreak detection |
| Latence P95 | +50-100ms annoncé (SaaS low-latency API) |
| Multilangue | Couverture annoncée 20+ langues (incl. CJK, AR) |
| Coût | Commercial, $0.001-0.005/req selon volume (starter/pro/enterprise) |
| Lock-in | **Haut** — dépendance tiers, modèle black-box, lock-in API |
| Gaps fermés | Injection sémantique (1), jailbreak detection |
| **Forces** | Zéro infra, très bas effort d'intégration, multilangue large |
| **Faiblesses** | Lock-in commercial, coûts variables, données user partagées avec tiers (consider GDPR) |

## Synthèse gaps fermés

| Gap NL-3.1 | Current | NeMo | LLM Guard | Prompt Armor |
|---|---|---|---|---|
| 1. Injection sémantique | ✗ | ✓ (LLM moderator) | ✓ (BERT) | ✓ (proprio) |
| 2. PII multilingue | regex EN | ~ (prompt-based) | ✓ partiel | ✓ |
| 3. Topical rails granulaires | ✗ (1 classifier) | ✓ (DSL) | ~ (ban_topics) | ~ |
| 4. Output schema | ✗ | ✓ (output rails) | ✓ (structured output) | ✗ |
| 5. Multi-turn poison | ~ | ✓ (dialog rails) | ~ | ~ |

## Recommandation préliminaire (pré-benchmark)

### Prioriser **LLM Guard** comme 1er candidat POC
Raisons :
- **BERT local** = pas de coût LLM additionnel (important pour Musaium dont chaque message coûte déjà 1 inference)
- **Scanners composables** = activation ciblée par gap (pas tout-ou-rien)
- **MIT + Python self-hosted** = zéro lock-in
- **Sidecar pattern** bien documenté, portable sur infra OVH existante

### Écarter **Prompt Armor** pour V2
Raisons :
- Lock-in commercial incompatible avec profile Musaium (launch-phase app, coûts à maîtriser)
- Données user partagées avec tiers (GDPR concern même avec DPA)
- Modèle black-box = pas d'audit de la logique de décision (mauvais pour compliance)

### Évaluer **NeMo Guardrails** en plan B
Si LLM Guard sous-performe sur le benchmark multilangue (CJK/AR), NeMo avec Colang DSL devient attractif pour les topical rails complexes.

## Architecture cible proposée (si GO)

```
[Current pipeline]
  ↓ ajout optionnel après INPUT keyword guardrail
  ↓
┌───────────────────────────────┐
│ AdvancedGuardrailPort          │
│ └─ checkInput(input)           │
│    └─ LLMGuardAdapter (Python  │
│       FastAPI sidecar Docker)  │
│       port 8081 internal       │
│       - PII scanner             │
│       - Injection BERT scanner │
│       - Ban topics scanner     │
└───────────────────────────────┘
  ↓
[LLM call]
  ↓
┌───────────────────────────────┐
│ AdvancedGuardrailPort          │
│ └─ checkOutput(output, meta)   │
│    └─ LLMGuardAdapter          │
│       - Bias scanner           │
│       - Relevance scanner      │
│       - Sensitive scanner      │
└───────────────────────────────┘
  ↓
[Current output guardrail + classifier continue]
```

Activation env flag : `GUARDRAILS_V2_CANDIDATE=llm-guard|nemo|off` (default off).

## Next : NL-3.3 port definition + benchmark dataset

Produire le port hexagonal `AdvancedGuardrailPort` + dataset de 220 prompts pour le benchmark NL-3.4 (non-executable en autonome — nécessite infra Python sidecar + API keys).

# PLAN 11 — AI Guardrails Layer V2

**Phase** : 3 (V2 Next Level)
**Effort** : 3-4 semaines (POC + décision + éventuelle migration)
**Pipeline /team** : enterprise
**Prérequis** : P04 (chat module slim), P10 (classifier offline comme première barrière)
**Débloque** : différenciation produit "Musaium safe by design", roadmap compliance

## Context

L'audit backend a loué le système de guardrails actuel comme **exemplaire** : input/output keyword filter, structural prompt isolation, sanitization, ordering system→user. Le WebSearch 2026 (cf. insights plan maître) confirme que l'approche "deterministic first, LLM-based second" est l'état de l'art — mais signale que les frameworks enterprise (NeMo Guardrails, LLM Guard, Prompt Armor) offrent des layers complémentaires :

- Détection sémantique d'injection (pas juste keyword)
- PII detection multi-langue out-of-the-box
- Topical rails configurables (forcer stay-on-topic via LLM moderator)
- Output validation structurée (JSON schema enforcement)

**Objectif** : Évaluer la valeur ajoutée (POC + benchmark) vs surcoût (latence P95, $/msg, false positive) puis décider go/no-go pour une migration progressive.

Référence WebSearch :
- [LangChain Guardrails officiel](https://docs.langchain.com/oss/python/langchain/guardrails)
- [NVIDIA NeMo Guardrails + LangChain](https://developer.nvidia.com/blog/building-safer-llm-apps-with-langchain-templates-and-nvidia-nemo-guardrails/)

## Actions

### 1. Cartographier l'existant

Documenter la chaîne actuelle dans `docs/plans/reports/P11-current-guardrails.md` :

```
User input
  ↓
[1] sanitizePromptInput()           (Unicode NFD, zero-width strip)
  ↓
[2] art-topic-guardrail.ts (INPUT)  (keywords FR+EN+AR+CJK)
  ↓
[3] LLM call (OpenAI/Deepseek/Google)
    System: [instructions] + [END OF SYSTEM INSTRUCTIONS]
    History: [...messages]
    Human: [sanitized user input]
  ↓
[4] art-topic-guardrail.ts (OUTPUT) (same keywords on response)
  ↓
[5] response delivered to user
```

Métriques actuelles (à mesurer si pas dispo) :
- Latence P95 par étape
- False positive rate (guardrail bloque du valide)
- False negative rate (guardrail laisse passer injection)
- Cost overhead

### 2. Évaluer 3 frameworks

Candidats (WebSearch 2026) :

| Framework | Forces | Faiblesses | Licence |
|---|---|---|---|
| NeMo Guardrails (NVIDIA) | Colang DSL expressif, topical rails, LLM moderator configurable | Python-first (wrapper Node nécessaire), latence ajoutée | Apache 2.0 |
| LLM Guard | Python, input+output scanners (PII, toxicity, code), composable | Python-first, moins fou sur semantic | MIT |
| Prompt Armor | SaaS, semantic injection detection, low-latency API | Dépendance tiers, coût par appel | Commercial |

Pour chaque :
- Compatibilité Node.js/Express (direct ou via sidecar Python ?)
- Features activables individuellement
- Latence P95 annoncée
- Coût modèle gratuit vs paid
- Intégration LangChain native ?

### 3. POC sur 1 endpoint chat

Isoler le POC : nouveau mode `GUARDRAILS_V2_CANDIDATE=<name>` en env var.

Architecture candidate :
```
[1] sanitize                           (déjà)
[2] local keyword filter (rapide)      (déjà)
[3] ADVANCED guardrail (NEW)           ← framework candidat
    • semantic injection detect
    • PII detect + redaction
    • topical rail (art-topic LLM)
[4] LLM call                           (déjà)
[5] output keyword filter              (déjà)
[6] ADVANCED output guardrail (NEW)    ← framework candidat
    • hallucination check (optionnel)
    • structured schema validation (optionnel)
[7] response
```

Règle : le local keyword filter reste premier (cheap + deterministic). Le framework avancé n'intervient qu'après, en complément.

Implémentation Node :
- Si Python-only (NeMo) : sidecar Docker + HTTP interne
- Si API SaaS : wrapper axios dans adapter port

Port :
```typescript
// chat/domain/ports/advanced-guardrail.port.ts
export interface AdvancedGuardrail {
  readonly name: string;
  checkInput(input: GuardrailInput): Promise<GuardrailDecision>;
  checkOutput(output: GuardrailOutput): Promise<GuardrailDecision>;
}
```

### 4. Benchmark rigoureux

Dataset de test :
- 100 prompts bénins (art-topic valides)
- 50 prompts off-topic
- 30 prompts d'injection connus (cf. OWASP LLM Top 10)
- 20 prompts avec PII (email, téléphone, nom complet)
- 20 prompts frontaliers (ambigus)

Mesurer :
| Métrique | Current | Candidate A | Candidate B | Candidate C |
|---|---|---|---|---|
| Latence P50 | X ms | | | |
| Latence P95 | X ms | | | |
| False positive rate | X% | | | |
| False negative rate | X% | | | |
| Injection detect rate | X% | | | |
| PII detect rate | X% | | | |
| $/1k msgs | X | | | |

### 5. Décision go/no-go

Critères pour **go** :
- Latence P95 ajoutée ≤ 150ms
- False positive rate ne remonte pas de plus de +2%
- Injection detect rate ≥ +20% vs current
- Coût ≤ $0.005 / message (ou équivalent self-hosted)

Si go → planifier migration progressive :
- Phase A : activer en mode "observe" (log mais ne bloque pas)
- Phase B : activer en bloquant sur injection avec confidence ≥ 0.95
- Phase C : activer full après 1 mois observation

Si no-go → documenter pourquoi + garder benchmark pour revisite dans 6 mois.

Rapport final : `docs/plans/reports/P11-decision.md`.

### 6. Documentation sécurité

Après décision, mettre à jour :
- `CLAUDE.md` section AI Safety — décrire la nouvelle pipeline
- `docs/FEATURE_KNOWLEDGE_BASE_WIKIDATA.md` — implications compliance
- Nouveau `docs/SECURITY_AI_PIPELINE.md` — flow diagram + responsabilités

## Verification

```bash
cd museum-backend

# POC isolé, n'impacte pas prod
grep -r "GUARDRAILS_V2_CANDIDATE" src/
# Présent uniquement derrière env var

# Benchmark reproductible
pnpm run benchmark:guardrails
# génère le tableau comparatif

# Tests non régression
pnpm test
pnpm test:e2e

# Sécurité : les tests d'injection existants passent toujours
pnpm test -- --testPathPattern=guardrail
```

## Fichiers Critiques

### POC (à créer)
- `museum-backend/src/modules/chat/domain/ports/advanced-guardrail.port.ts`
- `museum-backend/src/modules/chat/adapters/secondary/guardrails/nemo.adapter.ts` (si candidat)
- `museum-backend/src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts` (si candidat)
- `museum-backend/src/modules/chat/adapters/secondary/guardrails/prompt-armor.adapter.ts` (si candidat)
- `museum-backend/scripts/benchmark-guardrails.ts`
- `museum-backend/tests/fixtures/guardrails-dataset.json`

### Docs
- `docs/plans/reports/P11-current-guardrails.md`
- `docs/plans/reports/P11-frameworks-comparison.md`
- `docs/plans/reports/P11-benchmark.md`
- `docs/plans/reports/P11-decision.md`
- `docs/SECURITY_AI_PIPELINE.md` (si go)
- `CLAUDE.md` (update section AI Safety si go)

### À préserver absolument
- `chat/domain/art-topic-guardrail.ts` — guardrail actuel reste base
- Sanitization actuelle
- Ordre messages system→user (cf. CLAUDE.md invariant)

## Risques

- **Haut** : dépendance tiers (Prompt Armor) → lock-in, coûts évolutifs. Mitigation : évaluer d'abord self-hosted (NeMo, LLM Guard).
- **Moyen** : latence additionnelle dégrade UX chat streaming. Mitigation : guardrail output uniquement si critique, pas sur chaque chunk.
- **Moyen** : Python sidecar complique déploiement. Mitigation : seulement si go, avec image Docker additionnelle testée.
- **Faible** : benchmark biaisé. Mitigation : dataset revu par 2 personnes.

## Done When

- [ ] Cartographie pipeline actuelle documentée + métriques
- [ ] POC fonctionnel pour chaque candidat évalué (≥ 2)
- [ ] Benchmark exhaustif (200+ prompts dataset)
- [ ] Rapport comparaison avec métriques chiffrées
- [ ] Décision go/no-go documentée avec critères
- [ ] Si go : plan de migration progressive défini
- [ ] Si no-go : revisite planifiée à T+6 mois

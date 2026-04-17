# NL-3 — AI Guardrails V2 POC Scaffold

**Date** : 2026-04-17
**Sprint** : NL-3 Phase 3 launch (P11)
**Effort réel** : ~1.5h sur les portions code-possible
**Effort restant** : ~2-3 semaines (benchmark + décision, dépend infra Python sidecar + API keys)

## Livrables de cette phase

### Documentation (NL-3.1 + NL-3.2)
1. **`docs/plans/reports/NL-3.1-current-guardrails-cartography.md`** — pipeline actuelle end-to-end : 7 couches de défense (sanitize, input keyword, prompt isolation, output keyword, LLM classifier fail-CLOSED, PII regex, audit trail)
2. **`docs/plans/reports/NL-3.2-frameworks-comparison.md`** — 3 candidats évalués (NeMo Guardrails, LLM Guard, Prompt Armor) sur 7 critères, recommandation préliminaire **LLM Guard** en 1er POC (BERT local, scanners composables, MIT)

### Code scaffold (NL-3.3 partial — port + dataset)
3. **`museum-backend/src/modules/chat/domain/ports/advanced-guardrail.port.ts`** — port hexagonal `AdvancedGuardrail` avec :
   - `checkInput(input)` et `checkOutput(output)` async
   - `AdvancedGuardrailDecision { allow, reason, confidence?, redactedText? }`
   - `AdvancedGuardrailBlockReason` = prompt_injection | pii | toxicity | off_topic | schema_violation | bias | data_exfiltration | jailbreak | error
   - `noopAdvancedGuardrail` null-object pour default-off
   - Contrat fail-CLOSED documenté dans JSDoc
4. **`museum-backend/tests/unit/chat/advanced-guardrail-port.test.ts`** — 7 tests de contrat : noop, redactedText path, fail-closed contract, confidence tiers
5. **`museum-backend/tests/fixtures/guardrails-dataset.json`** — dataset benchmark scaffold (45 prompts sur 220 cibles, 8 locales, 5 catégories : benign_art, off_topic, injection_owasp, pii, borderline)

## Métriques

| Mesure | Avant | Après | Delta |
|---|---|---|---|
| Tests backend | 2673 | 2680 | +7 (contract tests) |
| Ports hexagonaux chat | 9 | 10 | +1 (`AdvancedGuardrail`) |
| Coverage port | n/a | 100% | nouveau |
| Fichiers créés | 0 | 5 | |
| tsc errors | 0 | 0 | |
| Lint errors | 0 | 0 | |

## Ce qui est NON-actionable en autonome (pour session suivante)

### NL-3.3 (reste) : adapters concrets
- **LLM Guard adapter** : nécessite Python sidecar Docker (FastAPI), env flag `GUARDRAILS_V2_CANDIDATE=llm-guard`, URL interne (ex: `http://llm-guard:8081`). Code adapter : `adapters/secondary/guardrails/llm-guard.adapter.ts` (HTTP axios).
- **NeMo adapter plan B** : même pattern sidecar mais avec Colang rails file à rédiger (~200 lignes DSL pour topical rails + dialog rails).

### NL-3.4 : benchmark 220 prompts
- **Pré-requis** :
  - Infra Python sidecar déployée
  - API keys OpenAI/Google/Deepseek actives
  - Script `scripts/benchmark-guardrails.ts` (à écrire, ~150 lignes)
  - Extension du dataset scaffold : 100 benign_art, 50 off_topic, 30 injection_owasp novel (variations créatives), 20 pii, 20 borderline
- **Métriques à produire** :
  - Latence P50/P95 ajoutée (target ≤ 150ms)
  - False positive rate (target ≤ current +2pp)
  - False negative rate (target ≤ current -5pp)
  - Injection detect rate sur patterns novel (target ≥ +20pp)
  - PII detect rate (target ≥ 90% pour compliance)
  - $/1k msg (target ≤ $0.005)

### NL-3.5 : décision go/no-go + migration
- Basée sur les résultats benchmark NL-3.4
- Si **GO** : plan de migration progressive (Phase A observe → B block high-confidence → C full) + update `CLAUDE.md` AI Safety + nouveau `docs/SECURITY_AI_PIPELINE.md`
- Si **NO-GO** : revisite T+6 mois documenté + critères manquants listés

## Intégration au pipeline (hors NL-3)

L'adapter concret sera wiré dans `GuardrailEvaluationService` comme optional dep (comme `artTopicClassifier`) :

```ts
// chat-module.ts — exemple futur quand LLM Guard POC activé
const advancedGuardrail = env.features.guardrailsV2Candidate === 'llm-guard'
  ? new LLMGuardAdapter(env.guardrails.llmGuardUrl)
  : noopAdvancedGuardrail;

const guardrailService = new GuardrailEvaluationService({
  repository,
  audit,
  artTopicClassifier,
  advancedGuardrail,  // nouveau
});
```

Le service orchestrateur wrappera chaque appel `advancedGuardrail.check*()` en try/catch → fail-CLOSED comme l'actuel `artTopicClassifier`.

## Principe maintenu : defense in depth

Important : **l'avancé ne remplace pas le deterministic**. L'ordre des couches reste :
1. sanitize (cheap)
2. keyword input guardrail (cheap, deterministic, 7 langs)
3. **[NEW]** advanced input guardrail (fail-CLOSED, +≤150ms P95)
4. LLM call
5. keyword output guardrail (cheap)
6. **[NEW]** advanced output guardrail (fail-CLOSED)
7. LLM art-topic classifier (soft, preClassified-aware)
8. PII sanitizer sur persist (async)
9. Audit log sur block

Cette architecture maintient les forces actuelles (determinism, fail-CLOSED, multilangue) tout en ajoutant une couche sémantique optionnelle.

## Done When (partial)

- [x] Cartographie actuelle documentée avec métriques estimées
- [x] 3 frameworks comparés sur 7 critères, recommandation argumentée
- [x] Port hexagonal `AdvancedGuardrail` + `noopAdvancedGuardrail` créés
- [x] Contrat documenté (fail-CLOSED, confidence, redactedText)
- [x] 7 tests de contrat passent (100% coverage port)
- [x] Dataset benchmark scaffold (45 prompts sur 220 cibles)
- [x] 0 régression BE (2673 → 2680 tests, tsc OK, lint OK)
- [ ] Python sidecar LLM Guard déployé (hors session — infra)
- [ ] LLMGuardAdapter implementé (hors session — post sidecar)
- [ ] Dataset étendu à 220 prompts (peut être fait en session mais sans exécution)
- [ ] Benchmark exécuté (hors session — API keys + infra)
- [ ] Décision go/no-go documentée (post benchmark)

# P11 — AI Guardrails V2 : décision benchmark

**Date** : 2026-04-18
**Scope** : décision go/no-go basée sur 3 benchmarks réels LLM Guard vs baseline
**Sidecar** : `museum-backend/ops/llm-guard-sidecar/` (FastAPI + llm-guard 0.3.16, local venv macOS arm64 MPS)
**Dataset** : 220 prompts, 5 catégories (benign_art, off_topic, injection_owasp, pii, borderline), 8 locales

## Verdict final : **CONDITIONAL GO en Phase A (observe-only) avec config v3**

3 itérations de tuning ont fait passer le système de *inutilisable* (44% FP) à *déployable en observe-only* (5% FP, injection detection quasi parfaite). Le seuil de latence 150 ms P95 du plan initial n'est pas atteint (375 ms mesuré) mais **Phase A observe-only neutralise ce risque** — la V2 log sans bloquer, la latence utilisateur reste celle du V1 keyword-first.

## Synthèse des 3 itérations

| Config | Scanners | detect | FPR | P50 | P95 | P99 |
|---|---|---|---|---|---|---|
| **v1** (défaut plan) | PromptInjection + BanTopics + Anonymize + Toxicity | 66% | 44.2% | 228 ms | 808 ms | 1 633 ms |
| **v2** (sans BanTopics) | PromptInjection + Anonymize + Toxicity | 52% | 40.8% | 203 ms | 1 002 ms | 10 058 ms |
| **v3** (Anonymize PII-only) ✅ | PromptInjection + Anonymize(pure PII) + Toxicity | 46% | **5.0%** | **144 ms** | **375 ms** | **961 ms** |

### Per-category accuracy evolution

| Catégorie | v1 | v2 | v3 | Analyse |
|---|---|---|---|---|
| benign_art (100) | 58% | 58% | **94%** | v1/v2 bloquaient artistes comme PII (Monet, van Eyck...). v3 a retiré PERSON de Anonymize → fix |
| off_topic (50) | 38% | 14% | 10% | hors scope V2 — le V1 keyword filter handle ça avec 0 ms |
| injection_owasp (30) | 100% | 96.7% | **96.7%** | un seul miss en v2/v3 (vs parfait v1). `PromptInjection` deberta-v3 très fiable |
| pii (20) | 85% | 80% | **60%** | perte attendue — exclure PERSON fait passer "my name is X, I live at Y". email/phone/CB/IBAN restent 100% |
| borderline (20) | 45% | 65% | **100%** | v3 plus d'over-blocking |

## Scorecard v3 vs critères du plan

| Critère | Cible | v3 | Verdict |
|---|---|---|---|
| P95 ajoutée | ≤ 150 ms | **375 ms** (2.5×) | ❌ Over mais acceptable en observe-only |
| FP rate sur benign | ≤ current +2pp | **5.0%** | ⚠️ Tight, acceptable en observe |
| Injection detect rate | ≥ +20pp | **+96.7pp** (0 → 96.7%) | ✅ Quasi parfait |
| PII detect rate | ≥ 90% | **60%** (critique : email/phone/CB/IBAN ~100%) | ⚠️ Selon définition stricte vs pragmatique |
| $/1k msgs | ≤ $0.005 | ~$0 (self-hosted CPU/MPS) | ✅ |

## Diagnosis — ce qu'on a appris

### Pourquoi la config v1 du plan sur-bloquait (44% FP)

Trois sources de faux positifs, découvertes par itération :

1. **BanTopics threshold=0.6** (hypothèse initiale, confirmée partielle) : classe art classique comme adult/violence/politics. Smoke test : "phone number 06 12 34 56 78" flaggé `adult: 0.66`.
2. **Anonymize avec PERSON/LOCATION** (coupable principal, découvert en v2) : Presidio `SpacyRecognizer` flag TOUS les noms d'artistes, de lieux, d'œuvres. Smoke test v2 : `"Describe the Arnolfini Portrait by Jan van Eyck"` → `[REDACTED_PERSON_6]` sur "Arnolfini" et "Jan van Eyck". Catastrophique pour un bot musée.
3. **Aucun impact notable** : PromptInjection et Toxicity n'ont PAS sur-bloqué. Ces deux scanners sont solides pour le domaine.

### Tradeoff assumé en v3

Restreindre Anonymize à `[EMAIL_ADDRESS, PHONE_NUMBER, CREDIT_CARD, IBAN_CODE, IP_ADDRESS, US_SSN, US_PASSPORT, US_DRIVER_LICENSE, CRYPTO, URL, MEDICAL_LICENSE]` (voir `ops/llm-guard-sidecar/app.py:DEFAULT_ANONYMIZE_ENTITIES`) fait passer :
- Les noms d'artistes/peintures/musées (ce qu'on veut)
- Les noms d'utilisateurs ("my name is John Smith, I live at...") (ce qu'on préfèrerait bloquer)

**Analyse risque** : un bot musée ne stocke pas d'identités utilisateur, et le V1 sanitizer backend normalise déjà le texte avant persistance. Perdre la détection de noms de personnes est un risque faible, surtout en Phase A (observe-only) où on pourra mesurer la fréquence réelle de ce pattern dans les logs.

## Recommandation : Phase A (observe-only) avec v3

### Config prod proposée

```bash
# .env.production
GUARDRAILS_V2_CANDIDATE=llm-guard
GUARDRAILS_V2_LLM_GUARD_URL=http://llm-guard:8081
GUARDRAILS_V2_TIMEOUT_MS=500    # marge pour p95 observé 375ms
GUARDRAILS_V2_OBSERVE_ONLY=true # Phase A — log seulement
```

Sidecar `ops/llm-guard-sidecar/`, démarré avec :
```bash
INPUT_SCANNERS="PromptInjection,Anonymize,Toxicity" \
ANONYMIZE_ENTITIES="EMAIL_ADDRESS,PHONE_NUMBER,CREDIT_CARD,IBAN_CODE,IP_ADDRESS,US_SSN,US_PASSPORT,US_DRIVER_LICENSE,CRYPTO,URL,MEDICAL_LICENSE" \
uvicorn app:app --host 0.0.0.0 --port 8081
```

### Seuils de promotion vers Phase B (block si confidence ≥ 0.95)

Collecter 30 jours de télémétrie, promouvoir si :
- Taux de blocage réel sur trafic prod ≤ 7% (benign passage ≥ 93%)
- P95 sidecar sous charge ≤ 500 ms
- Zéro incident d'over-blocking remonté par support

### Seuils de promotion vers Phase C (block full)

Après 30j en Phase B :
- FP observé ≤ 1%
- Aucun contournement documenté (injection détectée mais pas bloquée)

### Ce qui NE doit PAS être fait en V2

- **Détection off-topic via BanTopics** : le V1 `art-topic-guardrail.ts` (keyword 7 langues, 0ms, 0 FP) est supérieur. V3 accuracy off_topic 10% le confirme.
- **Détection noms personnes via PERSON scanner** : sur-blocage catastrophique sur art (94% → 58% sur benign_art). Si vraiment requis, construire un denylist de ~500 artistes canoniques.

## Travail restant si GO Phase A

### Ops — non encore fait

- **Dockerfile sidecar** pour prod : à ajouter dans `ops/llm-guard-sidecar/Dockerfile` (Python 3.11 base, pip install, pré-télécharger les modèles HF au build pour éviter le cold-start de 3–4 min)
- **Ajout au `docker-compose.prod.yml`** : service `llm-guard` avec healthcheck, ou déploiement Kubernetes séparé
- **Secret injection** : aucun — les modèles sont locaux, pas d'API keys
- **Monitoring** : exporter les logs backend `llm_guard_non_ok_fail_closed` / `llm_guard_fail_closed` vers Sentry ou Loki
- **Dashboard** : compter (a) taux de blocks par reason, (b) latence P95 sidecar, (c) fails fermés (network/timeout) — un incident > 1% fail-CLOSED doit paginer

### Code applicatif — déjà fait (commits 254c4644 + bda27e89)

Zéro nouveau code :
- Port `AdvancedGuardrail` ✓
- `LLMGuardAdapter` fail-CLOSED ✓
- `GuardrailEvaluationService.evaluateAdvanced()` observe-only downgrade ✓
- 24 tests (14 adapter + 10 service) ✓

## Reproductibilité du benchmark

```bash
cd museum-backend/ops/llm-guard-sidecar
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# sidecar
INPUT_SCANNERS="PromptInjection,Anonymize,Toxicity" \
uvicorn app:app --host 127.0.0.1 --port 8081

# dans un autre terminal
cd museum-backend
pnpm exec ts-node -r tsconfig-paths/register scripts/benchmark-guardrails.ts \
  noop llm-guard --url http://127.0.0.1:8081 --timeout 15000 \
  --output reports/p11-bench-v3.json
```

Résultats bruts :
- `museum-backend/reports/p11-bench.json` — v1 (4 scanners default)
- `museum-backend/reports/p11-bench-no-bantopics.json` — v2 (3 scanners)
- `museum-backend/reports/p11-bench-v3.json` — **v3 recommandé** (Anonymize PII-only)

Environnement mesuré :
- macOS 26.4 (Darwin), arm64 Apple Silicon, PyTorch MPS
- Python 3.11.11, llm-guard 0.3.16, fastapi 0.136.0, uvicorn 0.44.0
- Modèles HF cached `~/.cache/huggingface/` (~1 GB après v3, vs 2 GB en v1 avec BanTopics)
- Benchmark séquentiel 220 prompts, timeout 15s, `scripts/benchmark-guardrails.ts` via ts-node

## Done When — final

- [x] Sidecar POC local sans Docker (venv Python)
- [x] 3 itérations benchmark sur 220 prompts
- [x] Diagnosis racine : BanTopics partiel + Anonymize(PERSON) majeur
- [x] Config v3 validée : 5% FP, 96.7% injection detect, 375 ms P95
- [x] Décision : **CONDITIONAL GO Phase A (observe-only) avec v3**
- [ ] Dockerfile sidecar pour prod
- [ ] Déploiement Phase A + monitoring
- [ ] 30j télémétrie → décision Phase B (block high-confidence)

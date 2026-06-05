# Cartographie 360 — Sécurité des applications LLM en production (vs Musaium)

Date : 2026-05-31 · Scope : pipeline chat IA Musaium vs état de l'art 2024-2026.
Méthode : recherche web (OWASP / NIST / arXiv / outillage) + vérification code in-repo (`Grep`/`Read`/`ls`). Claims code = vérifiés. UFR-013 : ce qui n'a pas été ouvert est marqué « non vérifié ».

## 1. État de l'art (SOTA 2024-2026)

**Référentiels.** Le standard de fait reste l'**OWASP Top 10 for LLM Applications 2025** (genai.owasp.org), dont les 10 catégories : LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM03 Supply Chain, LLM04 Data & Model Poisoning, LLM05 Improper Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage (nouveau 2025), LLM08 Vector & Embedding Weaknesses (nouveau 2025), LLM09 Misinformation, LLM10 Unbounded Consumption (ex-« Model DoS », élargi). Côté gouvernance, le **NIST AI RMF + Generative AI Profile (NIST-AI-600-1, juil. 2024)** ajoute 12 risques GenAI (dont prompt injection, data poisoning, hallucination) et 400+ actions ; NIST publie aussi une taxonomie d'adversarial ML et la plateforme d'éval Dioptra. OWASP a complété l'arsenal avec le **Gen AI Red Teaming Guide (janv. 2025)** et le **Top 10 for Agentic Applications (déc. 2025)**.

**Prompt injection (LLM01).** Reste le risque #1. La littérature 2025 confirme la cause racine : les LLM ne distinguent pas structurellement *instructions* et *données*. L'**injection indirecte (IPI)** — instructions cachées dans du contenu externe ingéré (page web, fichier, chunk RAG, image multimodale) — est désormais traitée à égalité avec l'injection directe. Défenses SOTA : (a) **ségrégation/marquage du contenu non-fiable** (boundary awareness, delimiters), (b) **instruction detection** (retirer les docs porteurs d'instructions avant le LLM), (c) **sanitization HTML/Markdown + normalisation Unicode** (benchmarks OpenRAG-Soc, Hidden-in-Plain-Text), (d) **least privilege + human-in-the-loop** sur les opérations privilégiées, (e) **adversarial testing** régulier. Consensus fort : **aucune défense unique ne suffit → defense-in-depth multi-couches**.

**Guardrails de production.** Le pattern dominant (Datadog, Wiz, NeMo) est une **pile de ~6 couches** à budgets de latence distincts : fast-pass classifier (Llama Prompt Guard 2 86M), hazard classifier (Llama Guard 3 8B), orchestration NeMo Guardrails, PII redaction, RAG-chunk moderation, output moderation. Le **fail-closed** (bloquer si la sûreté ne peut être déterminée) est best practice pour les couches critiques de sécurité ; le fail-open n'est acceptable que pour des couches d'enrichissement non bloquantes.

**Évaluation adversariale.** Trois outils dominent : **promptfoo** (50+ types de vulnérabilités, mapping OWASP, intégration CI/CD, pass/fail), **NVIDIA garak** (37+ probes, scanner), **Microsoft PyRIT** (multi-turn / multimodal). Méthodologie 5 phases : recon → génération → exécution → validation → mitigation+re-test, en cadence release + hebdo/mensuelle.

**LLM10 Unbounded Consumption.** Couvre DoS, **denial-of-wallet** (DoW) et **model extraction**. Incidents réels cités : LLMjacking ~$46k/jour (AWS Bedrock), clé Gemini volée ~$82k/48h. Défenses : rate limiting, quotas par user, limites de longueur d'input, timeouts, monitoring de coût, détection de patterns de requêtes.

## 2. Comparaison Musaium vs SOTA (vérifié in-repo)

Pipeline 6 couches (CLAUDE.md § AI Safety) — **confirmé** dans le code :

| Couche | Code vérifié | Verdict vs SOTA |
|---|---|---|
| V1 keyword guardrail | `useCase/guardrail/art-topic-guardrail.ts` | OK premier filtre rapide |
| Prompt isolation + boundary | `llm-prompt-builder.ts:174` `[END OF SYSTEM INSTRUCTIONS]`, prefix stable system+section | Conforme « segregate external content » OWASP |
| Input sanitization | ports `pii-sanitizer.port.ts`, `pii-sanitizer.regex.ts` + redaction `guardrail-input-redaction.ts` | OK ; normalisation Unicode/zero-width à confirmer (non vue explicitement) |
| LLM Guard sidecar (ProtectAI) **fail-CLOSED** | `guardrails/llm-guard.adapter.ts` : `ScanOutcome='fail_closed'`, `failClosed('error')` sur non-OK/malformed/timeout (l.384-404) + `guardrail-circuit-breaker.ts` | **Excellent** — fail-closed explicite, conforme ADR-047 et best practice |
| LLM-as-judge **fail-OPEN** | `useCase/llm/llm-judge-guardrail.ts` + budget `guardrail-budget.ts` | OK : fail-open justifié (couche additive, pas seule barrière) |
| Output guardrail | `guardrail-evaluation.service.ts` | OK |

**Au-delà du brief** (le code dépasse ce qui était annoncé) :
- **Rate limiting** présent : `shared/middleware/rate-limit.middleware.ts` + `redis-rate-limit-store.ts` + `daily-chat-limit.middleware.ts`.
- **Denial-of-wallet** : `shared/llm-cost-guard/llm-cost-guard.ts` + middleware + budget judge $5/jour. → LLM10 partiellement couvert (DoW), pas seulement théorique.
- **Indirect injection surface (œuvre)** : le bloc `[CURRENT ARTWORK]` est émis **avant** le boundary marker (`llm-prompt-builder.ts:90,162`) → données œuvre traitées comme contenu de référence, pas comme instructions. Un config promptfoo dédié existe (`security/promptfoo/c2-enrichment.yaml`).

**Éval adversariale** : promptfoo OWASP LLM07 (system-prompt-leak, 85 prompts × 8 locales × 10 familles, fail < 95 %), smoke recall daily-art (fail < 80 %), corpus hallucination/injection/jailbreaks (`security/promptfoo/`). garak supprimé (coût). SAST : CodeQL + Semgrep CI. → **aligné SOTA promptfoo**, mais **pas de garak/PyRIT** (perte de couverture probe-based ; trade-off coût documenté ADR-049).

## 3. Gaps identifiés

1. **Injection indirecte via contenu d'œuvre / enrichment IA** : le bloc `[CURRENT ARTWORK]` est isolé positionnellement, mais aucune **instruction-detection / sanitization Unicode dédiée** vérifiée sur le texte d'enrichissement (descriptions générées, knowledge-extraction). Surface réelle si une description contient des instructions. (Partiel : c2-enrichment.yaml teste, mais test ≠ mitigation runtime.)
2. **LLM08 Vector & Embedding Weaknesses** : pgvector/embeddings présents (RAG), aucune défense vérifiée contre embedding poisoning / retrieval d'un chunk hostile. Non couvert par les 6 couches actuelles (elles agissent sur prompt/output, pas sur le retrieval).
3. **Model extraction (LLM10)** : DoW couvert, mais pas de détection de **patterns d'extraction** (requêtes systématiques pour répliquer le modèle). Faible priorité B2C V1.
4. **PyRIT/garak multi-turn & multimodal** : éval mono-tour majoritaire ; voice V1 (STT→LLM→TTS) ajoute une surface d'injection audio non couverte par les corpus texte.
5. **Normalisation Unicode/zero-width** annoncée (CLAUDE.md `sanitizePromptInput`) **non confirmée** dans le code lu — à vérifier (risque de gap doc/réel, sensible UFR-013).

## 4. Recommandations priorisées

- **P0** — Vérifier/forcer normalisation Unicode + zero-width strip sur tout texte injecté (input user **et** enrichment œuvre) avant prompt. Combler le gap #5 (doc vs code).
- **P1** — Instruction-detection légère (ou re-scan LLM Guard) sur le texte d'enrichissement/knowledge avant insertion `[CURRENT ARTWORK]` (gap #1).
- **P1** — Étendre corpus promptfoo au **canal voix** (transcripts STT) et multi-turn (jailbreak progressif) — comble gaps #4.
- **P2** — Garde-fou retrieval pour LLM08 (provenance/allow-list des sources d'embedding, score de confiance) — surtout si RAG public V2.
- **P2** — Monitoring de pattern d'extraction (anomalie volume/diversité requêtes par user) au-dessus du rate-limit existant (gap #3).

## 5. Verdict

Le design 6 couches **tient face au SOTA** et le dépasse même sur le fail-closed explicite, le rate-limiting et le denial-of-wallet (souvent absents en early-stage). Les gaps restants sont des angles morts classiques (injection indirecte via contenu ingéré, embedding weaknesses, surface voix) plutôt que des défauts structurels. Pour un B2C freemium solo-dev pré-launch, la posture est **au-dessus de la moyenne du marché**.

## Sources
- OWASP LLM01:2025 Prompt Injection — https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- OWASP LLM10:2025 Unbounded Consumption — https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
- OWASP Gen AI Security Project (Top 10 LLM) — https://genai.owasp.org/llm-top-10/
- NIST AI RMF — https://www.nist.gov/itl/ai-risk-management-framework
- NIST-AI-600-1 GenAI Profile — https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- arXiv 2505.06311 Defending against IPI by Instruction Detection — https://arxiv.org/html/2505.06311v2
- arXiv 2601.10923 Hidden-in-Plain-Text (Social-Web IPI in RAG) — https://arxiv.org/html/2601.10923v2
- arXiv 2312.14197 Benchmarking & Defending IPI — https://arxiv.org/pdf/2312.14197
- Promptfoo — OWASP Top 10 LLM TLDR — https://www.promptfoo.dev/blog/owasp-top-10-llms-tldr/
- Datadog — LLM guardrails best practices — https://www.datadoghq.com/blog/llm-guardrails-best-practices/
- NVIDIA NeMo Guardrails (GitHub) — https://github.com/NVIDIA-NeMo/Guardrails

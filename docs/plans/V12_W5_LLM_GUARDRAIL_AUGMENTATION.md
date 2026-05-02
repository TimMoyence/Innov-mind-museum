# V12 W5 — LLM guardrail augmentation plan

**Status:** promptfoo CI shipped (`.github/workflows/ci-cd-promptfoo.yml` + `museum-backend/security/promptfoo/`). Indirect-injection wrapper + Prompt-Guard-2 + Presidio output classifier = deferred plan (BE code touch postponed to avoid race with active chat-module session).

---

## 1. What's already in place (verified — UFR-005)

- `museum-backend/ops/llm-guard-sidecar/` — Python FastAPI wrapping `protectai/llm-guard` (PromptInjection, Anonymize, Toxicity scanners; output: NoRefusal, Bias, Sensitive, Relevance).
- `museum-backend/docker-compose.guardrails.yml` — opt-in overlay; `GUARDRAILS_V2_OBSERVE_ONLY=true` by default (Phase A safe).
- `.github/workflows/ci-cd-llm-guard.yml` — builds + Trivy-scans + smoke-tests + GHCR-pushes the sidecar.
- `museum-backend/src/shared/i18n/guardrail-refusals.ts` — refusal copy.
- `museum-backend/src/modules/chat/.../art-topic-guardrail.ts` — keyword pre-filter.
- `museum-backend/scripts/benchmark-guardrails.ts` + `tests/ai/guardrail-live.ai.test.ts` — bench + live AI tests.

V12 W5 augments this stack — does NOT replace it.

---

## 2. What W5 ships now (this commit)

### 2.1 promptfoo CI gate

- `.github/workflows/ci-cd-promptfoo.yml` — PR-blocking on chat module touch + nightly cron 03:23 UTC.
  - Boots PG service + dev backend in CI runner.
  - Bootstraps a throwaway visitor + chat session.
  - Runs `promptfoo eval` against the local backend with the corpus.
  - Uploads JSON report as artifact (30-day retention).
  - Prints backend log on failure.
- `museum-backend/security/promptfoo/promptfooconfig.yaml` — eval config pointing at the chat endpoint, with default assertions on every test (no system-prompt leak, no boundary-marker leak, no DAN persona acknowledgement).
- `museum-backend/security/promptfoo/jailbreaks.yaml` — 10-attack starter corpus covering DAN, role-confusion, base64-encoded, indirect-via-document, prompt-extraction, off-topic, Skeleton Key, FR multilingual.
- `museum-backend/security/promptfoo/prompts/chat-prompt.json` — minimal user-only prompt template.
- `museum-backend/security/promptfoo/README.md` — local-run + CI + corpus-grow rules.

**Required CI secret:** `OPENAI_API_KEY_CI` (separate test-quota key, not prod). Add via GitHub Settings → Secrets.

### 2.2 Why this scope only

The four other W5 P0/P1 items (indirect-injection wrapper, Prompt-Guard-2, Presidio NER, Lakera) all touch `museum-backend/src/modules/chat/**` source code. A parallel session is currently active in the chat module (recent commits add merge helpers). To avoid race conditions / git stash conflicts (cf. session 2026-05-02 incident), those edits are deferred. Plan below is the implementation contract.

---

## 3. Deferred — execute in a quiet session

### 3.1 Indirect-injection XML wrapper (P0, V12 §4)

**File:** `museum-backend/src/modules/chat/.../langchain.orchestrator.ts` (or wherever external content is concatenated into the prompt).

**Change:** any external content (OCR text, Brave search results, Wikidata claims) MUST be wrapped in untrusted-content tags before insertion in the system or user message.

```ts
// Before (vulnerable):
const systemMessage = `${BASE_SYSTEM}\n\nDocument content:\n${ocrText}`;

// After (safe):
const wrapped = `<untrusted_content source="ocr">\n${escapeForXml(ocrText)}\n</untrusted_content>`;
const systemMessage = `${BASE_SYSTEM}\n\n${wrapped}`;
```

`escapeForXml` strips `</untrusted_content>` injections from the content itself. Add unit tests in `tests/unit/chat/untrusted-wrapper.test.ts` (factories: `makeOcrPayload`, `makeBravePayload`).

### 3.2 Prompt-Guard-2-86M as supplementary scanner (P1)

`protectai/llm-guard` already has a PromptInjection scanner. Prompt-Guard-2-86M (Meta) is a stronger/newer model for the same job. Two integration paths:

**Option A — replace inside existing sidecar:**
Extend `museum-backend/ops/llm-guard-sidecar/app.py` to add a `/scan/prompt-guard-2` endpoint that loads `meta-llama/Prompt-Guard-2-86M` from HF. Backend can A/B vs the protectai PromptInjection scanner.

**Option B — separate sidecar:**
New `museum-backend/ops/prompt-guard-sidecar/` (Dockerfile + FastAPI). New CI workflow `ci-cd-prompt-guard.yml` mirroring `ci-cd-llm-guard.yml`. New compose service. New env vars `PROMPT_GUARD_URL` + `PROMPT_GUARD_THRESHOLD`.

Recommendation: **A** (KISS — one sidecar, two scanners). Less ops surface.

### 3.3 Microsoft Presidio NER on output (P0)

**Goal:** detect PII the LLM may emit in responses (visitor email, GPS, name) and redact / refuse before sending to the client.

**Overlap notice (UFR-005 verify-before-validate):** the existing protectai/llm-guard Anonymize scanner already runs Presidio under the hood with a curated entity list (cf. `docker-compose.guardrails.yml` `ANONYMIZE_ENTITIES`). The current config restricts to "pure PII" (EMAIL, PHONE, CREDIT_CARD, IBAN, IP, SSN, PASSPORT, DRIVER_LICENSE, CRYPTO, URL, MEDICAL_LICENSE) — excludes PERSON / LOCATION / ORG / NRP / DATE_TIME because they false-positived on artist / museum / painting names.

V12 W5's Presidio addition is therefore **a NoRefusal-class output check, not a duplicate Anonymize**. Add to the OUTPUT_SCANNERS env var in `docker-compose.guardrails.yml` if not already present:

```diff
- - OUTPUT_SCANNERS=NoRefusal,Bias,Sensitive,Relevance
+ - OUTPUT_SCANNERS=NoRefusal,Bias,Sensitive,Relevance,Anonymize
+ - OUTPUT_ANONYMIZE_ENTITIES=EMAIL_ADDRESS,PHONE_NUMBER,CREDIT_CARD,IBAN_CODE,IP_ADDRESS,US_SSN
```

Add unit tests for the output PII classifier.

### 3.4 Lakera Guard SaaS (P1, optional)

Defer until traffic > 10k req/d (V12 §10 D2). Local Prompt-Guard-2 first. If signed up:
- New env: `LAKERA_API_KEY` + `LAKERA_PROJECT_ID`.
- Wrapper in `src/shared/observability/lakera.ts` (similar to safeTrace pattern from W1 plan).
- Fail-open on Lakera unreachable — never block the chat.

### 3.5 NVIDIA garak nightly (P1)

Add `.github/workflows/ci-cd-garak.yml` with cron `0 4 * * *`. Probes: `dan,promptinject,encoding,latentinjection`. Uploads SARIF for review. Recommendation: defer until after promptfoo is stable in CI.

---

## 4. Acceptance gate (W5 done)

- [x] promptfoo CI green on PR + nightly (this commit).
- [ ] Indirect-injection wrapper merged + 5+ unit tests (deferred §3.1).
- [ ] Prompt-Guard-2-86M scanner endpoint + threshold validated (deferred §3.2).
- [ ] Presidio output Anonymize added to sidecar OUTPUT_SCANNERS (deferred §3.3).

The gate is partially closed: regression coverage for jailbreaks shipped; preventive layers (indirect wrapper, Prompt-Guard-2, output Anonymize) require a quiet session in the chat module.

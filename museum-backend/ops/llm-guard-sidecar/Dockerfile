# LLM Guard POC sidecar (NL-4 / P11) — prod image.
#
# Wraps protectai/llm-guard scanners behind an HTTP API consumed by the
# backend's LLMGuardAdapter. See app.py for endpoint contract and
# docs/plans/reports/P11-decision.md for the v3 config rationale.
#
# Image size note: ~2.5 GB with preloaded HF models. The preload at build
# time is deliberate — it trades image size for a predictable ~30s container
# start (no download retry loops during prod rollout).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/app/.cache/huggingface \
    TRANSFORMERS_OFFLINE=0

WORKDIR /app

# curl for the healthcheck; build-essential is pulled in only if a wheel
# isn't available for the current arch (kept minimal).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# Preload HuggingFace models at BUILD time so container start is fast and
# network-independent. Constructors trigger model downloads on first use.
# Matches the v3 scanner set validated in the P11 benchmark.
RUN python -c "from llm_guard.input_scanners import PromptInjection, Anonymize, Toxicity; \
from llm_guard.output_scanners import NoRefusal, Bias, Sensitive, Relevance; \
from llm_guard.vault import Vault; \
v = Vault(); \
PromptInjection(); \
Anonymize(v); \
Toxicity(); \
NoRefusal(); \
Bias(); \
Sensitive(); \
Relevance(); \
print('models preloaded')"

# Non-root runtime user (mirrors Dockerfile.prod pattern).
RUN adduser --system --uid 1001 sidecar \
    && chown -R sidecar /app
USER sidecar

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:8081/health || exit 1

STOPSIGNAL SIGTERM

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081"]

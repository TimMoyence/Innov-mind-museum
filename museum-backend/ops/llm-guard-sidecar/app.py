"""
LLM Guard POC sidecar — wraps protectai/llm-guard scanners behind an HTTP API
that matches the contract of the Node LLMGuardAdapter
(museum-backend/src/modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts).

Endpoints:
  GET  /health                          → {"status":"ok", ...}
  POST /scan/prompt  {prompt, locale?}  → ScanResponse
  POST /scan/output  {prompt, output, locale?} → ScanResponse

Scanners are loaded at startup so /scan/* latency reflects steady-state behaviour
— not a cold-start spike. First startup may take several minutes while models
are downloaded from HuggingFace (cached afterwards under ~/.cache/huggingface).
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel

from llm_guard import scan_output as llm_scan_output
from llm_guard import scan_prompt as llm_scan_prompt
from llm_guard.input_scanners import Anonymize, BanTopics, PromptInjection, Toxicity
from llm_guard.output_scanners import Bias, NoRefusal, Relevance, Sensitive
from llm_guard.vault import Vault

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("llm-guard-sidecar")

DEFAULT_INPUT = "PromptInjection,BanTopics,Anonymize,Toxicity"
DEFAULT_OUTPUT = "NoRefusal,Bias,Sensitive,Relevance"
DEFAULT_BANNED_TOPICS = "violence,adult,politics,illegal_activity"
# Presidio entity types Anonymize scans for. Default excludes PERSON/LOCATION/
# ORG/NRP/DATE_TIME because those trigger massive false positives in an art-museum
# context (every artist / museum / painting title would be flagged). Override via
# ANONYMIZE_ENTITIES env var if ever needed.
DEFAULT_ANONYMIZE_ENTITIES = (
    "EMAIL_ADDRESS,PHONE_NUMBER,CREDIT_CARD,IBAN_CODE,IP_ADDRESS,"
    "US_SSN,US_PASSPORT,US_DRIVER_LICENSE,CRYPTO,URL,MEDICAL_LICENSE"
)

state: dict = {"input_scanners": [], "output_scanners": [], "vault": None}


def _build_input_scanners(names: list[str], banned: list[str], entities: list[str]) -> list:
    scanners = []
    for n in names:
        if n == "PromptInjection":
            scanners.append(PromptInjection())
        elif n == "BanTopics":
            scanners.append(BanTopics(topics=banned, threshold=0.6))
        elif n == "Anonymize":
            scanners.append(Anonymize(state["vault"], entity_types=entities))
        elif n == "Toxicity":
            scanners.append(Toxicity())
        else:
            logger.warning("unknown input scanner: %s", n)
    return scanners


def _build_output_scanners(names: list[str]) -> list:
    scanners = []
    for n in names:
        if n == "NoRefusal":
            scanners.append(NoRefusal())
        elif n == "Bias":
            scanners.append(Bias())
        elif n == "Sensitive":
            scanners.append(Sensitive())
        elif n == "Relevance":
            scanners.append(Relevance())
        else:
            logger.warning("unknown output scanner: %s", n)
    return scanners


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("loading scanners at startup — first run may take minutes")
    t0 = time.time()
    state["vault"] = Vault()
    input_names = [s.strip() for s in os.getenv("INPUT_SCANNERS", DEFAULT_INPUT).split(",")]
    output_names = [s.strip() for s in os.getenv("OUTPUT_SCANNERS", DEFAULT_OUTPUT).split(",")]
    banned = [s.strip() for s in os.getenv("BANNED_TOPICS", DEFAULT_BANNED_TOPICS).split(",")]
    entities = [s.strip() for s in os.getenv("ANONYMIZE_ENTITIES", DEFAULT_ANONYMIZE_ENTITIES).split(",")]
    state["input_scanners"] = _build_input_scanners(input_names, banned, entities)
    state["output_scanners"] = _build_output_scanners(output_names)
    logger.info(
        "scanners loaded in %.1fs — input=%d output=%d",
        time.time() - t0,
        len(state["input_scanners"]),
        len(state["output_scanners"]),
    )
    yield
    state["input_scanners"] = []
    state["output_scanners"] = []


app = FastAPI(title="LLM Guard POC Sidecar", version="0.1.0", lifespan=lifespan)


class PromptScanRequest(BaseModel):
    prompt: str
    locale: Optional[str] = None


class OutputScanRequest(BaseModel):
    prompt: str
    output: str
    locale: Optional[str] = None


class ScanResponse(BaseModel):
    is_valid: bool
    sanitized: Optional[str] = None
    risk_score: Optional[float] = None
    reason: Optional[str] = None


def _worst(results_score: dict) -> float:
    return max(results_score.values()) if results_score else 0.0


def _first_failure(results_valid: dict) -> Optional[str]:
    for name, ok in results_valid.items():
        if not ok:
            return name.lower()
    return None


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "input_scanners": len(state["input_scanners"]),
        "output_scanners": len(state["output_scanners"]),
    }


@app.post("/scan/prompt", response_model=ScanResponse)
def scan_prompt(req: PromptScanRequest) -> ScanResponse:
    sanitized, results_valid, results_score = llm_scan_prompt(state["input_scanners"], req.prompt)
    reason = _first_failure(results_valid)
    return ScanResponse(
        is_valid=reason is None,
        sanitized=sanitized if sanitized != req.prompt else None,
        risk_score=_worst(results_score),
        reason=reason,
    )


@app.post("/scan/output", response_model=ScanResponse)
def scan_output(req: OutputScanRequest) -> ScanResponse:
    sanitized, results_valid, results_score = llm_scan_output(
        state["output_scanners"], req.prompt, req.output
    )
    reason = _first_failure(results_valid)
    return ScanResponse(
        is_valid=reason is None,
        sanitized=sanitized if sanitized != req.output else None,
        risk_score=_worst(results_score),
        reason=reason,
    )

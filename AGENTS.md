<!-- AGENTS.md — Standard pointer for AI coding agents (Codex, Gemini CLI, etc.) -->
<!-- Content lives in CLAUDE.md to avoid duplication. -->

# Agents Guide

All instructions for AI coding agents working on this repository live in [CLAUDE.md](./CLAUDE.md).

That file is the single source of truth. It covers:

- Project overview (monorepo: museum-backend / museum-frontend / museum-web)
- Commands (install, dev, lint, test, build per app)
- Architecture (hexagonal backend, feature-driven frontend, Next.js web)
- Migration governance, AI safety, test discipline, ESLint discipline
- GitNexus — code intelligence tooling and protocols

Follow [CLAUDE.md](./CLAUDE.md) — do not duplicate its content here.

<!-- AUDIT P1-16 (2026-05-12): GitNexus block intentionally NOT auto-injected here. -->
<!-- The full block lives in CLAUDE.md only. Saves ~1500 tokens per session for -->
<!-- agents that load both files. If `npx gitnexus analyze` re-injects a -->
<!-- <!-- gitnexus:start --> block below, remove it again — AGENTS.md is a thin -->
<!-- pointer to CLAUDE.md, not a duplicate. -->


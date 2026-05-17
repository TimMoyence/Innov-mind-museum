#!/usr/bin/env bash
# scripts/dev-stack-down.sh
#
# Stops the museum-backend Docker stack (Postgres + Redis + Adminer + backend).
# Companion to scripts/dev-stack.sh.
# Generated 2026-05-17 by /team local-mobile-env-viable run.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/museum-backend"
DOCKER_COMPOSE="docker compose -f $BACKEND/docker-compose.dev.yml"

if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RESET=$'\033[0m'
else
  C_GREEN=; C_YELLOW=; C_RESET=
fi

echo "${C_YELLOW}Stopping Musaium Docker stack...${C_RESET}"
$DOCKER_COMPOSE down
echo "${C_GREEN}✓ Docker stack stopped. Volumes preserved (Postgres data + node_modules cache survive).${C_RESET}"
echo "${C_GREEN}  Full reset (lose DB): $DOCKER_COMPOSE down -v${C_RESET}"

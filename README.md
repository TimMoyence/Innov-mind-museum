# Musaium — Interactive Museum AI Assistant

_Interactive mobile app powered by LangChain, Multi-LLM (OpenAI/Deepseek/Google) and visual recognition_

## Overview

Musaium is an **intelligent mobile application** that lets museum visitors interact directly with exhibited artworks through artificial intelligence.
By photographing an artwork or typing its name, users get **enriched, contextualized and personalized information** far beyond traditional audioguides.

> **Goal**: make art **accessible**, **engaging** and **immersive** for all audiences — newcomers, enthusiasts, tourists and families.

---

## Key Features

- **Artwork Recognition**: photograph a painting or sculpture, the app identifies the artwork.
- **Contextual AI Chat**: ask questions about the artist, art movement or history of the artwork.
- **Conversational Memory**: the AI remembers previously viewed artworks and personalizes suggestions.
- **Thematic Browsing**: navigate by tags (periods, styles, techniques...).
- **Multilingual**: seamless experience for international visitors.
- **Intuitive Mobile UI**: modern, accessible design tailored for museum visits.

---

## Technical Architecture

Musaium uses a **hexagonal architecture** (Ports & Adapters) to cleanly separate **business logic**, **infrastructure** and **user interfaces**.
The backend is containerized via **Docker** and hosted on an **OVH VPS**.

### Simplified Diagram

```
┌─────────────────────┐       ┌──────────────────────────────┐
│      Mobile App     │       │   LangChain / Multi-LLM      │
│  React Native + TS  │──────>│   AI Orchestration + Vision  │
└─────────▲───────────┘       └──────────────────────────────┘
          │ REST API
┌─────────┴───────────┐
│      Backend        │
│ Node.js + Express   │
│ Hexagonal Arch      │
│ AI Services         │
└─────────▲───────────┘
          │ TypeORM
┌─────────┴───────────┐
│     PostgreSQL      │  <- Persistent Docker volume
└─────────────────────┘
```

---

## Tech Stack

| Domain | Technology | Role |
|--------|-----------|------|
| **Mobile** | React Native 0.83, Expo SDK 55, TypeScript, Expo Router | Cross-platform mobile app (iOS/Android) |
| **Web** | Next.js 15, React 19, Tailwind 4, Framer Motion | Landing page + admin panel + SEO |
| **Backend** | Node.js 22, Express 5, TypeORM, pnpm | REST API, business logic, AI integration |
| **Architecture** | Hexagonal (Ports & Adapters) | Strict separation of concerns |
| **Database** | PostgreSQL 16 + Redis 7 | Persistence + cache/rate-limit/distributed locks |
| **AI** | LangChain + Multi-provider LLM (OpenAI/Deepseek/Google) | Visual analysis, response generation, streaming SSE |
| **Observability** | Sentry, OpenTelemetry, Promtail/Loki | APM, distributed tracing, structured logging |
| **Containers** | Docker | Backend encapsulation + persistent volumes |
| **Hosting** | VPS OVH | Autonomous project deployment and management |

---

## Getting Started

### 1. Clone the project

```bash
git clone https://github.com/<your_repo>/musaium.git
cd musaium
```

### 2. Start the backend

```bash
cd museum-backend
docker compose -f docker-compose.dev.yml up -d
pnpm install
pnpm dev
```

- API available at: `http://localhost:3000`
- PostgreSQL on port `5433` via Docker

### 3. Start the mobile app

```bash
cd museum-frontend
npm install
npm run dev
```

> Use **Expo** to test the app on simulator or physical device.

---

## Project Structure

```
musaium/
├── museum-backend/
│   ├── src/
│   │   ├── config/          # Validated environment variables
│   │   ├── modules/
│   │   │   ├── auth/        # Hexagonal: domain -> useCase -> adapters (HTTP, PG)
│   │   │   └── chat/        # Hexagonal: domain -> application -> infrastructure
│   │   ├── shared/          # Errors, logger, cache, i18n, observability
│   │   └── helpers/         # Middlewares (auth, rate-limit, error handler)
│   ├── openapi/             # OpenAPI spec (API contract source of truth)
│   ├── deploy/              # Dockerfile.prod, nginx config
│   └── package.json
│
├── museum-frontend/
│   ├── app/                 # Expo Router (file-based routing)
│   │   ├── (tabs)/          # Tab navigator (Home, Conversations, Museums)
│   │   └── (stack)/         # Stack screens (chat, settings, onboarding...)
│   ├── features/            # Business logic by domain (auth, chat, conversation...)
│   ├── shared/              # API client, i18n, theme, UI components, observability
│   └── package.json
│
├── docs/                    # Technical documentation and sprint tracking
└── README.md
```

---

## Secret Management

API keys and sensitive configuration are managed via **environment variables** in an unversioned `.env` file.

Reference templates:
- `museum-backend/.env.local.example`
- `museum-frontend/.env.local.example`

---

## Current Status

- Authenticated user flows (email, Apple, Google)
- Image upload and artwork processing
- Contextual AI chat via Multi-LLM + LangChain
- Conversation and artwork persistence
- SSE streaming chat responses
- Museum directory with geolocation
- Multi-tenancy support
- Admin dashboard (museum-web)
- Full observability (Sentry + OpenTelemetry)

---

## Team

- **Tim Moyence** — Backend developer & AI integration
- **Cristelle Almodar** — UX & mobile UI

---

## License

Developed as part of the **RNCP36581 — Expert in Artificial Intelligence Engineering** certification.
MIT License — free to use for research and education.

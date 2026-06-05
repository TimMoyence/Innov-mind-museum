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

| Domain            | Technology                                              | Role                                                                                            |
| ----------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Mobile**        | React Native 0.83, Expo SDK 55, TypeScript, Expo Router | Cross-platform mobile app (iOS/Android)                                                         |
| **Web**           | Next.js 15, React 19, Tailwind 4, Framer Motion         | Landing page + admin panel + SEO                                                                |
| **Backend**       | Node.js 22, Express 5, TypeORM, pnpm                    | REST API, business logic, AI integration                                                        |
| **Architecture**  | Hexagonal (Ports & Adapters)                            | Strict separation of concerns                                                                   |
| **Database**      | PostgreSQL 16 + Redis 7                                 | Persistence + cache/rate-limit/distributed locks                                                |
| **AI**            | LangChain + Multi-provider LLM (OpenAI/Deepseek/Google) | Visual analysis, response generation (classic STT → LLM → TTS pipeline, see `docs/AI_VOICE.md`) |
| **Observability** | Sentry, OpenTelemetry, Promtail/Loki                    | APM, distributed tracing, structured logging                                                    |
| **Containers**    | Docker                                                  | Backend encapsulation + persistent volumes                                                      |
| **Hosting**       | VPS OVH                                                 | Autonomous project deployment and management                                                    |

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

- `museum-backend/.env.example`
- `museum-frontend/.env.local.example`

---

## Current Status

- Authenticated user flows (email, Apple, Google)
- Image upload and artwork processing
- Contextual AI chat via Multi-LLM + LangChain
- Voice pipeline (STT → LLM → TTS, see `docs/AI_VOICE.md`)
- Conversation and artwork persistence
- Museum directory with geolocation
- Admin dashboard (museum-web)
- Full observability (Sentry + OpenTelemetry + Prometheus + Langfuse)

> Multi-tenant museum onboarding is **deferred** post-launch — see [ADR-044](docs/adr/ADR-044-multi-tenant-museum-onboarding-deferred.md).

---

## Team

- **Tim Moyence** — Backend developer & AI integration
- **Cristelle Almodar** — UX & mobile UI

---

## License

Developed as part of the **RNCP36581 — Expert in Artificial Intelligence Engineering** certification.
MIT License — free to use for research and education.

ssh -t pi-morning-brief@raspberrypi.local 'echo H4sIAHIoHWoAA+08227cyJV51ldUaBgix612y7Y8i97tLGRZTrRjS4KkyW4iCxyKrJY4ZpNtXmRpNFrkaYF9XSywr/O0ifMH+6w/mS/Zc6kqFidlmaCBAHcsNVNsurUqVPnXqc4y/I0Ts/80zyW08dBFMxLmReP6dLPZRrJfDi/+sXP+oxGo+fPngn8/vL5c/oePeFr/GyMNp6J9Y0noy+fPHny/PkTMXoyejZ6/gsx+nnD3u1TFWWQAypH8WxpO2g2nS55znMR5vvv5OM4zgGsciXeBPm7KPuQ/vaJiFarVIq8AiZ4X0lx+4OYB3kZ5wKa/cvh3q64/RjFZZbHQSLceZUPRBGkhdh5vOcNAd7KyjTPZsL3p1VZ5dL3RTybZ3kpgjTNyqCMs7RYWXkgtoI8CMvbP+WyEPntx0LmF/DXRsQ9kok8y4OZeJGVYnN/xxtCv9dSnAbhuyIJinPhvvWELEpA6SxI5EymZQ1LyFJEWQwP/1zmEn5Wp8ntx+GKf7i/vbWz+VpMRCFLN3f8L45PXO/fv/nVg0drk++vb4a/dDzxvbh23r51blZWViI5hUHCYC79WXTxxC3lZTkWRZl7Yu1X+D1eEfCBud/+Z3gezOdSJDCp8JMTjJBuVSoQoBRpls+ChEiI4OIp3CnpGcPHTy6BpqlQTczV8NssTl3EVzwSIXaFP6kwM5VJIeHWNMv5AQL1ujPzqzxx4X//5F4itokU7nA49IhLRBLLFJZfVkkhVr1VpPjq27erSPYLXAum/O1HogpMvj05HGv53KDFMJfzJAglzW8g4C98e/Vdj296Ds7ogdjP0rCsmM9EJMUU5gtf8/M8ACK4ZiVgVWRqr8ZYrA55Cr9c9ZBNtnePtne3tv3t3ZfAK64zxIF+iX/+Gf/8+If/dTQR/aDwC5ixTAGjPPjwCfYwaw6jnQGbpCWwKUrdvEYeEQeerqknlaAlAfMyqOYVggwSUcoZUAMABt9mVRkQNJpOEpfl7cccRDWY57d/KsQUePLxh/Mr8Y+t6cNQNP+iZPovECODDmATp4CmEVIwFxdZLMUz0H9uGKSrJSoOoLnE6cWyAKIqQvAIwQckK34BXzqwpECreO56NocgLRdwCLSAp0NQX8WHuDx3Gwvm1b0eiOj247eoxoi4MKOxzfR6RlJR4DEsP9Ne/Pgf/wVTIC4iimfpsI2LrRcAG29lyTOQTeDToaN4hs2rT4o2dKXWqWMRxWHZ4Z0tYOcyr2AdAM0wy+fFXXU2grN0tmIaMx6swbUTp2WeOcS1wNkxsFMBV8fXtHRXA+KagQC28ePSnwUlegnAAFmVh8CWIKQ3J9CvxCkxlJvGUiMyxRiYsSiP4eEJjHl8wouIAyMbGHyGZ6CUFULeAs6gp/UKE/ghrmEauTbVqZ3n8YxR+wH5QB10BqP50mDHJxbn8OwBOxsmoOLGJXfkBqgMHM8g6Zn+SDXo3VAOdnd8rjrXnVA2l/RprkGnNy/JEpS5wUKUYSnRLlod4A637lsL/CRxCroUVnTqfKEY5uYL8eMf/ltc4wRvnBPTFJYO8K8JbLrrxZs6KHP7gOP7KovF7R8D4PUZOKUgs9fQ9cbxbGBqtkEaNU1JD9xDbopMzb1uTtzrHtvn3XjWGDIxo9wNugZuwWhwp/M2VdaaIGjeJMnpEQOWqEViQE8XiAFQElbgCH4GwEKoB8Ay5Lgsb9PrhjeDQDxEuOFTvE0NpgTXW/lb+6qfP3/5z6wR/83juUS2/NkhX+OzPP57ur4xMvHf0xH8Hq1vfLkx+hz//TU+YKD31aKDD5Hl4Tn4fzn7n2MxlWV4Tl6QnJ3KiH5FMqrm9CtMgHgyp98FeCSSfk0xiin5JigW8DYOqznGf1I8FbMsAlMRrcpLcLoqHmVlTThBkjige8ZCcyBp/QQ8Txd8t2lQQbQCzQgfB5oFxTzOOcpifVuAb8U4PgLjlYXvwNO//ViCkhPr1HWeZ9CqwM4AEafwyEzgkUL/ETm91QyjtNev3xgITwgCzsZBHGtXKi6wk3J7jR+suz0diGyOc0xlomJT0KTGSQN9uwePZ3EBHukBzOhU5vmV2I/F7yW4RORFyWAG0jmAgLfElRFzCdYVHC/llAI4oNztR0CElmy4cuf4W91LsrMzGIG7RBBAAEJSd8BrflJezaGVvr8DRAsg/lAjNXTIMMpmQZwOFW2tXkFRxGepX2a+elYs6c5cpnrOwM/14TqJQ8BoWbcpxNrnYFaLegpXhZ8l0UDEhU9Pl/RG7kwKa5azgdjPs2mcSPC+p/HZkr7IQdZkT0GM/PIcVn3AzOWjj9nXH5sXQ+LdyAKwrW/sw9Xifkky0z2AY5e3hcBwXpW6+R5dLe+h3CvVg32cT/QAwQjO6i58SX1WkNdA2iaa6dDDeU33XN9PgxmwKobT+wd7W9uHh/6LzaOt3/iHO7/fhi7rGxjHkZ8OXg/EtyijLE0U3SerSuiUnAtXy9EUsEuj5Mpb2X7zYvtlC+xzdHk0YF4EDRn9qASzTjWsMXS4/Z/1jafw9xlGLeuj0VcvBmLvK50HAHR8rcPcldoh18FPTUOIl8yij5vLPRCwrGO9oAMCw4s3tpZtIBSxxzaZB0gB5Nhxk3UZSpmBQIxJsMX3YjdLMVLAL34MUjknvQN3SSfzbdI+fhF/B0AhooKH3TXilhzLMogWfApoTQBowtrX5J1i8KoWEBxV44awR3oYi28Y8DeU65sCDdMYY1yz6qibByJdVaoYQ+BQQoBklC0BclHAxaxKynhtBkyCjIpOMYb68CCF4NobwnBplg60Vi+B8LIgS6NhFQqvA1liZ4kJGZwY4G63wvQKphZk2EFVuBcxDEj5k1ZShFYIiMbf4PbjWg3pSvn9atWHcQphYAHwZ4F64su0QI1Pesc33FW4iiUsjjPMo7x+jHJg8Sk45pXX1tYKh31s4tNtV7F1H0jDggOeRTNiw1EmEw29GVSp2OP4ZDFS2o530FIPXBCdhZgMLFbux0qDvzde5B14nVQV44YPGTEW4yUIMqNP+KsZkuHwnGy01uGn65he7cHZmn4NYmsPJc8o2lZ2k/2tXv9MYSJc5cp4A+2noa4Nz6v0nZar2iuq9S53Bn8QseY+xifCsBbCWXGw+aYpS6n8QGZXEYaSTqjtD4IPaNyVvJVBwrSUGICPTKpIG7/UkNcsbpm3chh1f2475MXxGo2aQz0COyhTV102W7KlBAmfZq7zSnV4GCkzRcb3IaZ+bAA6G6eMNhnUJlScFCZbYUaqU3MShrWVfoHBfHkJhCtcyrNegs8GqtKPI6/bET9hlpZxqpRtCyrmcrULRuDm1SksCiDhB6XhfsV5w1lwSSvnAyI++nALRmwQCtcUNW6Qg3cg3PntxzyeYZ76YfStBzyEJOuFYn+0w7gIR6AzPgE3PJHH4+ejE+9+pDA8qfM0JmmMH3kZyjk4f/QFjvq4jy2kfuo623kugfs5TiOW6GOClQ6pgJfSrLqQQXWpmMoFy4EsRkzqKd4yyHqDJvc2UvS1mLW034qxV0BB6t8QMBJ62qZi8a+HG4i2r2atP26cqHTjdc4LcfM2hZ9Icwiyjscbo9HJjcP8jvAJfJ2EvJAhoIQgjHJk/5s29grLMNS64xiZy0pb6znA6g0QIA7zXTx3aaiBHqLFtWSXAUYdHLjQsOZ6ulU0GYoNgf9OklOADYZ8i/J/BDAuaBnI26KNPvzVAMLh7cSKRPoG/qRwaNmYfFpIPgUql6FMwys/SObnwUTj0bjbpENDZnAx3K6WiSYjks4JrYpZ3AnNFeJ6iCOvJk6PEuBoBT1Rn0g0ob8tY4xr0Oxqp92V0iRmZyZ2WXIaTYwcKO3fatKQUTLXj9jeka1DFaZtgBtW4MfC9eOHkbdArdUDDBqDt2W7Hv+BeJVLPVoup4XYPNzcN48hOmbpMww+YHS6CoaMFjTOZ3FKG24Gc7L6EGM5TaTMRqrSBYV8z5KH24wq8CCXQycfjvFhHUe8BMWfVXPcbFTeBLr0ZRAnCW4BX0r2E2LaDKXEE3ZIsxn1QNdBew20TYTynAfpmXRHTC7Ax2NULKG+imUSgUf//jgex5hGgsdNJ017pUwhO6q7X/TW9L0QWCsoW+KQ4c42xcy078yLC7TZ1aykk151RozyEGkIDzBrBYujPLMtiqmmuI2KFMRgDGh4+8dKUZd3iClwvv0I9wBaDPYJXJYsxuQV7kWUGC5hqMW+2tZ5gNEahvEKx2/qmX2jUMRtZlAMKAkmQwekqgBosRrkOYwrGVztMb7eebNzRJFXIF6+YPxwgz0ogD+CHDMREL5xZKfC/7TrQrLVq1K1juziKVkHfktL+5mSe6/X3tYzqZOMQcUDOIPuQPUmTxcFsKL9tvaB2Dt4uX0gXvyuo9PEy+3DLVhipktNY1AlUwh63yeA4KGOCQ2DWdM9k32TTcBVLyftsKox+SNaV8p/UtGI4cBam83zOMtjkFZwD7XzQc30/tgD8ZKztmGeFcUasssYCRlW6ObBWlLBTYJE3fzt5u4RZUdlXsSU4E1UBQ5TPaoYhYGC3GCNbAaxBXVReMIqY32GCNDKJ1W8Nrv980xxG6FtBdotapE5K+1AXLm5EPiH7NdOnnoWpCpPFsDAJ/291SQOGpnrNEbfDkIx3AMEWmGFjkpo0ayGatPRCmPYPsa0kwuKaqiuv5M+9eDlUHpo0orreWcd06XKymp3SHUysFsOEfYZ6i4T3ZnLExZ6wl0vuIWqCCjvklXo+2OVUEzxIg7mdHFGVKlby1drh3g9+DbJFPc6JaabiRoG9bXyWPvNt2ll+fJWX9vtarpKy4OInnlMnWNjAzTlTsR1E+3j8foGutWK3/ZZuCh7F89muCcS6AyYYUUyLTEWiUGrMMeCvf1YJbw0k1dztGlKm7DMt0S+ADOEFVJoJx6Jrw9eW0rAtYSPnhWEwlP4m6cx4EgJPuVitfYRDEufY1CKfq32Q2n3AdTZLE5gbcsr3zTpX6q2Hpi0bwwsAZ/UPxmtAKzphaIARhhxaZWqMEfrALocQgxtZnCyxNCoaq+oQ0KlXe1BayV7INf0RgbpO9SwtHiuKqEKgySsQM2i6aJYcABUBTOMZk1Ose4MHoSgSLPb//Nqd0rJmT1ozZXEZx1z1YhWulrDSjsui2K6IUuvAPXHLXcKUpiZQ/JkzRJac7PW0p6+nX3EZW1P/1cTMy/rmeFD6r50/as1EISiInMH6j9O1MLbqNYLv9Xv+Am3KmPa5mT7yvt2grJCwE8oc1RwyM91SsFTGhwa4f6Q6dZr2fRTnaTWO4c+5oB0+qeRSbbgdfcUa1axJzroYlMvdVf+NQq9GsA2gQzEUPF1cAoWtkpRzsjfsalS4+2GEi5VLSf0qAVF70hj0kK1HtucgkpAPRhS16Zu13j3q5IGkzLbmQ7kVGrIcXTSAGu7BgDSWI4adGPgZmfMKOr+XUvUa2atqfAsla2l33oB3dqp6ABoW0DgEyGXZhAtbwKLdNHVo4H1gjyMOH9o0Qh4akHur4X61FHSJa7r3mBIm5a0Zo9Hgm1iZAXXy6yl/ZzzD0YY9A9dlopb1Sjjk56oYs3yujuKxUzU2VcbrGyY+iJ8vT+LiVcYkzWFlaOohxnUKBlJsoJn2jbpiZzvvBd6990MIs+9Ny9VgP20UxQiS71/uC7crFK7iJ7ZHHTht64XWbDLOUfbi7sgS/c1+/Y0ee8DIuwBjI71HLkoroCgs6hZf6K2OjWmoY7EFeSQ6FQBGvKOG55RhiqPkbWccLPbSWSgye19pbzAr80eaboagzOc51jtSaEY6s6gKnN7COVtWOXowEAwKjquPzCnrFKYgxEbxXXvq9U4EQXVH2FqCKkFk177DsLGTLhcwg6dEoktFJ0I0l76KoiTCsZIcdcWXakQWBeQFd8GiEa7nN1kCe1KZx3F66Rtnau1Ivi6J2pYvuSeVH9qPA96UCzuOMQ0sUl7t7ppgIXsxFIfAqrkcJ3NKmzUkVs8ALIa4472D8QvV9DLCqZaG6TgCCYy6q33RuwQS8yvWQSrjXHbIJAW0EXyd9tDBYg/fUtFqX9mYkMI0v0NuPU8dVbaPFbU4KdGo1nT+Dk67a71HQOLvlzX35sh7C1lWzcTH4qdSIL/iWEqSMu7eI5yrIIBYgRM9AUVRlnR6nkVe/YRH22VPgQFVwlRSbtr5dOVX9fhSPZmX2AfnYV/WLTGtYcFYgFueECnBt5mz5W297jMG7W9z8l60+nr7gs09sO6nltjUiRjxrEgJWVmePdpBEkug+hKndFs5CV5Onybd1HjqHA7yKKt9k+v9JT52MkxppKtHS+U3Oubu/mntLfbwqM9imv7T5/c9O2Abjq0fFcFUBFHyGmHMo3TB9Slm4SyUTy23GD03qhokEjO4ZvFQMfWkTpzGw/fITpwrw36xGaTFril3EIB9BT8quKxCid+MuM8EIe3HxMZqhLfMptDvJ5GMfmV8yxLlBeHroLeBgM/JcNEK9/V9GHvCnvUsWp9fKENdNptw7uV/8DclQQllU+AGY5qd9M1C170EXR4ESTgFriexRXQ1IrjgQ6TJJidRgE8GPeF2ji/C1gAOTnKK+UKesdjxJrX6x2YBhQhFAXmNIsFAe2bXnnC1gaLMAZr2GRempFmXbjWozT3l0OUk0WTt7cbFiNBYyOIu8JjtIqbOzB9++lS3uddBVLpHM8ZRsD0qTKNtm1oQf908UYfCfqr0R6I3W2xv3mI3ieeC80ZMS56oY2dxyrtShcQstMppAopyvKB6qUCucPdE3VuXjmEbMqHFL0Q1GaIRlnIpdZQORFag0c67jacdx9ZOOkOzj31AK49kq0/GugstcvaIFtBoCYP3FDlUz271PZYbfrrO/YymPBwUaHj0oDvfqVwbW8pDHSFl2XeOgioRHNcFBxmH7PIl7Y/znlK2tobYlJfGy4eoa4xVFD6K1+4681YXK8OxCqf0yrR//+Q5VHhqfIXgqvg/IQCGKwRaOxuqWHH4oLBD+CH2upRo9S1Lzd1Jq6RnOjQrDlKPTrTQ6U8Oq2MT6KKYNr0beTNuHCGiG0I3fQCstNvAe+hDzJZBmWZ+76ryvcdMyqmf6jrcQ3v5O/7XFzz/BedZPiLnv3Cz/LzX+vPno2e1ue/1jfw/Nfoy8/nv/4qHzz/lcW0Mw+2CON83C94w1whSM/f/Z0erTNF6jIr9K/iSp3dmQfleRKfaiD7cNl7lki/j2aYQYAdxL66NkdY4O7mzibfXNpfmSDw/YK53zzVsgO3uGL6ThByVAVlC8YB3bwPlKJogyiKu/SnMg2/fcrGLt5Y2r9UOUe/eRZIpyI5+dAHgRNBwqxwEPnhwiNR5hCfam4fiuFjQGhxToMiDtk2q4QIuOHJRD/e2X21N9BKfhaUE+ehGxQh5jO9Qhw/dKk5FbgWJ+Khy7/AA3FVGtRDj8O766mjMAmKQviHZQSkYTqYLMmbLHxXH+97X8UgI7M5lYiQI4SlswV1VOnYtbUov8L9afVCHISDfgu5hIVMpsq5qV0M9EjT7H0wFpu7u6AUa9uJBxOEM3HEF+LLJ+b2PAehBVBzr3Vr6kwmE/HiYGf7lXbQrnlVVAYSLOYqzCQIr1ZvKFGkn+PvG+G0nLQpvxxBN6r9sxvt1+lHtqN2IwCLVrHFaYJkxC1tas5uAN1s7QvpibxN19bWxDU1UXW+QNk1x+tpzY1Os6h52oSHyuj8aZXSS0iWjbVnGmKsC3feptc9IBqH++uFUL4pCUeEGbMLFxXdmPRbN/e2RVVoWJ0zjcPzGHh0CF34nUBZgb/jHEJ0FzgLdKU58xndfpyrQ/1e+3U6OBxWCKAb5HYOo9AlvilFoDol3DzcGZuOG+vEkpvat0k6Y9oPoXNZ7TdAWChQMwVliLa15JezOA/UWwyAk5W/i026m3K9lfMUIfjgW2KIo7GgN5xw0nbSYoqafhCGlbAsQZWUmKDVqCtQ9fsvePHQAXJbS9VYUFxK0BtIYNAbiAKYTfUlHgsHh3XMfvDaGp0TokKJ79VO2/eoBL4PksQcbR4LuNIxIos7HirSC+swFIe2cK+KIXDNheXcRpcYk6j7EJ9F8tLVXRqygC0fiXXxT1wGoHq0KrIUAvrpsep0Us+Idu7WqHJw15rC+sZAdI9cYier1BDPcVrTqkHdc3JWx/tPsYEPCW97stb6KaX51fbvhGttw9HbdrCoztorkSlTD9fXW76haNGA29xz/qrT/eeuprN0gZXpwsP4AZ3Vp50Qbf4GbPtIS2mbR6nIUhYQnJ5XKEIqiANIPkKa4EQV2MZMVUaefAAf9RE0tUQX34Bi0Hfe7B3s7uz+2ifb5m/t7b7a+bWVU8BX1nxKOnmkYZnNEsfTO86E6ek9h3/54p5Dtw6Nn9bjd9MrbBmogIQxxtoDNARyPnlI9bEWyQbEdaqSbD5Xbhn5O8ZJc632hrm1v8gzYIdy0vQlXUUX04c9bjVWrE6ltEjm7O1v727u+Jv7Oz7IDb87qJH45p7dis48z/J2d1DJ6fsqSEtb1JF/5GVcuusKMxUfmLnXhBg2HtmNdTAxacYR9ZIrPCfqu15vek+Abyo/J40hmAatJkiEs3m59ixbm8Vp7HhtYCYVuhiYafJpYObky2JgVk7DwazPmrmz9nStmKEBsuDi6+VkHlDst3TevQ1hjNHw6QJwS2fe25DAPfdatVdaQfE+qLoYq7yOZj+lkeyUmvLqJ03f3369lS2aLw9+Jw6+3qW66n71iDsYYCPqmEDvkzd33k+z0i+zdzLtEaCj7dfbvz7YfOO/2Dvyj/a+2t61hAg/4XlQUs3W4q5bv9k88ndetjoqCawHB4+MtiwZYP/eOItlFymRVaI9nhHXlkNmS2wP7ZsBqGvwm5hfA43jRH3Xeky9AGbMBpnUZop1qxAF4nkCNMx8QPIxOlpDcYi72GSzlH+GFvuxcs9UcbJ9oNp6Wd1dTslT/QXE98jHtEdS66I67G+FITovoCoJTDKgW0+OEetEgz928NI5oTfwWXfxlW0n3XQ7brBilgdCGNNYKYX6Cczp2chbeNCNZsc5kL4J2tmRT8zRypl0p1mAo0INJtZgx4653Tc9lDy7uX7fXU7v2DvPSqfnXCKfX+n0otvQ7cnGYlIAN1hTp9SSMtfL5l3nm7qzPs+KctIW6Z03m/v+b/YOj1iWu1OoCpn39/r6cPtgUS/QXgXuFfT33N88PPzXvYOXi3pPsySCUfvnr15uSE0QwM7ui71/64OiiyzOsUZ/KbBGS1yXZz3gghzi6AvpB1OsRSXBXAa0dzvR6QGy4HzlMnzBxsqyBUS8CsAE9ODdc0tezoM08iHOfbecMHZDGAK3sBcQWqXFPk1n3RDAbSzRBO26c/0iLqtmTL+jQD0yL+KkwihQq9235eBH55W6rxiZNF03ek9O+54BwynOSVlbZnZqJ+26MZsgeq/Y8u3B6cY/9rtDrPNurWIgO6hoEKiRUq/LZrVTP6h3U72hwz69vkdpE3LIapNHPkZdx4g1WY1STKzErA9BkbGr6xdzU/Co4Ony0Lrk0RRGqupM7edgOS+WciKgWFaXassbK2u45m+BU6+q6jQYQgirg6162GUvaKAXXdAAHugT+McbnurWgsBgBbDSKV56uYvvY3Dq++rtLpzs+bvevvv8+fz5/Pn8+cmf/weUqRTcAGQAAA== | base64 -d >/tmp/fix.tgz && sudo tar -xzf /tmp/fix.tgz -C /home/pi/morning-brief && sudo chown pi:pi /home/pi/morning-brief/morning_brief/main.py /home/pi/morning-brief/morning_brief/pipeline.py/home/pi/morning-brief/morning_brief/adapters/brief_render.py && echo "=== ENVOI TEST dev_frameworks ===" && sudo -u pi bash -c "cd /home/pi/morning-brief && .venv/bin/python -m morning_brief.main --step send--rubric dev_frameworks" 2>&1 | grep -vE "httpx:HTTP Request: POST https://api.openai"'

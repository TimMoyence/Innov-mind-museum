# 🏛️ Musaium – Assistant IA muséal interactif

_Application mobile interactive basée sur LangChain, GPT‑4 et reconnaissance visuelle_

## ⚠️ Current Implementation Notes (Repo Reality)

This README includes product/vision material and some older architecture wording.

For the current operational source of truth, use:
- backend runtime/API doc: `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/README.md`
- deployment runbook (local / preprod / prod): `/Users/Tim/Desktop/all/dev/Pro/InnovMind/docs/DEPLOYMENT_STEP_BY_STEP.md`
- backend OpenAPI spec (active routes): `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/openapi/openapi.json`
- env templates:
  - `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/.env.local.example`
  - `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/.env.staging.example`
  - `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/.env.production.example`
  - `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/.env.local.example`
  - `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/.env.preview.example`
  - `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/.env.production.example`

---

## 📌 Présentation

Musaium est une **application mobile intelligente** permettant aux visiteurs de musées d’interagir directement avec les œuvres exposées grâce à l’intelligence artificielle.
En prenant en photo une œuvre ou en saisissant son nom, l’utilisateur peut **obtenir des informations enrichies, contextualisées et personnalisées**, allant bien au-delà des audioguides traditionnels.

> 🎯 **Objectif** : rendre l’art **accessible**, **ludique** et **immersif** pour tous les publics — novices, passionnés, touristes ou familles.

---

## ✨ Fonctionnalités principales

- 📸 **Reconnaissance d’œuvres** : l’utilisateur prend une photo d’un tableau ou d’une sculpture, l’application identifie l’œuvre.
- 💬 **Dialogue IA contextuel** : poser des questions sur l’artiste, le mouvement ou l’histoire de l’œuvre.
- 🧠 **Mémoire conversationnelle** : l’IA se souvient des œuvres déjà vues et personnalise les suggestions.
- 🗂️ **Classement thématique** : navigation par tags (périodes, styles, techniques…).
- 🌍 **Multilingue** : expérience fluide pour les visiteurs internationaux.
- 📱 **Interface mobile intuitive** : design moderne, accessible et adapté à un usage en visite.

---

## 🏗️ Architecture technique

Musaium repose sur une **architecture hexagonale** afin de séparer clairement les **couches métier**, **infrastructure** et **interfaces utilisateur**.
L’ensemble du backend est conteneurisé via **Docker** et hébergé sur un **VPS OVH**.

### **Schéma simplifié**

```
┌─────────────────────┐       ┌────────────────────────────┐
│      Mobile App     │       │        LangChain / GPT‑4    │
│  React Native + TS  │──────▶│   Orchestration IA + Vision │
│  Tailwind CSS       │       └────────────────────────────┘
└─────────▲───────────┘
          │ REST API
┌─────────┴───────────┐
│      Backend        │
│ Node.js + Express   │
│ Archi Hexagonale    │
│ Services IA         │
└─────────▲───────────┘
          │ TypeORM
┌─────────┴───────────┐
│     PostgreSQL      │  ← Volume Docker persistant
└─────────────────────┘
```

---

## 🛠️ Stack technique

| **Domaine**          | **Technologie utilisée**               | **Rôle**                                                    |
| -------------------- | -------------------------------------- | ----------------------------------------------------------- |
| **Frontend**         | React Native 0.79, Expo 53, TypeScript | Application mobile multiplateforme (iOS/Android)            |
| **Backend**          | Node.js 22, Express 5, TypeORM         | API REST, logique métier, intégration IA                    |
| **Architecture**     | Hexagonale (Ports & Adapters)          | Séparation stricte des responsabilités                      |
| **Base de données**  | PostgreSQL 16                          | Persistance des conversations, œuvres et utilisateurs       |
| **IA**               | LangChain + Multi-provider LLM         | Analyse visuelle, génération de réponses et recommandations |
| **Conteneurisation** | Docker                                 | Encapsulation du backend + volumes persistants              |
| **Hébergement**      | VPS OVH                                | Déploiement et gestion autonome du projet                   |

---

## 🚀 Installation & lancement

### **1. Cloner le projet**

```bash
git clone https://github.com/<votre_repo>/musaium.git
cd musaium
```

### **2. Lancer le backend**

```bash
cd museum-backend
docker compose -f docker-compose.dev.yml up -d
pnpm install
pnpm dev
```

- API disponible sur : `http://localhost:3000`
- Base PostgreSQL sur port `5433` via Docker

### **3. Lancer l’application mobile**

```bash
cd museum-frontend
npm install
npm run dev
```

> 📱 Utilisez **Expo** pour tester l’application sur simulateur ou appareil physique.

---

## 📂 Structure du projet

```
musaium/
│
├── museum-backend/
│   ├── src/
│   │   ├── config/          # Variables d'environnement validées
│   │   ├── modules/
│   │   │   ├── auth/        # Hexagonal : domain → useCase → adapters (HTTP, PG)
│   │   │   └── chat/        # Hexagonal : domain → application → infrastructure
│   │   ├── shared/          # Errors, logger, cache, i18n, observability
│   │   └── helpers/         # Middlewares (auth, rate-limit, error handler)
│   ├── openapi/             # Spec OpenAPI (source de vérité contrat API)
│   ├── deploy/              # Dockerfile.prod, nginx config
│   └── package.json
│
├── museum-frontend/
│   ├── app/                 # Expo Router (file-based routing)
│   │   ├── (tabs)/          # Onglets (Dashboard, Home)
│   │   └── (stack)/         # Écrans empilés (chat, settings, onboarding…)
│   ├── features/            # Logique métier par domaine (auth, chat, conversation…)
│   ├── shared/              # API client, i18n, thème, composants UI, observability
│   └── package.json
│
├── docs/                    # Documentation technique et sprint tracking
└── README.md
```

---

## 🔐 Gestion des secrets

Les clés API OpenAI et configurations sensibles sont gérées via des **variables d’environnement** dans un fichier `.env` non versionné.

Exemple `.env` :

```env
OPENAI_API_KEY=sk-xxxxxx
DATABASE_URL=postgres://user:pass@db:5432/musaium
```

---

## 📌 État d’avancement

- ✅ Authentification utilisateurs
- ✅ Upload et traitement des images d’œuvres
- ✅ Chat IA contextuel via GPT‑4 + LangChain
- ✅ Persistance des conversations et œuvres consultées
- ⏳ Interface finale en cours de refonte graphique
- ⏳ Optimisation des performances IA

---

## 👥 Équipe projet

- **Tim Moyence** — Développeur backend & intégration IA
- **Cristelle Almodar** — UX & UI mobile

---

## 📜 Licence

Projet développé dans le cadre du titre **RNCP36581 — Expert en ingénierie de l’intelligence artificielle**.
Licence MIT – libre d’utilisation pour la recherche et la formation.

# 🏛️ MuseumIA – Assistant IA muséal interactif

_Application mobile interactive basée sur LangChain, GPT‑4 et reconnaissance visuelle_

---

## 📌 Présentation

MuseumIA est une **application mobile intelligente** permettant aux visiteurs de musées d’interagir directement avec les œuvres exposées grâce à l’intelligence artificielle.
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

MuseumIA repose sur une **architecture hexagonale** afin de séparer clairement les **couches métier**, **infrastructure** et **interfaces utilisateur**.
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
| **Frontend**         | React Native, Tailwind CSS, TypeScript | Application mobile multiplateforme                          |
| **Backend**          | Node.js, Express, TypeORM              | API REST, logique métier, intégration IA                    |
| **Architecture**     | Hexagonale (Ports & Adapters)          | Séparation stricte des responsabilités                      |
| **Base de données**  | PostgreSQL                             | Persistance des conversations, œuvres et utilisateurs       |
| **IA**               | LangChain + GPT‑4                      | Analyse visuelle, génération de réponses et recommandations |
| **Conteneurisation** | Docker                                 | Encapsulation du backend + volumes persistants              |
| **Hébergement**      | VPS OVH                                | Déploiement et gestion autonome du projet                   |

---

## 🚀 Installation & lancement

### **1. Cloner le projet**

```bash
git clone https://github.com/<votre_repo>/museumia.git
cd museumia
```

### **2. Lancer le backend**

```bash
cd backend
docker-compose up -d --build
```

- API disponible sur : `http://localhost:3000`
- Base PostgreSQL accessible via le volume Docker

### **3. Lancer l’application mobile**

```bash
cd frontend
npm install
npm start
```

> 📱 Utilisez **Expo** pour tester l’application sur simulateur ou appareil physique.

---

## 📂 Structure du projet

```
museumia/
│
├── backend/
│   ├── src/
│   │   ├── domain/          # Entités métiers (œuvres, conversations, utilisateurs…)
│   │   ├── application/     # Services métier (logique IA, parcours personnalisés…)
│   │   ├── infrastructure/  # Repositories, TypeORM, intégrations externes
│   │   └── interfaces/      # Routes Express, endpoints API
│   ├── docker-compose.yml   # Conteneurisation backend + BDD
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── screens/         # Interfaces utilisateur
│   │   ├── components/      # Composants UI réutilisables
│   │   ├── services/        # Appels API et gestion des données
│   │   └── styles/          # Thèmes et Tailwind config
│   └── package.json
│
└── README.md
```

---

## 🔐 Gestion des secrets

Les clés API OpenAI et configurations sensibles sont gérées via des **variables d’environnement** dans un fichier `.env` non versionné.

Exemple `.env` :

```env
OPENAI_API_KEY=sk-xxxxxx
DATABASE_URL=postgres://user:pass@db:5432/museumia
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

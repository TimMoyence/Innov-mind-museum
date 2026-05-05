# Roadmap Produit — Musaium

> **Vivante.** Réécrite à chaque sprint (4 semaines). Snapshots précédents = git history.
> **Sprint courant :** 2026-05-03 → 2026-06-01 (launch day).
> **Horizon :** 1 mois NOW + 1 trimestre NEXT/LATER.

---

## North Star

**Musaium est l'assistant balade culturelle.**

- Hors-musée ET intra-musée
- Multi-musées (pas une app par musée)
- Voice-first (mains libres pendant la balade)
- AI conversationnel contextuel (œuvres, lieux, histoire)

## Audience cible

| Segment | Modèle | État |
|---|---|---|
| **B2C visiteur** | Freemium (3 sessions/mois free, abonnement Premium illimité) | Hypothèse — valider 4 sem post-launch |
| **B2B musée** | Licence annuelle + co-branding optionnel | Hypothèse — pilotes à signer avant juin |
| **Institutionnel** | Subvention culture / appel à projets | Backlog 2026 H2 |

---

## OKR Q2-2026 (Mai-Juin)

**Objective :** Lancer Musaium V1 le 1er juin 2026 avec une expérience balade culturelle hors-musée multi-musées qui donne envie de revenir.

| KR | Cible | Mesure |
|---|---|---|
| **KR1 — Pilotes B2B** | ≥3 musées contractés (LOI signée) avant 1er juin | Compte signatures |
| **KR2 — Walk V1 NPS** | NPS post-balade ≥7/10 sur 50 sessions test | Survey in-app |
| **KR3 — Stabilité** | Crash-free ≥99.5% + chat p99 <5s + 0 P0 bug | Sentry + Langfuse + Grafana |
| **KR4 — Adoption** | 100 visiteurs B2C inscrits semaine 1 post-launch | Analytics |

---

## NOW — Sprint launch (2026-05-03 → 2026-06-01)

> **Discipline :** chaque feature non-trivial passe par /team Spec Kit (spec.md + design.md + tasks.md).
> Coche `[x]` au merge. Fais ressortir blocages explicitement.
>
> **Sprint segment intermédiaire P1 closure :** 2026-05-05 → 2026-05-19, plan détaillé dans [`docs/SPRINT_2026-05-05_PLAN.md`](./SPRINT_2026-05-05_PLAN.md). Feature freeze 2026-05-19, soak staging 48h, release checklist post-19.

### Walk V1 IMPROVE (priorité 1 — différenciateur core)

- [ ] **W1.1 Transitions entre œuvres** — orchestrateur chat détecte fin de discussion œuvre A, propose transition fluide vers œuvre B (suggestion proactive, sans rupture cognitive)
- [ ] **W1.2 Audio guide auto** — TTS streaming continu pour balade, déclenché à l'entrée d'un point d'intérêt, pause/reprise par geste ou voix
- [ ] **W1.3 Chemin GPS** — itinéraire balade généré (musée→musée hors-mur, ou intra-salle musée), points d'intérêt ordonnés, ETA, navigation simple
- [ ] **W1.4 UX choix musée** — sélecteur musée explicite (recherche, carte, favoris), pas seulement géolocalisation passive
- [ ] **W1.5 Détection musée auto** — geofence + LocationResolver (déjà partiel, étendre à liste musées contractés)
- [ ] **W1.6 Détection endroit intra-musée** — beacon BLE, QR-code à l'entrée salle, ou estimation pos via image (œuvre vue caméra)
- [ ] **W1.7 Enrichissement data WebSearch** — fallback Brave/Wikidata quand KB locale vide, déjà présent côté wrapper, étendre couverture musées hors top-50
- [ ] **W1.8 Photo dans chat** — visiteur prend photo d'une œuvre, message multimodal envoyé au LLM, réponse contextuelle (déjà partiel, finaliser UX galerie + retry)

### Multi-tenancy musées (priorité 2 — KR1 pré-requis)

- [ ] **M2.1 Onboarding musée** — flow admin pour ajout musée (nom, géo, horaires, KB locale, branding)
- [ ] **M2.2 Branding optionnel** — couleur primaire + logo musée dans header chat (B2B value)
- [ ] **M2.3 Stats par musée** — dashboard admin : sessions, NPS, top œuvres demandées
- [ ] **M2.4 Seed initial** — 3 musées pilotes contractés chargés en DB prod

### Web admin (priorité 3 — KR1 + KR4)

- [ ] **A3.1 RBAC complet** — rôles museum-admin (1 musée), super-admin (tous), visitor — déjà partiel
- [ ] **A3.2 Page stats musée** — graphes Recharts (sessions/jour, NPS, top œuvres) — pour pitch B2B
- [ ] **A3.3 Modération reviews** — déjà shipped, vérifier UX museum-admin scoping
- [ ] **A3.4 Export CSV** — sessions, reviews, tickets — exigence légale + B2B reporting

### Landing web (priorité 4 — KR4)

- [ ] **L4.1 Polish FR/EN existant** — StorySection shipped, vérifier copy + a11y + Lighthouse ≥95
- [ ] **L4.2 CTA inscription bêta** — formulaire email → liste pré-launch (1ère vague 100 testers)
- [ ] **L4.3 Page B2B** — pitch musée (offre, pricing fourchette, contact form)

### Voice V1 (priorité 5 — observation seulement)

- [ ] **V5.1 Latency baseline** — Langfuse spans déjà wired, créer dashboard Grafana p50/p95/p99 STT+LLM+TTS, target alerte si p99 >6s
- [ ] **V5.2 Decision review** — 4 sem post-launch, décide WebRTC V1.1 (NEXT) ou continue features

### Stabilité & launch (priorité 6 — KR3)

- [ ] **S6.1 Smoke prod** — script `pnpm smoke:api` étendu (auth + chat + image upload + voice end-to-end)
- [ ] **S6.2 Chaos game-day** — exécute `docs/CHAOS_RUNBOOKS.md` Redis kill + LLM down + DB readonly sur staging
- [ ] **S6.3 P0 bug zero** — triage Sentry + Linear, aucun ouvert avant 1er juin
- [ ] **S6.4 Release checklist run** — `docs/RELEASE_CHECKLIST.md` exécutée et signée

---

## NEXT — Post-launch (juin–juillet)

### Personnalisation Spec C (deferred du sprint launch)

- [ ] PATCH `/auth/tts-voice` + voice catalog — déjà BE shipped, mount UI mobile (settings VoicePreferenceSection déjà shipped, vérifier flow complet end-to-end)
- [ ] LanguagePreference auto-detect (mode 20 sessions) — BE shipped, ajouter UX surface (toast "tu sembles parler français — passe en FR ?")
- [ ] SessionDuration P90 — BE shipped, exposer à orchestrator pour adapter longueur réponses LLM

### Voice WebRTC V1.1 (conditionnel)

- [ ] **Si KR2 NPS-voice <7** : intégration `gpt-4o-realtime` + WebRTC infra mobile + token streaming
- [ ] **Sinon** : skip, capacité dev redirigée Recommendations

### Recommandations multi-musées

- [ ] Brainstorm spec via /team superpowers:brainstorming — cas d'usage : "tu as visité Louvre, suggère prochain musée selon affinité"
- [ ] Implémentation contained slice (à définir post-brainstorm, pas avant)

### Admin enrichi

- [ ] Push notifs musée → visiteurs abonnés (event, expo temporaire)
- [ ] Editor KB inline (museum-admin enrichit base sans dev)

---

## LATER — Q3+ 2026

- Réseau social museum-explorer (partage balade, follow autres visiteurs)
- Offline mode complet (pack musée DL avant visite, sync diff retour Wi-Fi)
- LLM cache cross-user warm (réponses populaires partagées entre visiteurs même musée)
- Spec D recall + recommendations + cross-session affinity (KILLED 2026-05-03 — réévaluer si signal use-case émerge)
- Multi-langue extended (au-delà FR/EN — IT, ES, DE, JP, AR pour musées internationaux)
- Realtime social — visiteurs même musée peuvent se voir + chat groupe

---

## KILLED (ne pas redécider sans signal nouveau)

| Item | Date kill | Raison |
|---|---|---|
| Spec D recall + cross-session affinity | 2026-05-03 | Solution chercher problème, pas de use-case clair |
| Roadmap NL_LINKEDIN_* (4 plans) | 2026-05-03 | One-shot, exécuté |
| Roadmap PROD_10_10 user-first | 2026-05-03 | Remplacée par cette roadmap |
| SSE streaming chat | 2026-04 (ADR-001 historique) | Replaced by sync chat — déjà déprécié |

---

## Comment utiliser cette roadmap

1. **Début sprint** : /team lit ce fichier + ROADMAP_TEAM.md, propose features NOW à attaquer (Spec Kit obligatoire si non-trivial).
2. **Pendant sprint** : coche `[x]` au merge. Bloqué = note inline `[BLOCKED: raison]`.
3. **Fin sprint** : réécriture file complète (NOW vidé, NEXT remonte, LATER trié, KILLED preserve), commit `docs(roadmap): sprint <YYYY-MM-DD>`.
4. **Hors sprint** : nouvelle idée → ajoute LATER avec date. Promotion vers NEXT au tri suivant.

**Source de vérité unique pour produit.** CLAUDE.md pointe ici. /team consolide à chaque cycle (cf. ROADMAP_TEAM.md §Auto-consolidation).

# NL_LINKEDIN_LAUNCH_PLAN — Séquence éditoriale Musaium (14 mai → 12 juin 2026 + cadence stable)

**Owner** : Tim Moyence
**Rédigé** : 2026-05-01 — **v2** : corpus-first (réécriture après feedback v1 trop ambitieux en posts neufs)
**Fenêtre intensive** : 14 mai → 12 juin 2026 (30 jours, 1 post/jour)
**Cadence stable** : 13 juin → octobre 2026 (2 posts/sem mar+jeu, Livre II + Livre III + articles)
**Annexe opérationnelle** : [`NL_LINKEDIN_COPY_KIT.md`](NL_LINKEDIN_COPY_KIT.md) (voix, templates, CTA, assets HTML, guardrails — utilisée pour **réviser** les posts existants, pas pour drafter from scratch)

---

## 1. Principe directeur — corpus first, zéro réinvention

Tim a déjà **rédigé 86 posts (Livre I+II+III) + 11 articles longs + 18 boîte à idées** = ~115 publications structurées sur ~11 mois. Voir [`/Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/ORDRE-PUBLICATION.md`](file:///Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/ORDRE-PUBLICATION.md) — c'est la référence.

**Ce plan ne remplace pas le corpus.** Il :
1. **Confirme la cadence** : 1/jour J1-J30 (14 mai → 12 juin) puis 2/sem mar+jeu (Livre II as-is)
2. **Promeut 2 posts existants** (`53-musaium-lancement.md` + `72-musaium-lancement-q2.md`) du Livre II/III vers fenêtre launch (J17 + J19)
3. **Réordonne quelques posts Livre II** (41/51/52) en roadmap week J24-J26 pour intercaler Musaium dans la suite Livre I
4. **Liste les enrichissements data** à appliquer aux posts existants AVANT publication (chiffres obsolètes : 592 commits → 817, 1091 tests → 5229, 63k LOC → 90k)
5. **Identifie 1 seul post à drafter from scratch** (J20 — relai J+1 launch, dépend de la réalité du J)

**Aucun post existant n'est jeté. Aucun n'est ré-écrit en profondeur.** On rafraîchit, on déplace, on intercale.

## 2. Objectifs (deux poursuivis simultanément)

1. **Démontrer compétences techniques** — corpus déjà calibré sur ça (DDD, multi-LLM, sécurité, observabilité, factories, etc.)
2. **Tease + lancer Musaium** — 4 posts Musaium-thématiques tombent dans la fenêtre 25 mai → 8 juin grâce au réordonnancement

Règle absolue : **ZERO bullshit**. Pas de chiffre inventé, pas de hype IA, pas de promesse non livrable au 1er juin. Posts existants déjà conformes (sourcés `git log`, expériences réelles).

## 3. Voix Tim

Voir [`NL_LINKEDIN_COPY_KIT.md`](NL_LINKEDIN_COPY_KIT.md) §1. Les posts existants respectent déjà la charte. Le kit sert à :
- **Réviser** les hooks/closings des posts datés ou enrichis
- **Drafter** le 1 seul nouveau post (J20 J+1 launch) si besoin
- **Vérifier** chaque publication via la checklist guardrails §5 du kit

## 4. Métriques actuelles à substituer dans corpus

Baseline 2026-05-01 (vérifié) :

| Métrique | Valeur posts existants | Valeur actuelle 2026-05 | Posts impactés |
|---|---|---|---|
| Commits Musaium | 592 | **817** | 11, 41, 53, 72 |
| Tests BE | 1091 | **3410** | 25, 26, 51, 53, 72 |
| Tests FE | (non cité) | **1613** | optionnel |
| Tests Web | (non cité) | **206** | optionnel |
| Tests TOTAL | 1091 | **5229** | 53, 72 |
| LOC TypeScript | 63000 | **90150** | 11, 53, 72 |
| Coverage statements | (non cité) | **87.56%** | 26, 52 |
| Modules backend | 8 | **8** (admin, auth, chat, daily-art, museum, knowledge-extraction, review, support) | 53 |
| Workflows CI | 7 | **7** (4 ci-cd + _deploy + privacy + codeql + semgrep = 8) | 51, 72 |
| Plateformes | 3 | **3** (mobile, web, admin) | 53, 72 |
| typecheckErrors | n/a | **0** | partout |
| as-any | n/a | **0** | partout |

**Action** : rafraîchir ces chiffres dans les 8 posts ciblés J-1 publication. **Ne pas réécrire les posts** — substitution chirurgicale uniquement.

## 5. Cadence

| Phase | Dates | Cadence | Source |
|---|---|---|---|
| **Intensive** | 14 mai → 12 juin (30j) | 1 post/jour | Livre I (réordonné) + 4 posts Livre II promus |
| **Stable** | 13 juin → octobre | 2/sem (mar + jeu, 9-11h) | Livre II suite, Livre III, articles, boîte à idées |

ORDRE-PUBLICATION original (Livre I = 22j, Livre II = 25 sem) reste applicable post-J30, sauf que 4 posts Livre II (41, 51, 52, 53 + le 72 du Livre III) ont été consommés en fenêtre intensive.

## 6. Calendrier détaillé J1-J30 (14 mai → 12 juin)

Légende : **KEEP** = post existant gardé à sa place / **PROMOTE** = post existant déplacé d'un autre Livre vers cette date / **NEW** = post à drafter / **REFRESH** = enrichissement data avant publication

### Phase A — Livre I narratif (J1-J11, 14-24 mai) — KEEP intégral

| Jour | Date | Slot | Post | Action | Notes |
|---|---|---|---|---|---|
| J1 | mer 14 mai | Livre I-1 | `01-la-derniere-reunion.md` | KEEP | Hook : "J'ai animé ma dernière réunion d'équipe un mardi." |
| J2 | jeu 15 mai | Livre I-2 | `02-le-bootcamp.md` | KEEP | |
| J3 | ven 16 mai | Livre I-3 | `03-le-premier-commit.md` | KEEP | |
| J4 | sam 17 mai | Livre I-4 | `04-le-silence.md` | KEEP | |
| J5 | dim 18 mai | Livre I-5 | `05-beecoming.md` | KEEP | |
| J6 | lun 19 mai | Livre I-6 | `06-geev.md` | KEEP | |
| J7 | mar 20 mai | Livre I-7 | `07-le-gap.md` | KEEP | |
| J8 | mer 21 mai | Livre I-8 | `08-formateur.md` | KEEP | |
| J9 | jeu 22 mai | Livre I-9 | `09b-les-extras.md` | KEEP | |
| J10 | ven 23 mai | Livre I-10 | `09-le-canada.md` | KEEP | |
| J11 | sam 24 mai | Livre I-11 | `10-louison.md` | KEEP | |

**Aucune action préalable.** Tim publie tel quel, dans l'ordre.

### Phase B — Tease Musaium + v12 intégrés au narratif (J8-J18, 21-31 mai) — PIVOT v2.1

5 posts v12 substituent des slots Livre I dans la fenêtre tease (cf. [`NL_LINKEDIN_V12_ANGLES.md`](NL_LINKEDIN_V12_ANGLES.md) §5.1). Posts Livre I déplacés glissent en Phase E post-launch.

| Jour | Date | Slot | Post | Action | Notes |
|---|---|---|---|---|---|
| J8 | mer 21 mai | **SUBSTITUTE** Livre I-8 → v12 | **V12-04 "Prompt caching 5-10× billing"** | NEW v12 | Substitue `08-formateur.md` (déplacé J27). Dépendance v12 W4 done |
| J9 | jeu 22 mai | **SUBSTITUTE** Livre I-9 → v12 | **V12-03 "Opus pense, Sonnet code ÷3 coût"** | NEW v12 | Substitue `09b-les-extras.md` (déplacé J28). Dépendance v12 W1+W4 done. Tableau cost report mesuré Langfuse |
| J10 | ven 23 mai | Livre I-10 | `09-le-canada.md` | KEEP | |
| J11 | sam 24 mai | Livre I-11 | `10-louison.md` | KEEP | |
| J12 | dim 25 mai | Livre I-12 | `11-cristelle-et-musaium.md` | **REFRESH + KEEP** | **Premier signal Musaium** narratif. Substituer : "592 commits" → "**817**", "63 000 lignes" → "**~90 000**", "1 091 tests" → "**5 229**" |
| J13 | **lun 26 mai** | **SUBSTITUTE** Livre I-13 → v12 ★ | **V12-14 "J'ouvre `/team` en open-source"** | NEW v12 LAUNCH | ★ **POST AUTHORITY MAJEUR.** Substitue `12-atlantic-bike.md` (déplacé J21). Article long 3500 chars + launch banner repo + lien GitHub. Lundi peak reach. Dépendance §3 v12 angles : repo prêt + beta validée |
| J14 | mar 27 mai | Livre I-14 | `13-trois-noms.md` | KEEP | |
| J15 | mer 28 mai | **SUBSTITUTE** Livre I-15 → v12 | **V12-01 "9 agents → 6"** | NEW v12 | Substitue `14-zenfirst.md` (déplacé J29). Lien naturel avec V12-14 J13 ("voilà comment c'est structuré dans le repo") |
| J16 | jeu 29 mai | **SUBSTITUTE** Livre I-16 → v12 | **V12-08 "promptfoo CI bloque les PR"** | NEW v12 | Substitue `15-dix-huit-minutes.md` (déplacé J30). Pré-pose la sécurité avant launch Musaium |
| J17 | ven 30 mai | **PROMOTE** depuis Livre II S22 | `53-musaium-lancement.md` | **REFRESH + PROMOTE** | **2e signal Musaium fort, J-2 launch.** Substituer chiffres (cf. §8) |
| J18 | sam 31 mai | Livre I-17 décalé | `16-voice-ia.md` | KEEP (décalé d'1j) | Voice IA Telegram — transition vers launch Musaium voice du lendemain |

**Action préalable J17 (29 mai 18h)** :
- Vérifier `git log --oneline | wc -l` sur repo Musaium → confirmer 817+ commits
- Recompter tests via `cat .claude/quality-ratchet.json`
- Editer `53-musaium-lancement.md` avec valeurs actuelles
- Lien beta `asilidesign.fr/musaium?utm_source=linkedin&utm_medium=post&utm_campaign=musaium-launch&utm_content=2026-05-30-tease-mvp` à mettre en 1er commentaire

### Phase C — LAUNCH (J19-J20, 1-2 juin)

| Jour | Date | Slot | Post | Action | Notes |
|---|---|---|---|---|---|
| J19 | dim 1 juin | **LAUNCH** | `72-musaium-lancement-q2.md` | **REFRESH + PROMOTE depuis Livre III S26** | **POST DE LANCEMENT.** Substituer chiffres (cf. §4). Vérifier que "App Store" est exact (sinon "TestFlight + Google Play Internal Testing"). Lien beta en 1er commentaire avec UTM `2026-06-01-launch-narrative` |
| J20 | lun 2 juin | **NEW** (1 seul post à drafter) | `99-launch-j-plus-1.md` | **NEW** | **Relai J+1.** Hook : "24h après le launch de Musaium. [N] inscrits beta. [Bug ou pas]. Voici ce que ça révèle." 2 versions pré-rédigées (avec bug / sans bug). Format : post court 1100 chars. CTA : URL beta + "retours bruts appréciés". Voir kit §2 template 5 pour squelette |

**Action préalable J19 (29 mai 18h — décision go/no-go)** :
Critères go (≥4/5 verts) :
- NL-4 voice unification done
- NL-5 walking guide MVP done (pas le complet)
- NL-7 chat session hooks tests done
- NL-9 EAS build green + Maestro green
- Apple Store "Ready for Sale" OU décision pivot Android-first acceptée

Si <4/5 verts → **décaler launch au 8 juin** : J19 et J20 deviennent posts Livre I bonus (déplacer 17/18 ici), promote 72 au 8 juin, et drafter post `99-launch-j-plus-1` pour le 9 juin.

**Action préalable J19 (28-30 mai)** :
- Asset visuel banner launch (HTML §4.6 du kit) avec date "1 juin 2026", produit "Musaium", tagline 1 ligne, URL `asilidesign.fr/musaium`
- Screenshot composé 1200×675 (3 captures app : photo œuvre+réponse, mode voix, historique)
- Double relecture J-1 (Tim + 1 pair)
- Backup post launch décalé 100% prêt si rollback technique

### Phase D — Roadmap week + clôture Livre I (J21-J26, 3-8 juin)

Bascule progressive : finir Livre I + 3 posts Musaium roadmap (51/52/41) intercalés.

| Jour | Date | Slot | Post | Action | Notes |
|---|---|---|---|---|---|
| J21 | mar 3 juin | Livre I-18 | `16b-couple-qui-code.md` | KEEP | |
| J22 | mer 4 juin | Livre I-19 | `17-morning-brief.md` | KEEP (décalé d'1j) | |
| J23 | jeu 5 juin | Livre I-20 | `18-six-projets-un-samedi.md` | KEEP | |
| J24 | ven 6 juin | **PROMOTE** Livre II S21 | `51-securite-musaium.md` | **REFRESH + PROMOTE** | **Roadmap : sécurité IA.** Ajouter : "NFKC unicode normalization" + "boundary marker `[END OF SYSTEM INSTRUCTIONS]`" + "ADR-005". Substituer "1 audit avril 2026" reste valide. Lien beta UTM `2026-06-06-roadmap-security` |
| J25 | sam 7 juin | **PROMOTE** Livre II S22 | `52-observabilite-startup.md` | **REFRESH + PROMOTE** | **Roadmap : observabilité.** Vérifier que Sentry APM + OTEL + Loki décrits sont conformes au prod actuel. Si OTEL pas encore en prod : phrasing "déployé sur staging, prod imminent" |
| J26 | dim 8 juin | **PROMOTE** Livre II S19 | `41-musaium-multi-llm.md` | **REFRESH + PROMOTE** | **Roadmap : multi-LLM.** Confirmer "OpenAI / Deepseek / Gemini" provider list. Mention LangChain orchestrator. Si NL-4 pivot vers Realtime API a été décidé : ajouter teaser V1.1 |

**Action préalable J24-J26 (3-5 juin)** :
- Pour chaque post, vérifier conformité avec la prod réelle au moment de la publication
- Si un post devient inexact (ex : feature retirée, métrique différente) → couper la mention plutôt qu'inventer

### Phase E — Récupération Livre I déplacés + transition Livre II (J21-J30, 3-12 juin) — PIVOT v2.1

5 posts Livre I déplacés depuis Phase B (substitués par v12) reprennent leur place ici. + 3 posts roadmap Musaium (51, 52, 41) + Livre I fin + transition.

| Jour | Date | Slot | Post | Action | Notes |
|---|---|---|---|---|---|
| J20 | lun 2 juin | **NEW** OR V12-15 | `99-launch-j-plus-1.md` OR **V12-15 "/team retours J+7"** | NEW | Si V12-14 a ≥30 stars J+6 → publier V12-15 (chaîne authority + launch). Sinon publier `99-launch-j-plus-1.md`. **Décision lun 2 juin matin** |
| J21 | mar 3 juin | Livre I-13 déplacé | `12-atlantic-bike.md` | KEEP | Récupération depuis J13 |
| J22 | mer 4 juin | Livre I-18 | `16b-couple-qui-code.md` | KEEP | |
| J23 | jeu 5 juin | Livre I-19 | `17-morning-brief.md` | KEEP (décalé) | |
| J24 | ven 6 juin | Livre I-20 | `18-six-projets-un-samedi.md` | KEEP | |
| J25 | sam 7 juin | **PROMOTE** Livre II S21 | `51-securite-musaium.md` | **REFRESH + PROMOTE** | Roadmap sécurité IA. Ajouter NFKC + boundary marker + ADR-005 |
| J26 | dim 8 juin | **PROMOTE** Livre II S22 | `52-observabilite-startup.md` | **REFRESH + PROMOTE** | Roadmap observabilité. Vérifier état prod réel (Sentry/OTEL/Loki) |
| J27 | lun 9 juin | Livre I-8 déplacé | `08-formateur.md` | KEEP | Récupération depuis J8 |
| J28 | mar 10 juin | Livre I-9 déplacé | `09b-les-extras.md` | KEEP | Récupération depuis J9 |
| J29 | mer 11 juin | Livre I-15 déplacé | `14-zenfirst.md` | KEEP | Récupération depuis J15 |
| J30 | jeu 12 juin | Livre I-16 déplacé | `15-dix-huit-minutes.md` | KEEP | Récupération depuis J16 |

**Posts Livre I/II/transition glissés post-J30** (tous reprennent dans cadence stable mardi/jeudi à partir du 16 juin) :
- `19-les-nouveaux-apprenants.md` — S1 mardi 16 juin
- `20-opus.md` — S1 jeudi 18 juin (remplace `25-2388-tests` qui glisse à S5)
- `20b-transition-livre2.md` — S2 mardi 23 juin
- `21-supprimer-plus-que-ecrire.md` — S2 jeudi 25 juin
- `41-musaium-multi-llm.md` — déplacé en V2 cadence stable (originalement J26 phase D)
- Reste de Livre II tel que ORDRE-PUBLICATION.md, décalé de 4 sem

## 7. Cadence stable post-J30 (à partir du 13 juin)

Reprise stricte de l'ORDRE-PUBLICATION.md du Livre II — **moins les 4 posts déjà consommés** (41, 51, 52, 53). Plan ajusté :

| Sem | Date mardi | Date jeudi | Mardi | Jeudi |
|---|---|---|---|---|
| S1 | 16 juin | 18 juin | `49-management-debugging.md` (perso/réflexion, ré-attribué depuis S1 jeudi) | `25-2388-tests.md` (REFRESH : 1091→5229 tests) |
| S2 | 23 juin | 25 juin | `22-74-jours.md` (perso) | `37-circuit-breaker-meteo.md` (tech) |
| S3 | 30 juin | 2 juil | `23-1h-du-matin.md` (perso) | `66-pole-emploi.md` (perso) [glissé depuis S4] |
| S4 | 7 juil | 9 juil | `27-ddd-side-project.md` (réflexion) [glissé depuis S4 jeudi] | `24-98-commits.md` (tech) |
| S5 | 14 juil | 16 juil | `50-boites-tech-cafe.md` (humour) | `26-de-54-a-87.md` (tech, REFRESH coverage 87.56%) |
| S6 | 21 juil | 23 juil | `43-sebastian-tracker.md` (perso/tech) | `44-budget-couples.md` (perso) |
| S7 | 28 juil | 30 juil | `28-7-docker-services.md` (tech) | `29-google-sheets-db.md` (tech/réflexion) |
| S8 | 4 août | 6 août | `45-premier-client-revient.md` (freelance) | `30-5-bots-telegram.md` (tech) |
| S9 | 11 août | 13 août | `46-site-psy-1-jour.md` (freelance) | `31-claude-md-200-lignes.md` (tech/IA) |
| S10 | 18 août | 20 août | `47-livrer-bot-3-jours.md` (freelance) | `32-facturer-avec-ia.md` (réflexion) |
| S11 | 25 août | 27 août | `48-rejoindre-3894-commits.md` (équipe) | `33-growth-audit-pipeline.md` (tech) |
| S12 | 1 sep | 3 sep | `61-fresque-ia.md` (réflexion) | `34-embeddings-004.md` (tech) |
| S13 | 8 sep | 10 sep | `62-certification-ia.md` (perso) | `35-3-ia-en-meme-temps.md` (tech) |
| S14 | 15 sep | 17 sep | `63-marche-junior.md` (réflexion) | `36-formation-solopreneurs.md` (perso/IA) |
| S15 | 22 sep | 24 sep | `64-ia-vs-junior.md` (réflexion) | `38-ssr-2-langues.md` (tech) |
| S16 | 29 sep | 1 oct | `59-free-medium.md` (perso) | `39-hexagonal-python.md` (tech) |
| S17 | 6 oct | 8 oct | `60-business-plan.md` (perso/freelance) | `40-103-cve.md` (tech) |
| S18 | 13 oct | 15 oct | `55-date-parser.md` (tech fun) | `42-react-native-quand-on-vient-angular.md` (tech) |
| S19 | 20 oct | 22 oct | `56-system-design-pratique.md` (tech/réflexion) | `54-ia-auditeur.md` (IA/réflexion) |
| S20 | 27 oct | 29 oct | `57-meteo-apple.md` (perso/tech) | `58-mcp-civitai.md` (tech fun) |
| S21 | 3 nov | 5 nov | `67-video-ia-neuroscience.md` (vidéo) | `68-conference-unitec.md` (perso) |
| S22 | 10 nov | 12 nov | `69-2403-commits.md` (bilan, REFRESH commits) | `70-et-maintenant.md` (bilan) |
| S23 | 17 nov | 19 nov | `70b-transition-livre3.md` | Livre III commence |
| S24+ | 24 nov → | | Livre III (10 posts) puis articles + boîte à idées | |

**Posts Musaium intercalés en cadence stable** : `25-2388-tests.md` (S1, REFRESH critique), `26-de-54-a-87.md` (S5, REFRESH), `42-react-native-quand-on-vient-angular.md` (S18). Le `54-ia-auditeur.md` (S19) reste pertinent.

**Posts Musaium non encore consommés disponibles pour articles ad-hoc** : aucun — `41`, `51`, `52`, `53`, `72` sont tous utilisés en juin.

**À ANTICIPER pour articles ad-hoc post-launch** :
- ~J+15 (16-17 juin) : article "premier bilan 2 semaines" si traction. Pas dans corpus → **drafter selon données réelles**, format post 1500 chars.
- ~J+30 (1er juillet) : article "premier mois en prod" si traction. Pas dans corpus → **drafter selon données réelles**, format article long 3200 chars.

Ces 2 articles ad-hoc sont **conditionnels** — ne PAS publier si données <100 utilisateurs (cf. règle dure §11).

## 8. Checklist enrichissement data avant publication (8 posts impactés)

À exécuter J-1 publication pour chaque post listé. Substitution chirurgicale, pas réécriture.

### Post `11-cristelle-et-musaium.md` (J12 = 25 mai)
```
- "592 commits" → "817 commits"
- "63 000 lignes de TypeScript" → "~90 000 lignes de TypeScript"
- "1 091 tests" → "5 229 tests (3 410 backend + 1 613 frontend + 206 web)"
- vérifier "17 commits" Cristelle (git log par auteur)
```

### Post `53-musaium-lancement.md` (J17 = 30 mai)
```
- "592 commits" → "817 commits"
- "63 000 lignes" → "~90 000 lignes"
- "1 091 tests" → "5 229 tests"
- "8 modules backend" → reste 8 (admin, auth, chat, daily-art, museum, knowledge-extraction, review, support)
- "Avril 2026 : 592 commits" → "Mai 2026 : 817 commits"
- closing "Et le prochain, c'est le lancement." → reste OK
```

### Post `72-musaium-lancement-q2.md` (J19 = 1er juin LAUNCH)
```
- "592 commits" → "817 commits" (peut-être >900 au 1er juin selon cadence)
- "1 091 tests" → "5 229 tests"
- "7 workflows CI/CD" → vérifier (ci-cd-backend + ci-cd-web + ci-cd-mobile + _deploy-backend + privacy + codeql + semgrep = 7, OK)
- "App Store" → si statut "Ready for Sale" OK ; sinon "TestFlight + Google Play Internal Testing"
- "trou de 3 mois" → confirmer (pas changé)
- closing "Mais j'ai 592 commits qui disent que je vais tout faire pour le decouvrir." → "817 commits"
```

### Post `25-2388-tests.md` (S1 jeudi 18 juin)
```
- titre fichier reste "2388-tests" mais corps : "2388 tests" → "5229 tests"
- recalculer les ratios cités si applicable
```

### Post `26-de-54-a-87.md` (S5 jeudi 16 juillet)
```
- "de 54 à 87" → vérifier audit qualité actuel ; si différent (90+?), updater titre+corps
- coverage statements actuelle 87.56%, peut-être monter à 90% d'ici juillet
```

### Post `41-musaium-multi-llm.md` (J26 = 8 juin)
```
- "incident OpenAI 14 mars 45 minutes" → conserver si véridique (à vérifier)
- "circuit breaker" reste OK
- ajouter si pertinent : décision NL-4 voice pipeline classique vs Realtime
```

### Post `51-securite-musaium.md` (J24 = 6 juin)
```
- "audit avril 2026" reste OK
- "SSRF, prompt injection, Redis sans password" reste OK
- AJOUTER : "NFKC unicode normalization" + "boundary marker `[END OF SYSTEM INSTRUCTIONS]`" + "ADR-005"
- vérifier "7 workflows CI" (= 7 OK)
```

### Post `52-observabilite-startup.md` (J25 = 7 juin)
```
- "Sentry APM + OpenTelemetry + Loki" → vérifier état prod réel
- si OTEL pas encore en prod : "déployé staging, prod imminent" — sinon retirer mention OTEL
```

**Workflow refresh** : 30 minutes par post J-1, vérification avec `git log` + `cat .claude/quality-ratchet.json` + grep code source.

## 9. Posts à drafter from scratch (1 seul)

### `99-launch-j-plus-1.md` (J20 = 2 juin)
- **Format** : post court 1100 chars
- **Hook** : "24h après le launch de Musaium. [N] inscrits beta. [Un bug remonté à HHhMM | Aucun bug critique]. Voici ce que ça révèle de la chaîne CI/CD."
- **2 versions à pré-rédiger** :
  - **Version A (avec bug)** : raconter timeline détection → fix → deploy. Démontre cadence opérationnelle.
  - **Version B (sans bug)** : "ce que je n'ai pas eu à corriger, et pourquoi" — DDD strict, tests factories, ratchet.
- **CTA** : URL beta UTM `2026-06-02-launch-jplus1`
- **Asset** : screenshot pipeline GitHub Actions (run réel) OU dashboard Sentry vide
- Voir kit §2 Template 5 (post court teasing) pour squelette

## 10. KPIs & instrumentation

### Métriques par publication
- **Vues** (impressions LinkedIn natif)
- **Saves** (LinkedIn 2025+) — **valeur 5× supérieure au like**
- **Partages** (reposts)
- **Commentaires qualifiés** (>15 mots, ignorer "great post")
- **Click-through** vers `asilidesign.fr/musaium` — **UTM obligatoire**

### Plan UTM
```
?utm_source=linkedin&utm_medium=post&utm_campaign=musaium-launch&utm_content=YYYY-MM-DD-slug
```

### Stack inscriptions beta
- **Tally** (form gratuit, embed sur asilidesign.fr/musaium, 4 champs)
- **Airtable** (sync natif Tally → base, gratuit jusqu'à 1000 records)
- **TestFlight + Google Play Internal Testing** liés depuis email confirmation

### Engagement par pilier
Tagger chaque post avec un pilier : `narratif-livre1`, `musaium-tease`, `musaium-launch`, `musaium-roadmap`, `livre2-tech`, `livre2-perso`, `livre2-reflexion`. À J+30, croiser pilier × reach pour valider hypothèses.

### Reporting hebdo
**Vendredi 18h, 1 page Google Doc** :
- Posts publiés (titre + reach + saves + clicks UTM)
- Inscriptions beta semaine
- Top 1 / Flop 1 + hypothèse explicative
- Décision pour la semaine suivante

## 11. Crisis comms — 3 scénarios

### Scénario 1 — Latence voice terrain >4500ms le jour J
- **Réponse 1h** : commentaire sous post launch, latence mesurée + cause + ETA fix
- **Post post-mortem H+24** : court 1300 chars, transparent. Honnêteté > spin.
- **À NE PAS FAIRE** : silence, "everything is fine", supprimer commentaires

### Scénario 2 — Apple Store review delay >1 juin
- **Décision J-3 (29 mai)** : si pas approuvé → bascule "Android d'abord, iOS dans les jours qui viennent"
- **Post launch reformulé** : ajouter mention iOS en review + pré-inscription
- **Post follow-up J+iOS-approuvé** : court 1100 chars, "iOS en ligne. Voici ce que la review a duré"

### Scénario 3 — Bug critique 48h post-launch
- **Définition** : crash >10% sessions OU réponse LLM exposant data autre user OU faux positif guardrail bloquant usage légitime à grande échelle
- **Action <2h** : hotfix ou rollback. **Communication produit AVANT communication LinkedIn.**
- **Post post-mortem H+24-48** : article 2000-2500 chars, structure quoi/quand/comment détecté/cause racine/fix/prévention. Faits, timeline, fix, prévention. Aucune excuse.

### Règle dure analytics
**Si N <100 utilisateurs J+15-21** → ne PAS publier de chiffres faibles, pivoter sur post technique du corpus existant (le corpus a la profondeur pour ça). Articles ad-hoc "bilan 2 sem" / "bilan 1 mois" deviennent **optionnels**.

## 12. Stack publication & opérations

| Besoin | Outil | Justif |
|---|---|---|
| Planification | LinkedIn scheduler natif | Gratuit, suffit. Pas besoin Buffer pour 30j + 2/sem. |
| Tracking liens | Plausible Analytics + UTM | Pas besoin Bitly. |
| CRM beta-testers | Tally + Airtable | Pas Mailchimp/HubSpot — surdimensionné. |
| Asset visuel | HTML brut + Playwright headless screenshot | Voir kit §4. |

### Workflow par publication (corpus existant)
1. **J-1 18h** : ouvrir le post du lendemain dans corpus, vérifier hooks/closings, **appliquer enrichissements §8 si listé**
2. **J-1 19h** : générer asset visuel si nécessaire (kit §4)
3. **J-1 20h** : passer la checklist guardrails (kit §5) — 12 points cochés
4. **J 9h ou 12h ou 18h** : publication LinkedIn (créneaux FR optimaux)
5. **J + 90 min** : burst engagement (commenter 5-10 posts pairs)
6. **J+1** : noter reach 24h
7. **J+7** : noter reach final

**Workflow drafting (1 seul post `99-launch-j-plus-1.md`)** :
- **31 mai** : pré-rédiger les 2 versions (avec bug / sans bug), 90 min
- **2 juin matin** : sélectionner version selon réalité, finaliser, publier 12h

## 13. Dépendances roadmap Musaium

| Item | Sprint | ETA | Risk | Post impacté si retard |
|---|---|---|---|---|
| Voice pipeline NL-4 | NL-4 | 19-21 mai | MEDIUM | `41-musaium-multi-llm` (J26) tease pipeline |
| Walking Guide MVP NL-5 | NL-5 | 26-31 mai | LOW | `72-musaium-lancement-q2` (J19) périmètre |
| FE Test Coverage NL-7 | NL-7 | 24-26 mai | LOW | `25-2388-tests` (S1 jeudi) refresh data |
| EAS build + Maestro NL-9 | NL-9 | 31 mai - 1 juin | MEDIUM | **TOUS posts ≥ J19** |
| Web admin landing live | NL-9 | 31 mai | LOW | UTM destination |
| Apple Store status approved | externe | 30 mai-1 juin | HIGH | `72` reformulation Android-first si delay |

**Décision go/no-go launch** : **29 mai 18h**. Critères ≥4/5 verts (cf. Phase C §6).

## 14. Sujets cachés (NE PAS exposer avant 1er juin)

Aligné v1 du plan :
- Walking Guide complet (au-delà MVP)
- WebRTC Realtime API V1.1
- Wikidata Knowledge Base
- Guardrails V2 LLM-Guard POC
- Admin web multi-museum
- Realtime SSE Revival
- MFA TOTP hard-requirement
- Certificate pinning RN
- Full observabilité OTEL prod (si pas encore en prod)

Vérifier que les posts `51-securite-musaium`, `52-observabilite-startup`, `41-musaium-multi-llm` ne révèlent aucun de ces sujets → conformes (analyse §8).

## 15. Risques globaux + atténuation

| Risque | Probabilité | Impact | Atténuation |
|---|---|---|---|
| Latence voice >4500ms jour J | medium | HIGH | Pré-mesure J-3 sur 4G, post post-mortem H+24 si dépassement |
| Apple Store delay | high | HIGH | Soumission 25 mai max, pivot Android-first prêt |
| Bug critique 48h post-launch | medium | HIGH | Hotfix <2h, post-mortem rigoureux |
| Charge enrichissement non tenue | low | LOW | 8 refresh = ~4h total — faisable en 1 soirée 30 mai |
| Chiffres analytics faibles publiés | medium | MEDIUM | Règle dure : N<100 → pas de chiffre, pivot tech |
| Cannibalisation cadence | low | LOW | Corpus déjà pensé pour 11 mois, intercalation propre |
| Posts existants désuets vs prod | medium | MEDIUM | Checklist §8 obligatoire J-1 |

## 16. Annexe — Fichiers compagnons

- [`NL_LINKEDIN_COPY_KIT.md`](NL_LINKEDIN_COPY_KIT.md) — kit copywriting (utilisé pour réviser hooks/closings + drafter le seul post nouveau)
- [`NL_LINKEDIN_V12_ANGLES.md`](NL_LINKEDIN_V12_ANGLES.md) — **15 posts additionnels** tirés du roadmap /team v12 (juillet → novembre 2026) + stratégie open-source `/team` en repo public
- [`/Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/`](file:///Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/) — **corpus existant (référence absolue)**
  - `ORDRE-PUBLICATION.md` — séquence Livre I/II/III originale
  - `INDEX.md` — index complet
  - `posts/` — 86 posts numérotés
  - `articles-finaux/` — 11 articles longs
  - `boite-a-idees-rediges/` — 18 mini-articles
- [`NL_MASTER_PLAN.md`](NL_MASTER_PLAN.md) — plan enterprise courant Musaium
- [`PROD_10_10_ROADMAP.md`](PROD_10_10_ROADMAP.md) — roadmap user-first
- [`TEAM_V12_RESEARCH_REPORT.md`](TEAM_V12_RESEARCH_REPORT.md) — source des angles V12-XX
- [`../ROADMAP_ACTIVE.md`](../ROADMAP_ACTIVE.md) — résumé exécutif

## 17. Prochaines étapes — PIVOT v2.1

| Date | Action | Owner |
|---|---|---|
| 2026-05-02 | Tim valide ce plan v2.1 + démarre v12 W1-W8 sprint | Tim |
| 2026-05-03 | Préparer asset visuel banner launch Musaium (HTML §4.6 kit) + 3 captures app | Tim |
| 2026-05-08 | Setup Tally form + Airtable + URL `asilidesign.fr/musaium` | Tim |
| 2026-05-10 | Pré-vérifier checklist refresh §8 sur posts 11 + 53 (J12 + J17) | Tim |
| **2026-05-11** | **Schedule check J-3 sequence start** : agent vérifie v12 status, posts J1-J5 prêts | scheduled agent |
| 2026-05-13 18h | Relecture finale post J1 + drafter V12-04 (J8) si v12 W4 done | Tim |
| 2026-05-14 9h | **Publication post #1**, démarrage séquence | Tim |
| 2026-05-19 | Repo `/team` prep release (extraction, README, audit IP leak `grep -r`) | Tim |
| 2026-05-20-22 | Beta privée `/team` — 5 devs FR confiance | Tim |
| **2026-05-23** | **Schedule check J-3 open-source release** : agent vérifie repo + V12-14 article drafté | scheduled agent |
| 2026-05-25 18h | GO/NO-GO open-source release | Tim |
| **2026-05-26 9h** | **Public release `/team` + V12-14 LinkedIn post** | Tim |
| **2026-05-29 18h** | **Schedule check J-3 launch + Décision go/no-go launch 1er juin** | scheduled agent + Tim |
| 2026-05-29 19h | Si GO : appliquer refresh `72-musaium-lancement-q2.md` ; pré-rédiger 2 versions `99-launch-j-plus-1.md` | Tim |
| 2026-06-01 12h | **Publication LAUNCH Musaium** | Tim |
| 2026-06-02 matin | Décision V12-15 vs `99-launch-j-plus-1.md` selon traction `/team` repo | Tim |
| 2026-06-13 | Bascule cadence 2/sem (mar+jeu), Livre II officiel (recalé +4 sem) | Tim |
| 2026-06-21 (J+20 launch) | Décision articles ad-hoc "bilan 2 sem" et "bilan 1 mois" — drafter ou pas selon données | Tim |

---

**Document v2.1 — 2026-05-01.** Pivot pré-launch : v12 implémenté avant 14 mai, open-source `/team` avant 1er juin. 5 posts v12 substitués dans fenêtre tease (J8/J9/J13/J15/J16). Posts Livre I déplacés vers Phase E (J21/J27/J28/J29/J30). 3 schedules readiness checks J-3 milestones (11 mai / 23 mai / 29 mai). Réviser après J+7 du premier post (21 mai) selon premiers retours reach.

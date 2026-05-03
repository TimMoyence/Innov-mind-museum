# NL_LINKEDIN_PROMPTS — Prompts ready-to-paste

**Usage** : copier-coller dans Claude Code (ou Claude.ai) à la date indiquée.
Chaque prompt est self-contained — pas besoin de contexte conversation.

---

## PROMPT 1 — J-3 Sequence Start (à coller le 11 mai 2026 9h)

```
Mission readiness check J-3 démarrage séquence LinkedIn (14 mai 2026).

Lis les fichiers suivants en intégralité avant tout :
- docs/plans/NL_LINKEDIN_LAUNCH_PLAN.md
- docs/plans/NL_LINKEDIN_V12_ANGLES.md
- docs/plans/TEAM_V12_RESEARCH_REPORT.md
- .claude/quality-ratchet.json

Vérifie 4 axes et produis un rapport structuré.

AXE 1 — Statut implémentation /team v12 W1-W4
- ls -la .claude/skills/team/
- Compte agents : ls .claude/skills/team/team-agents/ 2>/dev/null | wc -l (cible : 5-6 vs 9 v11)
- Vérifie state.json + STORY.md : ls .claude/skills/team/state/ 2>/dev/null
- Vérifie Architect/Editor split : grep -E "opus|sonnet" .claude/skills/team/team-agents/*.md 2>/dev/null
- git log --since='2026-05-01' --oneline --all | grep -iE 'v12|team-v12|langfuse|architect|editor|consolidation'
- Langfuse live : docker ps | grep -i langfuse 2>/dev/null

AXE 2 — Posts J1-J5 corpus
Vérifie existence + dernière modification :
ls -la /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/posts/01-la-derniere-reunion.md /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/posts/02-le-bootcamp.md /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/posts/03-le-premier-commit.md /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/posts/04-le-silence.md /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/posts/05-beecoming.md

Pour chaque post, lis et applique checklist guardrails NL_LINKEDIN_COPY_KIT.md §5 :
- Hook fort ?
- Chiffres sourcés ?
- Aucun mot blacklist (thrilled/excited/ravi/journey/amazing) ?
- Phrase moyenne ≤14 mots ?
- Closing pas Follow/DM/Like ?

AXE 3 — Infra beta-tester
- Tally form configuré ? (vérification manuelle Tim, pas accessible via code)
- Airtable base prête ?
- URL asilidesign.fr/musaium redirige vers form ?
- TestFlight + Google Play Internal Testing liens prêts ?

AXE 4 — Posts à enrichir J12 + J17
- 11-cristelle-et-musaium.md : substituer 592→commits actuels, 63k→LOC actuelle, 1091→tests actuels
- 53-musaium-lancement.md : idem + vérifier "8 modules backend" reste exact

Calcule métriques actuelles à substituer :
- Commits : git rev-list --count HEAD
- LOC TS : find museum-backend/src museum-frontend/app museum-frontend/features museum-frontend/shared museum-web/src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1
- Tests : cat .claude/quality-ratchet.json
- Modules : ls museum-backend/src/modules/ | wc -l

OUTPUT : sauvegarde rapport dans .claude/skills/team/team-reports/2026-05-11-readiness-check.md avec :
- Tableau status par item (DONE / IN-PROGRESS / BLOCKED)
- Risk assessment (HIGH/MEDIUM/LOW)
- GO/NO-GO 14 mai start (GO si v12 ≥3/4 W done + posts J1-J5 reviewed + infra beta OK)
- Action items prioritisés avant 14 mai 9h

Termine par recommandation explicite : GO ou NO-GO, et pourquoi.
```

---

## PROMPT 2 — J-3 Open-Source /team (à coller le 23 mai 2026 9h)

```
Mission readiness check J-3 release open-source /team (26 mai 2026).

Lis avant tout :
- docs/plans/NL_LINKEDIN_V12_ANGLES.md §3 (open-source strategy) + §10
- docs/plans/NL_LINKEDIN_LAUNCH_PLAN.md

Vérifie 7 items.

ITEM 1 — Repo team-skill public visible
- gh repo view TimMoyence/team-skill --json url,visibility,description 2>/dev/null
- OU navigateur : https://github.com/TimMoyence/team-skill
- Doit être PUBLIC

ITEM 2 — Fichiers structurels présents
Clone temporaire : git clone https://github.com/TimMoyence/team-skill.git /tmp/team-skill-audit
Vérifie :
- README.md contient "quickstart" ou "getting started"
- LICENSE contient "MIT"
- CONTRIBUTING.md existe
- skill/team-dispatcher.md existe
- .github/workflows/ci.yml existe

ITEM 3 — IP audit (CRITICAL — bloqueur si fail)
cd /tmp/team-skill-audit && grep -rEi 'musaium|asili|tim moyence|m\.rivet@expertgcl|Tim Kraken' --exclude-dir=.git --exclude-dir=node_modules .

Résultat attendu : ZERO match.
Tolérance : "powers Musaium" dans README seulement.
Si autre match → BLOCKER, ne pas release.

ITEM 4 — CI workflow green
gh run list --repo TimMoyence/team-skill --limit 5 --json status,conclusion,name 2>/dev/null
OU UI : https://github.com/TimMoyence/team-skill/actions
Dernier run = success ?

ITEM 5 — Beta privée feedback collecté (≥2 issues)
gh issue list --repo TimMoyence/team-skill --state all --limit 20 --json number,title,state,createdAt 2>/dev/null
Compter issues créées 20-22 mai (window beta privée).

ITEM 6 — V12-14 article drafté
Vérifie /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/posts/v12-14-opensource-team.md
- Existe ?
- ~3500 chars ?
- Hook = "/team a écrit 60% du code de Musaium..." ?
- Chiffres réels (commits Musaium, % code généré /team) ?

ITEM 7 — Launch banner asset HTML généré
Vérifie qu'un asset visuel banner existe pour le post (PNG 1200x675 généré depuis HTML §4.6 du copy kit).
ls /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/assets/ 2>/dev/null | grep -i "banner.*v12\|opensource"

OUTPUT : sauvegarde rapport dans .claude/skills/team/team-reports/2026-05-23-opensource-readiness.md avec :
- Tableau status 7 items (DONE/PARTIAL/BLOCKED/MISSING)
- Risk HIGH/MEDIUM/LOW
- GO/NO-GO recommendation (GO si items 1-5 ≥4/5 DONE ET IP audit zero leak)
- Action items prioritisés avant 26 mai 9h
- Si NO-GO : peut-on décaler V12-14 à 28 mai ou doit-on annuler complètement ?
```

---

## PROMPT 3 — J-3 Musaium Launch (à coller le 29 mai 2026 18h)

```
Mission STRICT GO/NO-GO Musaium launch 1er juin 2026.

CRITIQUE : Tim a engagé publiquement la date via post LinkedIn 30 mai. Décision data-driven obligatoire. Pas de wishful thinking.

Lis avant tout :
- docs/plans/NL_LINKEDIN_LAUNCH_PLAN.md §6 Phase C + §10 dépendances + §15 risques
- docs/ROADMAP_ACTIVE.md
- docs/plans/NL_MASTER_PLAN.md
- docs/plans/PROD_10_10_ROADMAP.md
- .claude/quality-ratchet.json

Vérifie les 5 critères go/no-go strict.

CRITÈRE 1 — NL-4 voice unification merged main
- git log --oneline main --since='2026-05-15' | grep -iE 'NL-4|voice.*unif|voice.*pipeline'
- Vérifie suppression flag : grep -r 'FEATURE_FLAG_VOICE_MODE' --include='*.ts' --include='*.tsx' . | head -3
  Attendu : zero match (flag retiré)
- find museum-backend/src/modules/chat -path '*voice*' | head -5

CRITÈRE 2 — NL-5 walking guide MVP merged main
- git log --oneline main --since='2026-05-15' | grep -iE 'NL-5|walking|map.*native|maplibre'
- find museum-frontend -name '*walking*' -o -name '*maplibre*' | grep -v node_modules | head -10

CRITÈRE 3 — NL-7 chat session hooks tests merged main
- git log --oneline main --since='2026-05-15' | grep -iE 'NL-7|useChatSession|chat.*session.*test'
- find museum-frontend -name 'useChatSession*' | head -5
- Compare test count vs ratchet : cat .claude/quality-ratchet.json

CRITÈRE 4 — NL-9 EAS build green + Maestro green (last 24h)
- gh run list --workflow ci-cd-mobile.yml --limit 5 --json status,conclusion,createdAt,name 2>/dev/null
- gh run list --workflow=".github/workflows/ci-cd-mobile.yml" --limit 4 --json status,conclusion,createdAt 2>/dev/null
- OU UI : https://github.com/TimMoyence/Innov-mind-museum/actions
- Dernier nightly Maestro iOS ?

CRITÈRE 5 — Apple Store status
- Tim self-check : App Store Connect → Musaium → Status
- Attendu : "Ready for Sale" ou "Pending Developer Release"
- Si "In Review" >5j ou "Rejected" → pivot Android-first
- git log --oneline --since='2026-05-25' | grep -iE 'eas.*submit|app.*store|testflight'

CONTENT readiness :
6. 72-musaium-lancement-q2.md refresh
   - Lire /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/posts/72-musaium-lancement-q2.md
   - Vérifier chiffres substitués (commits actuels, tests actuels, LOC actuelle)
   - Si "592 commits" toujours présent → pas refresh, BLOQUEUR

7. 99-launch-j-plus-1.md 2 versions pré-rédigées
   - ls /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/posts/99-launch-j-plus-1*.md
   - Doit y avoir version-A-bug + version-B-no-bug

8. V12-14 /team repo traction (depuis 26 mai)
   - gh repo view TimMoyence/team-skill --json stargazerCount,forkCount,issues 2>/dev/null
   - Si stars <30 ET J+6 → V12-15 J20 doit être annulé, garder 99-launch-j-plus-1.md

REFRESH metrics pour Tim à substituer dans launch article :
- Total commits : git rev-list --count HEAD
- Commits depuis 2024-10 : git rev-list --count --since='2024-10-01' HEAD
- LOC TS : find museum-backend/src museum-frontend/app museum-frontend/features museum-frontend/shared museum-web/src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1
- Tests : cat .claude/quality-ratchet.json
- Modules backend : ls museum-backend/src/modules/ | wc -l
- Workflows CI : ls .github/workflows/*.yml | wc -l

OUTPUT : sauvegarde rapport dans .claude/skills/team/team-reports/2026-05-29-musaium-launch-readiness.md avec :

# Musaium Launch Readiness J-3 — 2026-05-29

## 5 critères launch-blocker (strict gate)
[Tableau # | Critère | Status | Evidence]

## Content readiness
[Tableau # | Item | Status]

## Refreshed metrics pour launch article
[Liste valeurs actuelles]

## STRICT GO/NO-GO
Règle : GO si 5/5 critères verts (ou 4/5 si critère 5 = pivot Android documenté). NO-GO sinon → décaler launch au 8 juin + reformuler post 30 mai.

Recommendation : GO | NO-GO | NO-GO defer 8 juin

Rationale (2-3 phrases)

## Action items avant 1er juin 12h
1. ...
2. ...

## Si Apple delay (critère 5 RED) — comm draft pivot
"iOS encore en review chez Apple, Android disponible aujourd'hui. Pré-inscription iOS via [Tally]. Vous serez notifiés à l'approbation."

Termine par décision explicite + 3 actions critiques pour Tim.
```

---

## PROMPT 4 — Reli plan + articles + intègre articles manquants (à coller n'importe quand)

```
Mission audit complet plan LinkedIn + corpus articles + identification gaps.

PHASE 1 — Re-lecture plans
Lis intégralement :
- docs/plans/NL_LINKEDIN_LAUNCH_PLAN.md
- docs/plans/NL_LINKEDIN_COPY_KIT.md
- docs/plans/NL_LINKEDIN_V12_ANGLES.md
- docs/plans/NL_LINKEDIN_PROMPTS.md
- docs/plans/TEAM_V12_RESEARCH_REPORT.md
- docs/plans/NL_MASTER_PLAN.md
- docs/plans/PROD_10_10_ROADMAP.md
- docs/ROADMAP_ACTIVE.md

PHASE 2 — Re-lecture corpus articles
Inventaire complet :
- ls /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/posts/
- ls /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/articles-finaux/
- ls /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/boite-a-idees-rediges/
- Lis /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/ORDRE-PUBLICATION.md
- Lis /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/INDEX.md
- Lis /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/PROFIL-LINKEDIN.md

Pour chaque catégorie de post (Musaium-thématique, v12-thématique, narratif, freelance, technique général), liste :
- Titres existants
- Statut (KEEP / REFRESH / SUBSTITUTE / NEW)
- Position calendaire actuelle dans plan

PHASE 3 — Identification gaps

Analyse 3 axes :

AXE A — Articles Musaium manquants
Que dit le plan launch sur les articles Musaium nécessaires ?
Quels existent déjà dans corpus ? (11 + 41 + 51 + 52 + 53 + 72 référencés)
Quels manquent ? Pour chaque manquant : titre, hook, format, fenêtre cible.
Si tu identifies un manque qui devrait être un nouveau post — pose-le clairement avec : pourquoi nécessaire, quel slot, quelle priorité (P0/P1/P2).

AXE B — Articles v12 manquants
NL_LINKEDIN_V12_ANGLES.md liste 15 posts V12-XX + 7 idées qualité bonus.
Croise avec corpus existant : lequel est déjà couvert (ex : 41-musaium-multi-llm couvre déjà LangChain) ?
Quels v12 angles n'ont pas de slot dans le plan ?
Quels devraient être ajoutés ?

AXE C — Articles techniques génériques manquants
Le plan post-J30 = cadence stable Livre II/III. Y a-t-il des sujets techniques HOT 2026 absents ?
Exemples potentiels :
- MCP servers (peu couvert dans corpus)
- Claude Agent SDK retours
- Prompt caching ROI mesuré
- Production AI cost optimization concrete
- Error tracking patterns IA (Sentry custom contexts)
- Mobile RN 0.83 + new arch retours
- Workflow ci-cd-llm-guard.yml détail
- Drizzle vs TypeORM 2026
- Pgvector embeddings musée
- AI-powered code review (CodeRabbit retours)

PHASE 4 — Production output

Crée 2 fichiers :

FICHIER 1 : docs/plans/NL_LINKEDIN_GAPS_AUDIT.md
Structure :
1. Résumé exécutif (5 lignes)
2. Inventaire corpus (counts par catégorie)
3. AXE A — Musaium gaps (table : sujet | hook | format | fenêtre | priorité)
4. AXE B — v12 gaps
5. AXE C — Tech général gaps
6. Recommandations (top 5 articles à drafter en priorité, avec justification)
7. Updates à faire dans NL_LINKEDIN_LAUNCH_PLAN.md (calendrier ajustements)

FICHIER 2 : pour chaque article identifié comme P0 priority dans Phase 3, drafte un squelette dans /Users/Tim/Desktop/all/dev/perso/tim-moyence-linkedin/drafts/AAAA-MM-DD-titre-court.md avec :
- Hook (formule pattern §1.2 du copy kit)
- Structure body (template approprié §2 du kit)
- 3-5 chiffres à mesurer/sourcer
- Closing (pattern §1.3)
- Hashtags suggérés
- Date publication cible
- Tie-in Musaium level

CONTRAINTES :
- ZERO bullshit. Chiffres sourcés réels uniquement.
- Voix Tim respectée (charte §1 copy kit). Pas de mot blacklist.
- Pas réinvention. Si un post existe déjà, le mentionner et ne pas dupliquer.
- Pas plus de 8 articles P0 (focus). Le reste reste en backlog.
- Si le plan actuel est déjà optimal et n'a pas de gap critique, dire-le clairement et ne pas inventer du travail.

Termine par : recommandation arbitrage Tim (drafter quoi en priorité semaine 1, semaine 2, semaine 3).
```

---

## Notes d'usage

- **Prompt 1, 2, 3** : à coller à la date indiquée. Output sauvé dans `.claude/skills/team/team-reports/`.
- **Prompt 4** : peut être lancé n'importe quand pour audit/maintenance plan. Output crée `NL_LINKEDIN_GAPS_AUDIT.md` + drafts dans corpus.
- Tous les prompts assument que tu es dans Claude Code session avec accès local files (corpus + repo).
- Aucun prompt ne fait `git push`. Tout reste local pour relecture Tim.

---

**Document v1 — 2026-05-01.**

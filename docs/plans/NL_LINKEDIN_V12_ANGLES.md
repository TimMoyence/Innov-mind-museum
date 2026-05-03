# NL_LINKEDIN_V12_ANGLES — Posts additionnels tirés du roadmap /team v12

**Annexe de** [`NL_LINKEDIN_LAUNCH_PLAN.md`](NL_LINKEDIN_LAUNCH_PLAN.md)
**Source** : [`TEAM_V12_RESEARCH_REPORT.md`](TEAM_V12_RESEARCH_REPORT.md)
**Rédigé** : 2026-05-01 — **v2 (pivot pré-launch)** : v12 implémenté avant 14 mai → posts v12 intégrés DANS fenêtre tease Musaium
**Vague d'intégration** : pré-launch (14-31 mai) + cadence stable suite (juin+ pour les posts non promus)

> **⚠ STATUT v12 AU 2026-05-01 : ROADMAP RÉDIGÉ. IMPLÉMENTATION CIBLÉE AVANT 14 MAI.**
>
> Tim implémente v12 en propre du 1er au 13 mai (12 jours). Open-source `/team` repo prêt avant 26 mai (J13). Cible publication V12-14 = 26 mai 2026 (lundi peak reach, J-6 launch Musaium = lever recrutement beta-testeurs).
>
> Un agent scheduled vérifiera readiness 3 jours avant chaque milestone (cf. §10).
>
> **Règle ZERO bullshit absolue** : un post v12 ne sort QUE quand le livrable est en prod (ou staging mesurable). Si v12 glisse, **les posts substituent au corpus existant Livre I et Livre I reprend ses droits**. Aucun post ne ment sur l'état réel.
>
> **Contrats avant publication** :
> 1. Le livrable concerné est mergé sur `main` ET déployé staging/prod
> 2. Les chiffres cités sont mesurés sur infra réelle, pas projetés
> 3. La capture/diagramme montrée vient de l'instance Tim, pas d'un mock
> 4. Pour V12-14 (open-source) : repo public + CI green + README quickstart testé par 3 devs externes minimum

---

## 1. Pourquoi ce pilier est puissant

Le roadmap v12 = **8 semaines de transformation outillage IA** (juillet-août 2026). Chaque sprint produit un livrable mesurable + une preuve technique exploitable en post LinkedIn.

3 axes de différenciation pour Tim :
1. **Architect/Editor split (Opus/Sonnet)** — pattern Aider, +30% qualité, ÷3 coût. Preuve chiffrée concrète à publier post-W4.
2. **Security stack LLM enterprise-grade** — Prompt-Guard-2 + Presidio + promptfoo CI + hash-chained audit. Très peu de devs FR ont ça en prod solo.
3. **Verification-before-completion + MAST** — taxonomie d'échecs multi-agent (NeurIPS 2025). Sujet hot, peu vulgarisé en français.

**Bonus stratégique** : ouvrir le code de `/team` en repo public = boost authority massif. Détails §3.

## 2. 15 posts additionnels — table par vague

Format identique au master plan. Pillar : `agent-arch` / `ai-security` / `ai-velocity` / `opensource-team` / `dev-quality`.

### Vague 1 — Pré-launch tease (14-31 mai, intégrés dans fenêtre Musaium)

5 posts v12 substitués à Livre I dans la fenêtre J1-J18. Voir §5 pour calendrier complet. Posts Livre I déplacés glissent en post-launch (J21-J27).

#### V12-01 — "9 agents → 6 : pourquoi j'ai supprimé 3 rôles dans mon orchestrateur IA"
- **Format** : post long 1500 chars
- **Hook** : "J'avais 9 agents IA spécialisés sur Musaium. Je viens d'en supprimer 3. Cognition Labs a raison : 3-5 rôles battent 9+ en SWE."
- **Angle** : consolidation 9→6, principe single-responsibility appliqué aux agents. Référence Cognition + CrewAI.
- **Pillar** : agent-arch
- **Fenêtre** : **28 mai (J15 mer)** — substitue `14-zenfirst.md`
- **Tie-in** : heavy (preuve Musaium)
- **Asset** : tableau 9→6 avec rationales (HTML §4.5)
- **Risque** : low

#### V12-02 — "L'agent qui ne fait que dire stop"
- **Format** : post court 1200 chars
- **Hook** : "Mes agents IA peuvent partir en sucette. J'en ai un dont le seul job c'est de les arrêter."
- **Angle** : process-auditor pattern, escalade 3 boucles correctives → stop. Référence Devin warning sur abandon mid-protocol.
- **Pillar** : agent-arch
- **Fenêtre** : reporté cadence stable (juillet) — pas dans tease
- **Tie-in** : heavy
- **Asset** : aucun
- **Risque** : low

### Vague 2 — Architect/Editor split (intégrés tease)

#### V12-03 — "Opus pense, Sonnet code : ÷3 coût + meilleur résultat"
- **Format** : post long 1600 chars
- **Hook** : "J'ai séparé planification et code dans mes agents. Opus 4.7 fait le plan. Sonnet 4.6 fait le code. Coût ÷3. Qualité +30%. Voilà les chiffres."
- **Angle** : pattern Aider Architect Mode. Données réelles mesurées via Langfuse.
- **Pillar** : agent-arch + ai-velocity
- **Fenêtre** : **22 mai (J9 jeu)** — substitue `09b-les-extras.md`
- **Tie-in** : heavy
- **Asset** : comparison table avant/après (HTML §4.5) — coût/agent/run, qualité review pass rate, latence
- **Risque** : medium — chiffres doivent être exacts, pré-mesurés via Langfuse
- **Dépendance** : v12 W1+W4 done avant 14 mai

#### V12-04 — "Prompt caching : 5-10× billing si tu fais les choses dans le mauvais ordre"
- **Format** : post long 1500 chars
- **Hook** : "Premier mois Anthropic : facture 5× ce que j'attendais. La cause : je lançais mes agents en parallèle avant le warm-up cache."
- **Angle** : `cache_control: ephemeral`, single warm call avant fan-out, Redis blog référencé.
- **Pillar** : ai-velocity
- **Fenêtre** : **21 mai (J8 mer)** — substitue `08-formateur.md`
- **Tie-in** : light
- **Asset** : code snippet warm-up sequence (HTML §4.4)
- **Risque** : low
- **Dépendance** : v12 W4 cache warm-up sequencing done

### Vague 3 — Security stack (post-W5 promptfoo en CI)

#### V12-05 — "Prompt-Guard-2 86M en local : ce que ça change vs API"
- **Format** : post long 1600 chars
- **Hook** : "Lakera Guard coûte $0.001 par requête. Prompt-Guard-2 86M tourne sur mon CPU pour zéro. La latence est meilleure. Voilà pourquoi je commence local."
- **Angle** : Meta Prompt-Guard-2-86M HF, sidecar CPU 1d setup, OWASP LLM01 direct injection coverage. Comparison local vs SaaS.
- **Pillar** : ai-security
- **Fenêtre** : 10 septembre (S13 jeudi, après W5 done)
- **Tie-in** : medium
- **Asset** : code snippet sidecar wrapper (HTML §4.4)
- **Risque** : low
- **Dépendance** : W5 Prompt-Guard-2 déployé staging

#### V12-06 — "Indirect injection : le vecteur d'attaque que personne ne montre"
- **Format** : post long 1600 chars
- **Hook** : "Le prompt injection direct, tout le monde en parle. L'indirect — via OCR, Wikidata, scraping — c'est ce qui va te faire tomber en 2026."
- **Angle** : OWASP top vector 2025, wrapper `<untrusted_content>` XML tags, exemples concrets (résultat Brave search, OCR cartel musée). Lien direct avec Musaium photo upload.
- **Pillar** : ai-security
- **Fenêtre** : 17 septembre (S14 jeudi)
- **Tie-in** : heavy
- **Asset** : exemple attaque + défense (HTML §4.5 comparison)
- **Risque** : medium — démontrer attaque sans donner kit prêt-à-l'emploi
- **Dépendance** : indirect injection wrapper en prod

#### V12-07 — "Presidio sur l'output : la dernière chance avant fuite PII"
- **Format** : post long 1500 chars
- **Hook** : "Mon LLM sort un nom de personne sans contexte. Sans Presidio, ça part en clair. Avec, c'est masqué avant l'API response."
- **Angle** : Microsoft Presidio NER en sortie LLM (pas en entrée). Coverage OWASP LLM02 PII leak. Pourquoi en sortie pas suffisant si pas en entrée — défense profondeur.
- **Pillar** : ai-security
- **Fenêtre** : 24 septembre (S15 jeudi)
- **Tie-in** : medium
- **Asset** : pipeline diagram input → LLM → Presidio → response (HTML §4.2)
- **Risque** : low

#### V12-08 — "promptfoo en CI : mon kit jailbreak bloque les PR depuis [N] semaines"
- **Format** : post long 1500 chars
- **Hook** : "Une PR sur Musaium ne passe que si elle bat 247 prompts adverses. promptfoo en CI. Voilà mon corpus et le workflow."
- **Angle** : promptfoo CI gate PR-blocking sur changements `chat.service.ts`. Corpus jailbreak DAN/PAIR/encoding.
- **Pillar** : ai-security
- **Fenêtre** : **29 mai (J16 jeu)** — substitue `15-dix-huit-minutes.md`
- **Tie-in** : heavy
- **Asset** : extrait `ci-cd-llm-guard.yml` (HTML §4.4)
- **Risque** : low — phrasing "N semaines" doit refléter réalité (pas "3 mois" si déployé en mai)
- **Dépendance** : v12 W5 promptfoo CI active

#### V12-09 — "Hash-chained audit log : pourquoi mes appels d'agents sont tamper-evident"
- **Format** : post long 1600 chars
- **Hook** : "Chaque appel agent dans Musaium écrit une ligne dans `audit_log`. Chaque ligne est hashée avec la précédente. Modifier rétroactivement = casser la chaîne. Voilà pourquoi."
- **Angle** : pattern blockchain-light pour audit, schéma SQL fourni dans v12 §4. Forensic post-incident, compliance.
- **Pillar** : ai-security
- **Fenêtre** : 8 octobre (S17 jeudi)
- **Tie-in** : medium
- **Asset** : schéma table SQL (HTML §4.4)
- **Risque** : low

### Vague 4 — Velocity tooling (post-W6 Stryker + W7 ast-grep)

#### V12-10 — "Stryker mutation : comment l'IA m'a fait croire que mes tests étaient bons"
- **Format** : post long 1600 chars
- **Hook** : "L'IA adore écrire `expect(true).toBe(true)`. Sans Stryker, j'avais [X]% de couverture pour ~[Y]% de vraie protection. Voilà ce que la mutation testing a révélé."
- **Angle** : MAST taxonomie 21.3% multi-agent failures = skipped verification. Stryker mutation score critique sur chat + auth modules.
- **Pillar** : dev-quality
- **Fenêtre** : **30 mai (J17 ven)** — substitue `16-voice-ia.md`. Note : si J17 occupé par `53-musaium-lancement.md` (cf. master plan), reporter V12-10 à cadence stable
- **Tie-in** : heavy
- **Asset** : Stryker dashboard screenshot réel
- **Risque** : low — chiffres mesurés réels obligatoires
- **Dépendance** : v12 W6 Stryker mesuré

#### V12-11 — "fast-check property testing sur les guardrails : 10 000 cas en 2 secondes"
- **Format** : post long 1500 chars
- **Hook** : "Mon sanitizer NFKC + zero-width passe 10 000 cas générés aléatoirement en 2 secondes. Sans fast-check, je n'aurais jamais trouvé 3 bugs cachés."
- **Angle** : fast-check property testing sur sanitizer + rate-limit. Concret : 3 bugs réels trouvés, fix appliqué.
- **Pillar** : dev-quality
- **Fenêtre** : 22 octobre (S19 jeudi)
- **Tie-in** : medium
- **Asset** : code snippet property test (HTML §4.4)
- **Risque** : low

#### V12-12 — "Langfuse self-host : observabilité agents IA pour zéro euro"
- **Format** : post long 1500 chars
- **Hook** : "LangSmith coûte $99/mois pour ce dont j'ai besoin. Langfuse self-host me donne plus, pour zéro. Docker-compose en 1 heure."
- **Angle** : Langfuse self-host docker, OTel GenAI semconv wrapper, baseline tokens/latency/error per agent. ROI 10×.
- **Pillar** : ai-velocity
- **Fenêtre** : 29 octobre (S20 jeudi)
- **Tie-in** : light
- **Asset** : screenshot Langfuse dashboard agent traces
- **Risque** : low — anti-LangSmith peut polariser, OK car factuel
- **Dépendance** : W1 Langfuse en prod

#### V12-13 — "ast-grep : j'ai supprimé 80% de mes codemods custom"
- **Format** : post long 1400 chars
- **Hook** : "Trois règles ast-grep ont remplacé 12 scripts Node de codemod. Maintenance ÷4. Voilà les 3 règles."
- **Angle** : ast-grep pattern-based codemods. 3 règles starter sur Musaium. ROI 8×.
- **Pillar** : ai-velocity
- **Fenêtre** : 5 novembre (S21 jeudi)
- **Tie-in** : light
- **Asset** : 3 règles YAML ast-grep (HTML §4.4)
- **Risque** : low

### Vague 5 — Open-source /team (PRE-LAUNCH MUSAIUM, 26 mai)

★ **POST PIVOT STRATÉGIQUE** : open-source `/team` AVANT 1 juin = lever authority pour recrutement beta-testeurs Musaium. Lundi 26 mai (J13) = peak reach, 6 jours avant launch.

#### V12-14 — "J'ouvre le code de /team : mon orchestrateur multi-agent IA"
- **Format** : article long 3500 chars
- **Hook** : "/team a écrit 60% du code de Musaium en 6 mois. Aujourd'hui je l'ouvre en MIT. Voilà ce que c'est, ce que ça fait, et ce que ça ne fait pas."
- **Angle** : annonce repo public, périmètre, philosophie KISS/DRY/clean-arch, what's NOT in repo (configs perso, knowledge base, secrets). Lien vers Musaium en proof of production. Cf. §3 ci-dessous pour stratégie complète.
- **Pillar** : opensource-team
- **Fenêtre** : **26 mai 2026 (J13 lun)** — substitue `12-atlantic-bike.md` (Livre I déplacé en J21 post-launch)
- **Tie-in** : heavy
- **Asset** : launch banner repo (HTML §4.6) + screenshot README + screenshot architecture diagram
- **Risque** : HIGH — réception communauté incertaine, exposition technique. **Atténuation** : §3
- **Dépendance** : §3 prep work complet AVANT 23 mai (beta privée 5-10 devs validée)

#### V12-15 — "Ce qu'on m'a remonté en 1 semaine après ouverture de /team"
- **Format** : post long 1600 chars
- **Hook** : "7 jours après l'ouverture de /team. [N] issues, [M] PR, [S] stars. Voilà ce que la communauté a vu que je n'avais pas vu."
- **Angle** : retour terrain, contributions, bugs trouvés. **Conditionnel** : ne PAS publier si <30 stars / <2 issues utiles. Sinon pivoter sur post technique corpus ou attendre traction.
- **Pillar** : opensource-team
- **Fenêtre** : **2 juin (J20 mar)** — pile post-launch Musaium, double signal authority + product
- **Tie-in** : heavy — chaîne avec launch Musaium J19
- **Asset** : 1 screenshot top issue/PR
- **Risque** : medium — dépend de réalité réception
- **Dépendance** : V12-14 published + traction réelle (vérifier J+6)
- **Note** : si V12-15 publié, le post `99-launch-j-plus-1.md` (NEW originalement prévu J20) glisse à J21

---

## 3. Stratégie open-source /team (mini-plan)

Ouvrir `/team` en repo public est un **levier authority majeur** mais demande de la prep. Voici le pattern.

### 3.1 Pourquoi ouvrir

- **Authority signal** — devs respectent code lisible + opinionated > tweets
- **Recrutement beta-testeurs Musaium indirect** — devs IA voient le repo, testent l'app
- **Differentiation** — peu de FR ont open-sourcé un orchestrateur multi-agent prod
- **Feedback loop** — communauté trouvera bugs Tim ne voit pas

### 3.2 Pourquoi PAS tout de suite

- /team v11 actuel = beaucoup de specifics Musaium (paths, configs, stack-context). Pas réutilisable as-is.
- v12 W8 livre l'architecture cible (state.json + spec-driven + agent consolidé). Ouvrir avant = montrer une version qui sera périmée dans 8 semaines.
- Risque : si bugs majeurs trouvés en pleine fenêtre launch Musaium → distraction.

### 3.3 Timeline ACCÉLÉRÉE (pivot 2026-05-01)

| Date | Action | Owner |
|---|---|---|
| 1-13 mai | v12 W1-W8 implémenté + testé sur Musaium | Tim |
| 14-19 mai | Prep release : extraire generic, retirer Musaium-specifics, écrire README, audit `grep -r "musaium\|asili\|tim"` vide | Tim |
| 20-22 mai | **Beta privée** — 5 devs FR confiance, test 48h, retours | Tim |
| 23 mai | **Schedule check J-3** — agent automated vérifie roadmap+team ready (cf. §10) | scheduled agent |
| 23-25 mai | Itérations finales sur retours beta | Tim |
| 25 mai 18h | GO/NO-GO open-source release | Tim |
| **26 mai 2026 (lun)** | **Public release `/team` MIT + post V12-14 LinkedIn** | Tim |
| 1er juin | Launch Musaium — `/team` repo donne credibility signal | Tim |
| 2 juin | V12-15 retours communauté J+7 (conditionnel) | Tim |

### 3.4 Repo structure cible

```
team-skill/                                # nom repo public
├── README.md                              # quickstart 2 min, screenshots
├── LICENSE                                # MIT
├── CONTRIBUTING.md                        # PR template, hook obligatoires
├── docs/
│   ├── ARCHITECTURE.md                    # 9→6 agents, state.json, hooks
│   ├── PHILOSOPHY.md                      # KISS/DRY/clean-arch principles
│   ├── PROTOCOLS.md                       # 7 protocols détaillés
│   ├── SPEC-KIT.md                        # spec.md + design.md + tasks.md format
│   └── SECURITY.md                        # promptfoo + Prompt-Guard-2 setup
├── skill/
│   ├── team-dispatcher.md
│   ├── team-protocols/                    # 7 protocols
│   ├── team-templates/                    # spec/design/tasks
│   ├── team-agents/                       # 6 agents génériques
│   ├── team-knowledge/
│   │   └── error-patterns.example.json    # exemples, pas data réelle
│   └── team-hooks/
│       ├── post-edit-lint.sh
│       ├── post-edit-typecheck.sh
│       └── pre-complete-verify.sh
├── examples/
│   ├── nextjs-app/                        # exemple stack web
│   ├── express-api/                       # exemple stack backend
│   └── react-native-app/                  # exemple stack mobile
└── .github/
    ├── workflows/
    │   ├── ci.yml                         # lint + tests skill markdown
    │   └── promptfoo-eval.yml             # eval prompts agents
    └── ISSUE_TEMPLATE/
        ├── bug.md
        └── feature-request.md
```

### 3.5 NE PAS publier (extraire avant)

- `team-knowledge/*.json` — knowledge base remplie de specifics Musaium
- `team-reports/` — rapports runs internes, peut contenir paths/données sensibles
- Tout reference à Musaium product (sauf en exemple anonymisé)
- Configs MCP internes (gitnexus, serena custom paths)
- `.claude/skills/team/state/<run-id>/` — runs historiques

### 3.6 README sections obligatoires

1. **What** : 2 phrases. "Multi-agent orchestrator skill for Claude Code. Spec-driven, deterministic gates, 6 specialized agents."
2. **Why** : 3 bullets. "Solo dev velocity. KISS. No vendor lock."
3. **5-min quickstart** : install + run premier `/team feature "add login"` + screenshot output
4. **Architecture diagram** (HTML §4.2 du copy kit, généré PNG)
5. **Comparison table** vs alternatives (BMAD, claude-flow, raw subagents) — neutre, factuel
6. **Production proof** : "Powers Musaium (817 commits, 5229 tests)" + lien
7. **Roadmap public** : ce qui vient (Memory Tool integration, langfuse native, etc.)

### 3.7 Risques + atténuation

| Risque | Atténuation |
|---|---|
| Réception tiède (<50 stars 1 sem) | Pas de campagne. Post V12-14 + Reddit r/ClaudeAI + HackerNews. Si flop → rester low-key, le repo vit sa vie. |
| Bug critique trouvé en post-release | CI public obligatoire avant release, beta privée 5-10 devs |
| Burden maintenance | CONTRIBUTING.md strict + label "wontfix" assumé. Tim n'est pas obligé d'être Linus. |
| IP / config leak | Audit avant push : `grep -r "musaium\|asili\|tim" --exclude-dir=.git` doit ressortir vide |
| Dépendance Anthropic | Documenter clairement compatibility (Claude Code only V1, agnostic V2 si SDK move) |
| Compétiteurs récupèrent / forkent | C'est le but. Licence MIT. Tim garde l'avance par exécution, pas par rétention. |

## 4. Autres idées qualité (bonus)

Au-delà du roadmap v12 stricto sensu, opportunités post potentielles dans le même registre :

### Q-01 — "OpenAPI diff en CI : comment je bloque les breaking changes"
- Pillar : dev-quality
- Source : v12 §5 openapi-diff CI
- Fenêtre : août 2026
- Format : post court 1200 chars

### Q-02 — "Cosign + SLSA L3 : signer mes images Docker pour zéro euro"
- Pillar : ai-security + dev-quality
- Source : v12 §4 W8
- Fenêtre : septembre 2026
- Format : post long 1500 chars

### Q-03 — "Renovate + rangeStrategy:pin : pourquoi je verrouille LangChain"
- Pillar : ai-security
- Source : v12 §4 LLM03 supply chain (3 CVEs LangChain 2024-2025)
- Fenêtre : septembre 2026
- Format : post court 1300 chars

### Q-04 — "Spec Kit : les specs EARS qui ont remplacé mes tickets Notion"
- Pillar : dev-quality
- Source : v12 §2 Spec Kit + GitHub Spec Kit
- Fenêtre : juillet 2026 (pré-W7)
- Format : post long 1500 chars

### Q-05 — "Memory Tool d'Anthropic en bêta : mes premiers retours"
- Pillar : ai-velocity
- Source : v12 §5 Anthropic Memory Tool
- Fenêtre : conditional, dès dispo en GA
- Format : post court 1300 chars

### Q-06 — "Verification-before-completion : la skill qui m'a évité 3 faux green"
- Pillar : dev-quality
- Source : v12 §1 D5 + skill superpowers déjà installée
- Fenêtre : juillet 2026
- Format : post long 1500 chars

### Q-07 — "MAST taxonomy : les 14 modes d'échec multi-agent que personne ne lit"
- Pillar : agent-arch
- Source : v12 §1 MAST 2025 (NeurIPS)
- Fenêtre : août 2026
- Format : article long 3000 chars (carousel possible)

## 5. Intégration calendaire — pivot pré-launch + cadence stable

### 5.1 Pré-launch tease (14-31 mai) — 5 posts v12 substitués à Livre I

| Jour | Date | Slot Livre I original | Substitution v12 | Livre I déplacé vers |
|---|---|---|---|---|
| J8 | 21 mai mer | `08-formateur.md` | **V12-04 "Prompt caching 5-10× billing"** | J27 (9 juin) |
| J9 | 22 mai jeu | `09b-les-extras.md` | **V12-03 "Opus pense, Sonnet code"** | J28 (10 juin) |
| J13 | 26 mai lun | `12-atlantic-bike.md` | ★ **V12-14 "J'ouvre /team en open-source"** | J21 (3 juin) |
| J15 | 28 mai mer | `14-zenfirst.md` | **V12-01 "9→6 agents"** | J29 (11 juin) |
| J16 | 29 mai jeu | `15-dix-huit-minutes.md` | **V12-08 "promptfoo CI"** | J30 (12 juin) |

**Calendrier Phase E (post-launch) ré-arrangé** : 5 Livre I déplacés + 3 posts roadmap Musaium (51, 52, 41) + transition Livre II = 8 jours (J21-J28). J29-J30 = nouveaux Livre II posts.

> **Update master plan §6** : Phase B (J12-J18) inclut désormais V12-14 (J13) + V12-01 (J15) + V12-08 (J16). Phase C (J19-J20) inclut V12-15 (J20 mar, conditionnel post-launch). 99-launch-j-plus-1 décale à J21.

### 5.2 Cadence stable post-J30 — posts v12 restants (juillet → novembre)

10 posts v12 NON consommés en pré-launch s'intercalent en cadence stable :

| Sem | Date jeudi | Slot d'origine ORDRE-PUBLICATION | Substitution v12 proposée |
|---|---|---|---|
| S6 | 23 juillet | `44-budget-couples.md` | **V12-02 "Agent qui dit stop"** |
| S13 | 10 sept | `35-3-ia-en-meme-temps.md` | **V12-05 "Prompt-Guard-2 86M local"** |
| S14 | 17 sept | `36-formation-solopreneurs.md` | **V12-06 "Indirect injection"** |
| S15 | 24 sept | `38-ssr-2-langues.md` | **V12-07 "Presidio output PII"** |
| S17 | 8 oct | `40-103-cve.md` | **V12-09 "Hash-chained audit log"** |
| S18 | 15 oct | `42-react-native-quand-on-vient-angular.md` | **V12-10 "Stryker mutation"** (si pas pris J17) |
| S19 | 22 oct | `54-ia-auditeur.md` | **V12-11 "fast-check guardrails"** |
| S20 | 29 oct | `58-mcp-civitai.md` | **V12-12 "Langfuse self-host"** |
| S21 | 5 nov | `68-conference-unitec.md` | **V12-13 "ast-grep codemods"** |
| S22 | 12 nov | `70-et-maintenant.md` | **Recap "/team open-source 6 mois après"** (à drafter selon traction) |

**Règle de substitution** : posts Livre II/III déplacés (pas supprimés) vers fin de cadence (décembre+) ou intercalés en bonus posts mardi.

## 6. Charge rédactionnelle additionnelle

15 nouveaux posts v12 + 7 idées qualité bonus = **22 posts potentiels** sur la fenêtre juillet → novembre 2026 (~20 semaines).

Estimation effort par post :
- 12 posts longs (1500-1600 chars) : 3h × 12 = **36h**
- 1 article long (V12-14 open-source) : 7h
- 2 posts courts : 2h × 2 = 4h
- Total **~47h sur 20 semaines = ~2.5h/semaine**

Cumulé avec cadence stable normale : reste tenable si Tim peut allouer **5-6h rédaction/semaine** hors v12 dev.

## 7. Dépendances roadmap v12 (synthèse pour publication safe)

| Post v12 | Dépendance technique | À ne PAS publier avant |
|---|---|---|
| V12-01 | Consolidation 9→6 done | W3 |
| V12-02 | process-auditor décrit | actuel (déjà OK) |
| V12-03 | Architect/Editor split + cost report | W4 |
| V12-04 | Cache warm-up sequencing | W4 |
| V12-05 | Prompt-Guard-2 staging | W5 |
| V12-06 | Indirect injection wrapper en prod | W5 |
| V12-07 | Presidio output déployé | W5 |
| V12-08 | promptfoo CI active | W5 |
| V12-09 | audit_log hash-chained en prod | W8 |
| V12-10 | Stryker installé + score mesuré | W6 |
| V12-11 | fast-check sur guardrails | W6 |
| V12-12 | Langfuse self-host live | W1 |
| V12-13 | ast-grep + 3 règles starter | W7 |
| V12-14 | TOUT v12 done + repo prep §3 | post-W8 + 4 sem stab |
| V12-15 | V12-14 published + traction | J+7 V12-14 |

## 8. Risques globaux pilier v12

| Risque | Probabilité | Atténuation |
|---|---|---|
| Roadmap v12 glisse → posts perdent fenêtre | medium | Posts indépendants : si W4 retarde, V12-03 retarde aussi, le reste continue |
| Sujet trop niche FR (audience small) | medium | Compense par save rate élevé (devs seniors) + reach dev anglo via cross-post Twitter/X |
| Open-source /team flop | medium-high | §3.7 atténuation : pas de campagne, repo vit sa vie |
| Burnout combiné (dev + écriture) | medium | Réduire à 8-10 posts si bande passante <2.5h/sem |
| Sécurité info révélée trop tôt | low | Tableau dépendances §7 strict |

## 9. Prochaines étapes (pivot pré-launch)

| Date | Action | Owner |
|---|---|---|
| 2026-05-02 | Tim valide ce pivot + démarre v12 W1-W8 sprint | Tim |
| 2026-05-13 | v12 implémenté + testé sur Musaium | Tim |
| 2026-05-14 | Démarrage séquence LinkedIn (J1) | Tim |
| 2026-05-19 | Repo `/team` prep release (extraction, README, audit IP leak) | Tim |
| 2026-05-20 | Beta privée /team → 5 devs FR | Tim |
| **2026-05-23** | **Schedule check J-3** : agent vérifie v12+team ready | scheduled agent |
| 2026-05-25 18h | GO/NO-GO open-source release | Tim |
| 2026-05-26 9h | Public release /team + V12-14 LinkedIn post | Tim |
| 2026-06-01 | Launch Musaium | Tim |
| 2026-06-02 | V12-15 retours J+7 open-source (conditionnel ≥30 stars) | Tim |
| 2026-07-01 | Reprise drafting v12 cadence stable (V12-02, V12-05+) | Tim |

## 10. Schedule readiness check (automatisé)

Agent scheduled vérifie 3 jours avant chaque milestone que tout est prêt. Voir `/schedule` cron créé en parallèle de cette annexe (cf. master plan §17).

Milestones à vérifier :
1. **2026-05-11** (J-3 sequence start 14 mai) : v12 implémentation status, posts J1-J5 prêts
2. **2026-05-23** (J-3 open-source release 26 mai) : repo `/team` ready, README testé beta, audit IP leak vide, V12-14 article drafté
3. **2026-05-29** (J-3 launch Musaium 1er juin) : NL-4/5/7/9 status, EAS build green, Apple Store ready, V12-14 traction métrique disponible

Format report agent :
- État chaque livrable (DONE / IN-PROGRESS / BLOCKED)
- Risque sur date cible
- Action corrective recommandée si blocker
- Décision GO/NO-GO recommandée

---

**Document v1 — 2026-05-01.** Annexe de NL_LINKEDIN_LAUNCH_PLAN. À réviser après décision arbitrage 22 posts → 12-15 sélectionnés selon bande passante effective.

# Véracité : un dev solo full-Claude peut-il livrer Musaium (3 apps, voice-first, RGPD, launch ~1 sem) ?

Date : 2026-05-31. Auteur : sous-agent cartographie-360. Posture : UFR-013 (vérifier avant d'affirmer). Toute donnée chiffrée du repo ci-dessous a été mesurée par commande, pas estimée.

## 1. Ce que dit la littérature 2024-2026 (réelle, nuancée)

### Le RCT METR 2025 — le contre-argument le plus solide
L'étude la mieux contrôlée sur le sujet ([METR, juillet 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/), [arXiv 2507.09089](https://arxiv.org/abs/2507.09089)) : 16 développeurs expérimentés, 246 tâches, tirage aléatoire AI-autorisé / AI-interdit. Résultat : **+19 % de temps de complétion AVEC l'IA** — un ralentissement, alors que les devs *prédisaient* −24 % et *estimaient après coup* −20 %. L'écart perception/réalité est total.

Mais — et c'est décisif pour notre verdict — METR borne explicitement sa généralisation. Le ralentissement est mesuré sur **des devs experts dans des codebases matures qu'ils connaissent par cœur (5 ans en moyenne)**. METR dit ne PAS avoir de preuve que le résultat tienne pour : développeurs moins expérimentés, **codebases non familières**, **projets greenfield**, ou usage avec « centaines/milliers d'essais ». Ils notent même de « forts effets d'apprentissage » possibles au-delà de leur niveau d'usage.

Implication pour Musaium : un fondateur solo sur un projet **neuf qu'il construit lui-même** est partiellement dans l'angle mort de METR (greenfield, codebase qu'on apprend en l'écrivant). Mais au fil des mois la codebase Musaium **devient** mature — et c'est précisément là que METR mesure le ralentissement. Le risque METR n'est pas annulé, il est *différé* : il se manifeste en maintenance, pas au sprint initial.

### DORA 2024→2025 — l'IA amplifie, ne crée pas
[DORA 2025](https://dora.dev/dora-report-2025/) ([annonce Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report)) : 90 % des répondants utilisent l'IA. Bascule vs 2024 : relation IA↔throughput devenue **positive**, MAIS relation IA↔**stabilité de livraison reste négative**. Sans systèmes de contrôle robustes — **tests automatisés forts, version control mature, feedback loops rapides** — l'augmentation du volume de changements produit de l'instabilité. Formule DORA : *« l'IA n'est pas un créateur d'excellence, c'est un amplificateur »*. Dans un système faible, elle amplifie la friction et le risque.

### La « gueule de bois du vibe coding » — la dette cachée documentée
Convergence de plusieurs sources 2025-2026 :
- [Veracode 2025 GenAI Code Security Report](https://www.uscsinstitute.org/cybersecurity-insights/blog/what-are-vibe-coding-security-risks-and-how-to-eliminate-them) : ~45 % du code IA contient une faille de sécurité ; face à un choix sûr/non-sûr, les LLM prennent la voie non-sûre près d'une fois sur deux.
- [Escape.tech](https://instatunnel.my/blog/vibe-coding-debt-the-security-risks-of-ai-generated-codebases) : sur 1 400+ apps vibe-codées en prod scannées, 65 % avaient des problèmes de sécurité, 58 % au moins une vuln critique (400+ secrets exposés, 175 cas de PII exposée).
- [CodeRabbit (déc. 2025)](https://www.infoq.com/news/2025/11/ai-code-technical-debt/) : code co-écrit par IA = 1,7× plus de problèmes « majeurs », misconfigs +75 %, vulns ×2,74. Un constat récurrent : **CSRF absent, security headers absents, SSRF** dans des apps générées sans revue.
- [Cloud Security Alliance](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/) : surge de CVE attribuables aux outils de coding IA.
- Risque structurel pour un solo non-technique : **comprehension debt** → bus-factor zéro (on possède un code qu'on ne sait pas débugger).

La littérature est claire sur le *mode d'échec* — moins sur des success-stories *vérifiées* d'apps prod « majoritairement IA ». Les récits Indie Hackers / Medium « j'ai shippé en 30 jours » existent mais sont anecdotiques et auto-rapportés (biais de survivant + biais perception METR). **Honnêteté : la preuve empirique solide va contre la sur-confiance, pas pour.**

## 2. Signaux du repo Musaium : maturité genuine ou façade ?

Mesures réelles (commandes, ce jour) : 688 fichiers de tests BE, 361 tests FE, **44 flows Maestro**, **26 sentinelles** (`scripts/sentinels/`), **65 ADR**, **23 workflows CI**, 14 skills, 10 agents. À recouper : le brief disait 24 sentinelles / 45 flows ; mesuré = 26 / 44 (écart mineur, ordre de grandeur confirmé).

Ce qui distingue Musaium des 1 400 apps vibe-codées d'Escape.tech — point par point contre les modes d'échec documentés :

| Mode d'échec documenté | Réponse présente dans le repo |
|---|---|
| CSRF absent (déc. 2025) | `museum-web/src/lib/api.ts` : CSRF centralisé (cookie→header `X-CSRF-Token`) |
| Secrets/PII exposés (Escape.tech) | RGPD : audit chain hash-chaînée, erasure, sanitize ; gate CI bloque `DB_SYNCHRONIZE=true` ; gate `PGP_KEY_PLACEHOLDER` |
| Failles d'injection LLM | Defense-in-depth 6 couches (ADR-015), fail-CLOSED (ADR-047), corpus adverse promptfoo 85×8×10 en CI |
| Dette invisible | `docs/TECH_DEBT.md` tracké ; **0 TODO/FIXME** dans `museum-backend/src` ; 188 `eslint-disable` mais sous gouvernance (justif ≥20 char + Approved-by) |
| « tests verts truqués » | UFR-022 frozen-test (hook sha256 byte-for-byte), red→green fresh-context, reviewer illimité |

Ces signaux pointent vers **maturité genuine, pas façade**. Raison : un repo-façade aurait des tests décoratifs et zéro mécanique anti-triche. Ici les sentinelles, le frozen-test, la chaîne d'audit et les ADR sont précisément les *control systems* que DORA 2025 désigne comme la condition pour que l'IA amplifie *positivement*. La discipline UFR-013/021/022 est l'antidote explicite au biais-perception de METR (on ne *croit* pas que c'est testé, un hook le *prouve*).

Réserves honnêtes (façade-risque résiduel) :
- 1 542 commits par un seul humain + IA : le **bus-factor reste ~1**. La doctrine documente le code, mais la comprehension debt vit dans une seule tête.
- Beaucoup de discipline est *récente* (UFR-022 mai 2026) : la robustesse en maintenance long-terme n'est pas encore prouvée empiriquement — c'est exactement la fenêtre où METR mesure le ralentissement.
- Tests nombreux ≠ couverture des bons chemins. Le volume est un *signal* de sérieux, pas une preuve de qualité ; la mémoire repo elle-même note des suites integration fragiles (845 fails en mode `--forceExit=false`).

## 3. Verdict honnête

**Le scope (3 apps, voice-first, RGPD) est ambitieux mais cohérent avec ce qu'un solo + IA *discipliné* peut produire en 2026 — à condition que les control systems existent. Ils existent ici.** C'est ce qui sépare Musaium du cas-type vibe-coding catastrophe.

**La timeline « launch ~1 semaine » est le point de sur-promesse le plus probable, pas le scope.** La littérature converge : l'IA accélère le throughput (DORA) mais dégrade la stabilité, et la dette/sécurité se paie en différé (6-12 mois — vibe-coding hangover). Un launch daté à la semaine près sur un produit RGPD voice-first est exposé non au « peut-on le construire » (oui, c'est largement bâti) mais au « la stabilité tiendra-t-elle au volume réel » — précisément le risque DORA non résolu par la vitesse. Cohérent d'ailleurs avec la posture interne du repo (GO_WITH_RISKS, blockers ops résiduels, « V1 minimum à reconfirmer »).

Synthèse : **pas de sur-promesse sur la faisabilité technique ; sur-promesse latente sur la date et sur la soutenabilité en maintenance.** Les signaux repo indiquent une maturité réelle (control systems présents, anti-triche structurel), ce qui est rare et place Musaium dans le quartile haut des projets solo-IA — mais ne neutralise ni le bus-factor ~1 ni le risque de stabilité différé documenté par METR/DORA.

## Sources
- METR RCT 2025 — https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ et https://arxiv.org/abs/2507.09089
- DORA State of AI-assisted Software Development 2025 — https://dora.dev/dora-report-2025/
- DORA 2024 — https://dora.dev/research/2024/dora-report/
- InfoQ / CodeRabbit — AI code technical debt — https://www.infoq.com/news/2025/11/ai-code-technical-debt/
- Cloud Security Alliance — AI-generated code vuln surge — https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/
- InstaTunnel / Escape.tech scan 1400 apps — https://instatunnel.my/blog/vibe-coding-debt-the-security-risks-of-ai-generated-codebases
- Veracode 2025 via USCSI — https://www.uscsinstitute.org/cybersecurity-insights/blog/what-are-vibe-coding-security-risks-and-how-to-eliminate-them

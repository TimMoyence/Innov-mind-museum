# NL_LINKEDIN_COPY_KIT — Kit copywriting Musaium

**Annexe opérationnelle de** [`NL_LINKEDIN_LAUNCH_PLAN.md`](NL_LINKEDIN_LAUNCH_PLAN.md)
**Rédigé** : 2026-05-01
**Usage** : voix, templates, CTA library, assets HTML, editorial guardrails. À utiliser pour CHAQUE publication de la séquence 14 mai → 30 juin.

---

## 1. Charte de voix

### 1.1 Vocabulaire

**Whitelist (mots Tim utilise réellement)**

- **Verbes** : *bosser, livrer, sortir, casser, monter, virer, refaire, creuser, tester, mesurer, encaisser, planter, débloquer, trancher, assumer, empiler, démonter, réécrire, valider, douter*
- **Substantifs** : *commit, branche, rollback, archi, stack, module, bug, feature, prod, staging, latence, prompt, token, payload, repo, PR, hotfix, dette, refacto, monorepo, garde-fou, fallback, MVP, ratchet, timeout, retry, cache, garde, pipeline*
- **Adjectifs** : *court, brut, propre, sale, cassé, lisible, têtu, lent, moche, foireux, solide, bancal, honnête, chiant, simple, faisable, mesurable*
- **Connecteurs** : *du coup, sauf que, en fait, sauf qu'en pratique, sur le papier, en vrai, bref, conclusion*
- **Amorces de phrase** : *Bilan :*, *Verdict :*, *Conclusion :*, *Le truc c'est que*, *Première version :*, *Vraie raison :*

**Blacklist absolue (à ne JAMAIS écrire)**

`thrilled, excited, delighted, amazing, journey, ravi, heureux d'annoncer, fier de présenter, c'est avec émotion, game changer, disruptif, révolutionnaire, état de l'art, best-in-class, écosystème, synergie, valeur ajoutée, accompagner, embarquer, transformer la vie, changer le monde, passionné par, expert en, leader, innovant, ROI exponentiel, 10x, hyper-, ultra-, méga-, magique, incroyable, fantastique, génial, top, super, hâte de, j'ai le plaisir, fier d'annoncer, after months of hard work`

**Banni aussi** : tournures à la 3e personne pour parler de soi (*"Tim a livré..."*), superlatifs sans chiffre (*"très rapide"* → *"320ms p95"*), métaphores corporate (*"voyage, aventure, défi"*).

### 1.2 Patterns de hooks (10 modèles à remplir)

Format : `[ELEMENT]` = variable à remplacer.

1. **Chiffre singulier + ancre perso** — `[NOMBRE] [UNITÉ] plus tard, [PERSONNE/CHOSE] est toujours [ÉTAT].`
2. **Affirmation contrariante** — `Toutes les [CATÉGORIE] ne se valent pas.`
3. **Story opener court** — `Mon premier [ROLE] s'appelle [PRÉNOM]. [PHRASE FACTUELLE 8 MOTS].`
4. **Révélation technique** — `[NOMBRE] lignes. C'est le [SUPERLATIF FACTUEL] de mon projet.`
5. **Aveu d'erreur** — `J'ai mis [DURÉE] à comprendre [CHOSE TRIVIALE EN APPARENCE].`
6. **Comparaison déstabilisante** — `[OPTION A] coûte [CHIFFRE A]. [OPTION B] coûte [CHIFFRE B]. J'ai choisi [B/A] et voilà pourquoi.`
7. **Inversion de promesse** — `On m'avait vendu [PROMESSE]. Voilà ce que j'ai eu en vrai.`
8. **Métrique brute en ouverture** — `[MÉTRIQUE]. Pas de contexte. Pas de slide. Lis la suite.`
9. **Question qui pique** — `Combien de [CHOSE] vous avez réellement [VERBE] ce mois-ci ?`
10. **Date + verdict** — `[JJ MOIS] : [DÉCISION TRANCHÉE EN 6 MOTS].`

### 1.3 Patterns de closings (8 modèles + exemples Tim-style)

1. **Révélation/twist** — *"Ce module fait 200 lignes. Le reste du repo en fait 47k. Devine qui me réveille la nuit."*
2. **Généralisation philo** — *"On code pour des humains. On finit toujours par se rappeler lesquels."*
3. **Défi doux** — *"Essaie de mesurer ton p95 cette semaine. Tu vas pas aimer."*
4. **Question ouverte vraie** — *"Quelqu'un a déjà tourné un circuit breaker LangChain en prod ? Je suis preneur du retour."*
5. **Contre-pied du hook** — *"Bref, 414 commits. Et Louison s'en fout."*
6. **Liste sèche 3 lignes** — *"Trois choses que je referais pareil : 1) hexagonal dès J1. 2) migrations CLI only. 3) test factories partout."*
7. **Date posée** — *"1er juin. On verra bien."*
8. **Constat sec** — *"Ça marche. C'est moche. Je dors."*

### 1.4 Règles de ponctuation et rythme

- **Phrase moyenne** : 9 à 14 mots. Cible 11.
- **Ratio fragment / phrase complète** : 40/60. Au moins une phrase fragment toutes les 4 lignes.
- **Pas de point-virgule.** Jamais. Tim n'en met pas.
- **Tirets longs (—) autorisés** pour incise rapide. Maximum 2 par post.
- **Listes à puces** : oui pour techniques (architecture, métriques). Jamais pour "values" ou "soft skills".
- **Majuscules** : aucune en milieu de phrase pour insister. Pas de CAPS LOCK.
- **Italique/gras** : zéro. LinkedIn flatten de toute façon.
- **Ellipses (...)** : interdites.
- **Émojis dans le corps** : zéro. Hashtags 5-8 en fin uniquement.
- **Sauts de ligne** : un saut entre chaque phrase courte ou bloc de 2 phrases. Aération maximale.

---

## 2. Templates (5 squelettes prêts à remplir)

### Template 1 — Deep-dive technique (article long, 3000-4500 chars)

**Quand utiliser** : poser ton expertise sur un choix d'archi non-évident, attirer devs seniors, générer débat technique.

**Structure**

| Section | Wordcount cible | Instruction |
|---|---|---|
| Hook | 1 ligne, 8-15 mots | Pattern 4 ou 6 (révélation technique ou comparaison chiffrée) |
| Contexte problème | 80-120 mots | Quel besoin produit, quelle contrainte. Aucun jargon non sourcé. |
| Première tentative qui a planté | 100-150 mots | Avoue ce qui n'a pas marché. Chiffres si possible. |
| Solution retenue + diagramme texte | 150-250 mots | Archi en table ou pseudo-code. Pas de vague. |
| Métriques avant/après | 60-100 mots | 3 à 5 chiffres sourcés (git log, benchmarks, monitoring) |
| Ce que ça change concrètement | 60-100 mots | Impact utilisateur ou impact dette |
| Closing | 1-2 lignes | Pattern 1, 4 ou 7 |
| Hashtags | 5-8 | `#dev #langchain #typescript #archi #buildinpublic` |

**Exemple rempli (publiable tel quel)**

> 200 lignes. C'est le fichier le plus important de mon projet.
>
> Musaium tourne sur LangChain avec trois providers en fallback : OpenAI, Deepseek, Google. Sur le papier c'est robuste. En vrai, le premier provider qui timeout faisait planter toute la requête utilisateur. Latence p95 mesurée sur staging la semaine dernière : 8400ms quand OpenAI ramait. Pas exploitable.
>
> Première tentative : retry simple avec exponential backoff. Résultat — la requête finissait par passer mais l'utilisateur attendait 12 secondes devant un écran figé. J'ai jeté.
>
> Deuxième tentative : circuit breaker maison. 200 lignes de TypeScript dans `langchain.orchestrator.ts`. Le pattern est simple :
>
> | État | Comportement |
> |---|---|
> | CLOSED | Toutes les requêtes passent au provider |
> | OPEN | On bascule provider suivant immédiatement, zéro retry |
> | HALF_OPEN | Une requête de test toutes les 30s pour voir si le provider est revenu |
>
> Le seuil d'ouverture : 5 échecs en 60s. Reset après 30s sans erreur. Rien d'exotique, juste appliqué proprement à la chaîne LLM.
>
> Bilan mesuré sur 200 sessions de test :
> - p95 descendu à 1900ms quand un provider tombe.
> - Taux d'échec utilisateur : 0.4% contre 6% avant.
> - Zéro requête bloquée plus de 3s.
>
> Ce que ça change : l'utilisateur ne voit plus jamais OpenAI tomber. Il voit Musaium répondre. Le coût d'un fallback Deepseek est 8x moins cher qu'OpenAI, donc en bonus ça baisse la facture LLM d'environ 30% les jours de panne amont.
>
> 200 lignes. Le reste du repo en fait 47k. Devine qui me réveille la nuit.
>
> #langchain #typescript #devmlops #buildinpublic #musaium #archi

**Variations** (3 angles)

1. **Angle perf** : "200 lignes. C'est le fichier qui a divisé mon p95 par 4."
2. **Angle coût** : "200 lignes. C'est le fichier qui m'a fait économiser 380€/mois d'OpenAI."
3. **Angle dette** : "200 lignes. C'est le seul fichier que j'ai pas envie de toucher."

### Template 2 — Retour d'expérience IA (post 1400-1600 chars)

**Quand utiliser** : apprentissage IA contre-intuitif, court, percutant. Format hebdo idéal.

**Structure**

| Section | Cible | Instruction |
|---|---|---|
| Hook | 1 ligne | Pattern 6 ou 8 |
| Le piège | 2-3 lignes | Ce que tout le monde croit |
| Ce que j'ai mesuré | 4-6 lignes avec chiffres sourcés | Test concret, conditions précises |
| La leçon brute | 2-3 lignes | Pas de morale. Constat. |
| Closing | 1-2 lignes | Pattern 3 ou 4 |
| Hashtags | 5-7 | |

**Exemple rempli**

> Voice IA à $0.001 par prompt. C'est le chiffre qu'on m'a vendu en conf.
>
> Le piège : ce coût correspond à un prompt de 100 tokens en sortie texte pure. Personne ne précise.
>
> Ce que j'ai mesuré sur Musaium en mode Voice (STT + LLM + TTS) :
> - STT gpt-4o-mini-transcribe sur 8 secondes audio : $0.0012
> - LLM réponse moyenne 180 tokens out : $0.0018
> - TTS gpt-4o-mini-tts sortie 12 secondes : $0.0023
> - Total moyen par tour de conversation : $0.0053
>
> Soit 5x le chiffre annoncé. Sur 1000 utilisateurs faisant 10 tours par visite, ça fait $53 par session de musée. Pas $10.
>
> La leçon : en Voice IA, le coût n'est jamais le LLM. C'est la chaîne complète. Le TTS représente 43% de ma facture, pas l'inverse.
>
> Essaie de mesurer le coût réel d'un tour Voice cette semaine. Tu vas pas aimer.
>
> #voiceai #llm #openai #buildinpublic #musaium

**Variations**

1. **Angle latence** : "Streaming SSE censé être instantané. Voilà mes vraies courbes."
2. **Angle hallucination** : "Mon guardrail attrape 94% des dérives. Les 6% qui passent."
3. **Angle multi-langue** : "Mon prompt marche en français. En arabe il s'effondre."

### Template 3 — Cheat sheet / checklist (carousel 7 slides)

**Quand utiliser** : maximiser save/share. Format réutilisable, valeur immédiate.

**Structure** (max 7 slides, 40-60 chars par ligne)

| Slide | Contenu | Cible chars |
|---|---|---|
| 1 — Couverture | Titre + sous-titre + nom | 80 chars total |
| 2 — Le problème | 1 question + 2 lignes contexte | 120 chars |
| 3 — Règle 1 | Numéro + verbe + bénéfice | 100 chars |
| 4 — Règle 2 | Idem | 100 chars |
| 5 — Règle 3 | Idem | 100 chars |
| 6 — Règle 4 | Idem | 100 chars |
| 7 — CTA | Question ouverte + handle | 80 chars |

**Caption post associée** (300-500 chars) : hook pattern 9 + une ligne contexte + "Carousel ci-dessous, 7 slides, 90 secondes."

**Exemple rempli — sujet "Sécuriser un pipeline LLM en prod"**

**Caption post**
> Combien de prompts vous avez vraiment audités ce mois-ci ?
>
> J'ai construit Musaium avec 4 garde-fous LLM. Aucun n'est exotique. Tous ont sauvé une démo au moins une fois.
>
> Carousel ci-dessous, 7 slides, 90 secondes.
>
> #llm #security #langchain #buildinpublic #musaium

**Slides**

> **Slide 1 — Couverture**
> 4 garde-fous LLM
> que j'aurais aimé connaître avant
> — Tim Moyence, Musaium

> **Slide 2 — Le problème**
> Un LLM en prod ment, dérive, fuit.
> Sans garde-fous, ton support encaisse.

> **Slide 3 — Règle 1**
> 1. Filtre l'input avant le LLM
> Mots-clés interdits + injection.
> Coût : 0ms. Bloque 60% des dérives.

> **Slide 4 — Règle 2**
> 2. Isole les instructions système
> Marqueur [END OF SYSTEM INSTRUCTIONS]
> entre prompt système et user input.

> **Slide 5 — Règle 3**
> 3. Sanitize chaque champ utilisateur
> Unicode, zero-width, troncature.
> Avant l'inclusion dans le prompt.

> **Slide 6 — Règle 4**
> 4. Filtre l'output aussi
> Mêmes règles qu'à l'input.
> Le LLM n'est pas ton dernier rempart.

> **Slide 7 — CTA**
> Lequel tu n'as pas encore mis ?
> Repo Musaium en commentaire.

**Variations**

1. **Angle dev** : "5 erreurs TypeORM qui m'ont coûté un week-end."
2. **Angle produit** : "6 décisions UX qu'on prend trop tard sur une app IA."
3. **Angle archi** : "7 questions à se poser avant de coller un cache Redis."

### Template 4 — Lancement / annonce produit (post 1200-1600 chars + lien)

**Quand utiliser** : annonce milestone produit. Beta, sortie, fonctionnalité majeure. À garder rare.

**Structure**

| Section | Cible | Instruction |
|---|---|---|
| Hook | 1 ligne | Pattern 1 ou 10 |
| Ce que c'est, en 1 phrase | 1 ligne | Aucun adjectif marketing |
| Pourquoi je l'ai fait | 3-4 lignes | Origine concrète, pas mission statement |
| Ce que ça fait aujourd'hui | 4-6 lignes en liste | Verbes d'action. Pas de promesse non livrable. |
| Ce que ça ne fait PAS encore | 2-3 lignes | Aveu honnête. Crédibilise tout le reste. |
| Comment l'essayer | 2 lignes + lien | Direct |
| Closing | 1 ligne | Pattern 7 ou 8 |
| Hashtags | 5-8 | |

**Exemple rempli**

> 1er juin. La beta Musaium ouvre.
>
> Musaium, c'est une app mobile qui répond aux questions des visiteurs de musée à partir d'une photo d'œuvre.
>
> Pourquoi : ma copine s'est endormie devant un cartel au Louvre l'an dernier. J'ai compris que le problème n'était pas le musée, c'était le format. Personne n'a envie de lire 400 mots debout devant un Vermeer.
>
> Ce que la beta fait au 1er juin :
> - Photo d'œuvre, réponse contextuelle en 8 langues
> - Question vocale, réponse vocale (pipeline STT → LLM → TTS)
> - 47 musées français déjà géolocalisés
> - Conversation sauvegardée en local + cloud
> - Mode hors-ligne pour les œuvres déjà vues
>
> Ce que la beta ne fait PAS :
> - Pas de réalité augmentée. Trop tôt, batterie pas tenable.
> - Pas de paiement billet musée. Hors scope V1.
> - iOS uniquement au lancement. Android suit en V1.1.
>
> TestFlight ouvert le 1er juin. Lien d'inscription en commentaire.
>
> 1er juin. On verra bien.
>
> #musaium #buildinpublic #ai #mobile #reactnative #langchain

**Variations**

1. **Angle "j'ouvre la beta"** : appel beta-testeurs ciblés
2. **Angle "feature ship"** : sortie voix ou géoloc
3. **Angle "premier client payant"** : milestone humain (cf. Louison pattern)

### Template 5 — Post court teasing (800-1200 chars)

**Quand utiliser** : maintenir rythme entre deux gros posts. Hook fort, pas de révélation. Crée attente.

**Structure**

| Section | Cible | Instruction |
|---|---|---|
| Hook | 1 ligne très courte | Pattern 4, 8 ou 10 |
| Détail intriguant | 2-3 lignes | Ouvres une porte sans la franchir |
| Mini-anecdote | 3-4 lignes | Concrète, datée si possible |
| Suspension | 1-2 lignes | Annonces sans livrer |
| Closing | 1 ligne | Pattern 5 ou 7 |
| Hashtags | 4-6 | |

**Exemple rempli**

> 47 migrations TypeORM. Une seule m'a fait perdre une nuit.
>
> Pas la plus longue. Pas la plus complexe. Une migration de 12 lignes qui ajoutait une colonne nullable.
>
> Mardi 2h du matin, le déploiement staging passe vert. Mercredi 7h, j'ouvre Sentry. 1400 erreurs en file d'attente. Une seule cause. Une seule colonne mal typée.
>
> Je raconte la suite en détail dans un article cette semaine. Avec le diff exact et le rollback que j'ai dû écrire en panique.
>
> Bref, 47 migrations. Et celle de 12 lignes.
>
> #typeorm #postgres #devops #buildinpublic #musaium

**Variations**

1. **Angle bug en prod** : "Ce matin, 1400 erreurs Sentry. Une seule virgule en cause."
2. **Angle découverte** : "Je viens de comprendre pourquoi mon TTS coûte 3x plus cher en arabe."
3. **Angle décision** : "J'ai supprimé 800 lignes ce matin. Tout marche mieux."

---

## 3. CTA library (15 variantes classées)

Toutes ces CTA passent le test : Tim les dirait sans grincer.

### 3.1 CTA "lien beta Musaium" (intensité croissante)

1. *"Beta ouverte le 1er juin. Lien en commentaire si tu veux y être."*
2. *"Si tu visites un musée d'ici fin juin, le TestFlight Musaium est en commentaire. Retours bruts appréciés."*
3. *"J'ai besoin de 50 testeurs pour stresser le pipeline Voice avant le 1er juin. Inscription en commentaire, je réponds à chaque message."*

### 3.2 CTA "lien GitHub / portfolio"

1. *"Le repo est public. Lien en commentaire pour ceux que l'archi intéresse."*
2. *"Code source ici, organisation hexagonale détaillée dans le README : [lien]"*
3. *"Si tu bosses sur du LangChain en prod, j'ai mis le module circuit breaker en open source. Lien en commentaire."*

### 3.3 CTA "abonner newsletter / contact"

1. *"Je documente le build du 1er mai au 1er juin. Newsletter hebdo sans tracking en commentaire."*
2. *"Tu construis un truc similaire ? Écris-moi en DM, je partage volontiers les chiffres bruts."*
3. *"Pour suivre le journal de build sans LinkedIn, l'inscription mail est en commentaire. Une édition par semaine, max."*

### 3.4 CTA implicites (question, défi, twist)

1. *"Quelqu'un a déjà mesuré le coût réel d'un tour Voice complet ? Je suis curieux de comparer."*
2. *"Essaie de chiffrer ton p95 LLM cette semaine. Reviens me dire."*
3. *"200 lignes. Le reste du repo en fait 47k. Devine qui me réveille la nuit."*

### 3.5 CTA "republication / commentaire" (subtiles)

1. *"Si ce constat parle à un dev qui galère avec LangChain, transfère-lui."*
2. *"Tu fais autrement ? Mets ta version en commentaire, je veux comparer."*
3. *"Ce post sera utile à exactement trois personnes. Si tu en connais une, tag-la."*

---

## 4. Visual assets — 6 templates HTML

Tous autonomes, ouvrables en navigateur, screenshotables. Palette : noir `#0a0a0a`, blanc `#fafafa`, accent `#f97316` (orange Musaium), gris `#71717a`. Typo : `IBM Plex Sans` pour texte, `IBM Plex Mono` pour code. Fallbacks system fonts.

**Workflow génération asset** : ouvrir HTML dans navigateur → DevTools device toolbar (taille exacte) → screenshot. Ou : Playwright headless `page.screenshot({path, clip})`.

### 4.1 Quote card (1080x1080, slide carousel)

**Use case** : slide carousel avec un chiffre énorme et une phrase courte. Récap métrique.

**Variables** : `TITLE`, `METRIC_VALUE`, `METRIC_UNIT`, `SUBTEXT`, `AUTHOR`.

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Quote card</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
  .card { width: 1080px; height: 1080px; background: #fafafa; padding: 96px; display: flex; flex-direction: column; justify-content: space-between; position: relative; }
  .title { font-size: 36px; font-weight: 600; color: #71717a; letter-spacing: -0.5px; }
  .metric-block { display: flex; flex-direction: column; gap: 24px; }
  .metric-value { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 280px; font-weight: 500; color: #0a0a0a; line-height: 0.9; letter-spacing: -8px; }
  .metric-unit { font-family: 'IBM Plex Mono', monospace; font-size: 56px; color: #f97316; font-weight: 500; }
  .subtext { font-size: 42px; line-height: 1.3; color: #0a0a0a; max-width: 800px; font-weight: 400; }
  .footer { display: flex; justify-content: space-between; align-items: center; font-family: 'IBM Plex Mono', monospace; font-size: 22px; color: #71717a; }
  .accent-bar { position: absolute; top: 0; left: 0; height: 12px; width: 100%; background: #f97316; }
</style>
</head>
<body>
  <div class="card">
    <div class="accent-bar"></div>
    <div class="title">TITLE</div>
    <div class="metric-block">
      <div class="metric-value">METRIC_VALUE</div>
      <div class="metric-unit">METRIC_UNIT</div>
    </div>
    <div class="subtext">SUBTEXT</div>
    <div class="footer">
      <span>AUTHOR</span>
      <span>musaium.app</span>
    </div>
  </div>
</body>
</html>
```

### 4.2 Architecture diagram card (1200x675, paysage)

**Use case** : diagramme d'archi en boxes/arrows pur HTML/CSS, pour expliquer un pipeline.

**Variables** : `TITLE`, `BOX_1_LABEL`, `BOX_2_LABEL`, `BOX_3_LABEL`, `BOX_4_LABEL`, `FOOTNOTE`.

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Architecture diagram</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
  .card { width: 1200px; height: 675px; background: #fafafa; padding: 56px 64px; display: flex; flex-direction: column; gap: 40px; position: relative; }
  .accent-bar { position: absolute; top: 0; left: 0; height: 8px; width: 100%; background: #f97316; }
  .title { font-size: 32px; font-weight: 600; color: #0a0a0a; letter-spacing: -0.5px; }
  .pipeline { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex: 1; }
  .box { background: #fff; border: 2px solid #0a0a0a; border-radius: 8px; padding: 28px 24px; flex: 1; min-height: 140px; display: flex; align-items: center; justify-content: center; text-align: center; font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #0a0a0a; line-height: 1.4; }
  .box.accent { border-color: #f97316; background: #fff7ed; }
  .arrow { font-family: 'IBM Plex Mono', monospace; font-size: 32px; color: #71717a; flex-shrink: 0; }
  .footnote { font-family: 'IBM Plex Mono', monospace; font-size: 16px; color: #71717a; border-top: 1px solid #e4e4e7; padding-top: 20px; }
</style>
</head>
<body>
  <div class="card">
    <div class="accent-bar"></div>
    <div class="title">TITLE</div>
    <div class="pipeline">
      <div class="box">BOX_1_LABEL</div>
      <div class="arrow">→</div>
      <div class="box accent">BOX_2_LABEL</div>
      <div class="arrow">→</div>
      <div class="box">BOX_3_LABEL</div>
      <div class="arrow">→</div>
      <div class="box">BOX_4_LABEL</div>
    </div>
    <div class="footnote">FOOTNOTE</div>
  </div>
</body>
</html>
```

### 4.3 Cheat sheet 1-page PDF (A4, 3 colonnes)

**Use case** : référence rapide dev, exportable PDF (Cmd+P → Save as PDF).

**Variables** : `SHEET_TITLE`, `SHEET_SUBTITLE`, 9× `ITEM_X_TITLE` + `ITEM_X_BODY`.

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Cheat sheet</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap');
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #fafafa; font-family: 'IBM Plex Sans', system-ui, sans-serif; color: #0a0a0a; }
  .sheet { width: 210mm; min-height: 297mm; padding: 18mm; display: flex; flex-direction: column; gap: 12mm; }
  header { border-bottom: 2px solid #0a0a0a; padding-bottom: 8mm; }
  h1 { font-size: 24pt; font-weight: 600; letter-spacing: -0.5px; }
  .subtitle { font-family: 'IBM Plex Mono', monospace; font-size: 10pt; color: #71717a; margin-top: 4mm; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6mm; }
  .item { border-left: 3px solid #f97316; padding: 4mm 0 4mm 5mm; }
  .item-title { font-family: 'IBM Plex Mono', monospace; font-size: 10pt; font-weight: 500; color: #0a0a0a; margin-bottom: 2mm; }
  .item-body { font-size: 9pt; line-height: 1.5; color: #404040; }
  footer { margin-top: auto; border-top: 1px solid #e4e4e7; padding-top: 6mm; font-family: 'IBM Plex Mono', monospace; font-size: 8pt; color: #71717a; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <h1>SHEET_TITLE</h1>
      <div class="subtitle">SHEET_SUBTITLE</div>
    </header>
    <div class="grid">
      <div class="item"><div class="item-title">ITEM_1_TITLE</div><div class="item-body">ITEM_1_BODY</div></div>
      <div class="item"><div class="item-title">ITEM_2_TITLE</div><div class="item-body">ITEM_2_BODY</div></div>
      <div class="item"><div class="item-title">ITEM_3_TITLE</div><div class="item-body">ITEM_3_BODY</div></div>
      <div class="item"><div class="item-title">ITEM_4_TITLE</div><div class="item-body">ITEM_4_BODY</div></div>
      <div class="item"><div class="item-title">ITEM_5_TITLE</div><div class="item-body">ITEM_5_BODY</div></div>
      <div class="item"><div class="item-title">ITEM_6_TITLE</div><div class="item-body">ITEM_6_BODY</div></div>
      <div class="item"><div class="item-title">ITEM_7_TITLE</div><div class="item-body">ITEM_7_BODY</div></div>
      <div class="item"><div class="item-title">ITEM_8_TITLE</div><div class="item-body">ITEM_8_BODY</div></div>
      <div class="item"><div class="item-title">ITEM_9_TITLE</div><div class="item-body">ITEM_9_BODY</div></div>
    </div>
    <footer>
      <span>Tim Moyence — musaium.app</span>
      <span>v1 · 2026</span>
    </footer>
  </div>
</body>
</html>
```

### 4.4 Code snippet card (1080x1080, syntax-coloré)

**Use case** : montrer un bout de code dans un post technique.

**Variables** : `SNIPPET_TITLE`, `LANG_LABEL`, code lines (modifier le bloc `<pre>` directement, classes `.kw .fn .str .com .num`).

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Code snippet card</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
  .card { width: 1080px; height: 1080px; background: #0a0a0a; padding: 64px; display: flex; flex-direction: column; gap: 32px; }
  .header { display: flex; justify-content: space-between; align-items: center; }
  .title { font-size: 32px; font-weight: 600; color: #fafafa; letter-spacing: -0.5px; }
  .lang { font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #f97316; padding: 6px 14px; border: 1px solid #f97316; border-radius: 4px; }
  .editor { flex: 1; background: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
  .tab-bar { background: #27272a; padding: 12px 20px; display: flex; gap: 12px; align-items: center; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .dot.r { background: #ef4444; } .dot.y { background: #eab308; } .dot.g { background: #22c55e; }
  pre { flex: 1; padding: 32px; font-family: 'IBM Plex Mono', monospace; font-size: 22px; line-height: 1.6; color: #e4e4e7; overflow: auto; }
  .kw { color: #f97316; } /* keyword */
  .fn { color: #60a5fa; } /* function */
  .str { color: #86efac; } /* string */
  .com { color: #71717a; font-style: italic; } /* comment */
  .num { color: #fbbf24; } /* number */
  .footer { font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #71717a; text-align: right; }
</style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="title">SNIPPET_TITLE</div>
      <div class="lang">LANG_LABEL</div>
    </div>
    <div class="editor">
      <div class="tab-bar"><div class="dot r"></div><div class="dot y"></div><div class="dot g"></div></div>
<pre><span class="com">// circuit breaker — extrait simplifié</span>
<span class="kw">if</span> (state === <span class="str">'OPEN'</span>) {
  <span class="kw">return</span> <span class="fn">tryNextProvider</span>(req)
}
<span class="kw">if</span> (failures &gt; <span class="num">5</span>) {
  state = <span class="str">'OPEN'</span>
  <span class="fn">setTimeout</span>(reset, <span class="num">30000</span>)
}</pre>
    </div>
    <div class="footer">musaium.app · langchain.orchestrator.ts</div>
  </div>
</body>
</html>
```

### 4.5 Comparison table card (1200x675, 3 colonnes)

**Use case** : comparer 2 ou 3 options (avant/après, A/B/C, naïf/correct/optimal).

**Variables** : `TITLE`, `COL_X_LABEL`, `ROW_X_LABEL`, `CELL_X_Y`. Colonne 3 surlignée accent.

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Comparison table</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
  .card { width: 1200px; height: 675px; background: #fafafa; padding: 56px; display: flex; flex-direction: column; gap: 32px; position: relative; }
  .accent-bar { position: absolute; top: 0; left: 0; height: 8px; width: 100%; background: #f97316; }
  .title { font-size: 32px; font-weight: 600; color: #0a0a0a; letter-spacing: -0.5px; }
  table { width: 100%; border-collapse: collapse; flex: 1; }
  th, td { padding: 18px 20px; text-align: left; font-size: 18px; border-bottom: 1px solid #e4e4e7; }
  th { font-family: 'IBM Plex Mono', monospace; font-weight: 500; color: #71717a; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
  th.highlight, td.highlight { background: #fff7ed; color: #0a0a0a; border-left: 3px solid #f97316; }
  td.label { font-family: 'IBM Plex Mono', monospace; font-size: 16px; color: #0a0a0a; font-weight: 500; }
  td.value { font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #404040; }
  .footer { font-family: 'IBM Plex Mono', monospace; font-size: 14px; color: #71717a; }
</style>
</head>
<body>
  <div class="card">
    <div class="accent-bar"></div>
    <div class="title">TITLE</div>
    <table>
      <thead>
        <tr>
          <th></th>
          <th>COL_1_LABEL</th>
          <th>COL_2_LABEL</th>
          <th class="highlight">COL_3_LABEL</th>
        </tr>
      </thead>
      <tbody>
        <tr><td class="label">ROW_1_LABEL</td><td class="value">CELL_1_1</td><td class="value">CELL_1_2</td><td class="value highlight">CELL_1_3</td></tr>
        <tr><td class="label">ROW_2_LABEL</td><td class="value">CELL_2_1</td><td class="value">CELL_2_2</td><td class="value highlight">CELL_2_3</td></tr>
        <tr><td class="label">ROW_3_LABEL</td><td class="value">CELL_3_1</td><td class="value">CELL_3_2</td><td class="value highlight">CELL_3_3</td></tr>
        <tr><td class="label">ROW_4_LABEL</td><td class="value">CELL_4_1</td><td class="value">CELL_4_2</td><td class="value highlight">CELL_4_3</td></tr>
      </tbody>
    </table>
    <div class="footer">musaium.app — mesures terrain, mai 2026</div>
  </div>
</body>
</html>
```

### 4.6 Launch banner (1200x675, partage post 1er juin)

**Use case** : visuel de lancement officiel à coller dans le post du 1er juin.

**Variables** : `LAUNCH_DATE`, `PRODUCT_NAME`, `TAGLINE`, `URL`.

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Launch banner</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #18181b; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
  .banner { width: 1200px; height: 675px; background: #0a0a0a; display: flex; flex-direction: column; justify-content: space-between; padding: 72px; position: relative; overflow: hidden; }
  .grid-bg { position: absolute; inset: 0; background-image: linear-gradient(#27272a 1px, transparent 1px), linear-gradient(90deg, #27272a 1px, transparent 1px); background-size: 60px 60px; opacity: 0.4; }
  .accent-circle { position: absolute; top: -200px; right: -200px; width: 600px; height: 600px; border-radius: 50%; background: radial-gradient(circle, #f97316 0%, transparent 65%); opacity: 0.35; }
  .top { position: relative; display: flex; justify-content: space-between; align-items: center; }
  .date-tag { font-family: 'IBM Plex Mono', monospace; font-size: 18px; color: #f97316; padding: 8px 16px; border: 1px solid #f97316; border-radius: 4px; }
  .signature { font-family: 'IBM Plex Mono', monospace; font-size: 16px; color: #71717a; }
  .center { position: relative; }
  .product-name { font-size: 144px; font-weight: 700; color: #fafafa; letter-spacing: -6px; line-height: 0.95; }
  .tagline { font-size: 32px; color: #a1a1aa; margin-top: 24px; max-width: 800px; line-height: 1.3; font-weight: 400; }
  .bottom { position: relative; display: flex; justify-content: space-between; align-items: flex-end; }
  .url { font-family: 'IBM Plex Mono', monospace; font-size: 24px; color: #fafafa; }
  .marker { font-family: 'IBM Plex Mono', monospace; font-size: 14px; color: #71717a; text-align: right; line-height: 1.6; }
</style>
</head>
<body>
  <div class="banner">
    <div class="grid-bg"></div>
    <div class="accent-circle"></div>
    <div class="top">
      <div class="date-tag">LAUNCH_DATE</div>
      <div class="signature">— Tim Moyence</div>
    </div>
    <div class="center">
      <div class="product-name">PRODUCT_NAME</div>
      <div class="tagline">TAGLINE</div>
    </div>
    <div class="bottom">
      <div class="url">URL</div>
      <div class="marker">v1.0<br>beta publique</div>
    </div>
  </div>
</body>
</html>
```

---

## 5. Editorial guardrails — checklist anti-bullshit

À cocher AVANT chaque publication. Si une seule case reste vide → ne publie pas.

- [ ] **Hook testé sur 2 personnes réelles.** Réaction "oh tiens" ou "ok next" ? Si "next", réécrire.
- [ ] **Tous les chiffres ont une source vérifiable.** git log, monitoring, benchmark perso, étude citée. Sinon enlever le chiffre.
- [ ] **Aucun mot de la blacklist §1.1.** Recherche Cmd+F sur : *thrilled, ravi, fier, journey, amazing, game changer, disruptif, ravi d'annoncer, hâte de*.
- [ ] **Maximum 1 lien externe dans le post.** Tous les autres liens en 1er commentaire.
- [ ] **CTA passe le test "Tim ne dirait jamais ça".** Si ça sonne corporate, jeter et reprendre §3.
- [ ] **Length target respecté en CARACTÈRES, pas en mots.** Compter via `wc -c` ou compteur LinkedIn.
- [ ] **Visuel = HTML brut (§4) ou rien.** Aucun Canva, aucun template Figma "modern minimal" générique.
- [ ] **Aucune promesse non livrable au 1er juin.** Si ça parle d'AR, paiement billet, Android (avant V1.1), version desktop : à reporter ou retirer.
- [ ] **Phrase moyenne ≤ 14 mots.** Si une phrase dépasse, la couper en deux.
- [ ] **Au moins 1 fragment toutes les 4 lignes.** Sinon le rythme est plat.
- [ ] **Zéro émoji dans le corps.** Hashtags 5-8 en bas, c'est tout.
- [ ] **Closing ne demande ni follow ni like ni DM marketing.** Pattern §1.3 obligatoire.

---

**Document v1 — 2026-05-01.** Usage interne Tim Moyence / Musaium.

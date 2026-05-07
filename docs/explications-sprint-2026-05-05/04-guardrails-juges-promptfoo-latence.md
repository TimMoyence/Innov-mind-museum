# 04 — Guards, juges, promptfoo : carte complète, latence, faux positifs

> **Pour qui ?** Toi, qui as testé l'app dev et qui a vu sa demande de "cathédrale" bloquée. Tu te demandes : "trop de couches = trop de faux positifs ? trop de latence ?".
> **Réponse courte :** **certaines couches sont essentielles, d'autres sont overkill pour V1**. On va cartographier toutes les couches, les chiffrer, et te dire lesquelles tu peux désactiver pour un chat plus fluide.

---

## D'abord : pourquoi tu as eu "cathédrale bloquée" ?

J'ai grep le code actuel des guardrails. Voici les listes exactes de mots qui bloquent :

- **`INSULT_KEYWORDS`** (`art-topic-guardrail.ts:30-85`) — 38 entrées : `idiot`, `stupid`, `fuck`, `connard`, `arschloch`, `pendejo`, `stronzo`, バカ, 傻逼, احمق, etc.
- **`INJECTION_PATTERNS`** (`art-topic-guardrail.ts:87-172`) — ~80 entrées : `ignore previous`, `jailbreak`, `system prompt`, `developer mode`, `agis comme si`, `du bist jetzt`, etc.

**Ni "cathédrale" ni "envoyer" ne sont dans ces listes.** Donc le code actuel **ne bloquerait pas** ta demande.

Trois explications possibles à ton ressenti :

1. **Tu as testé sur l'app DEV avant ce sprint.** Avant 2026-04-30, le filtre `art-topic` (le classifier d'output) était plus agressif. Il classifiait les réponses de l'IA et bloquait celles qu'il estimait "off-topic". Si tu as demandé "envoie-moi une photo de cathédrale" et que l'IA a tenté de répondre "voici une description de Notre-Dame", le classifier output a peut-être bloqué.
2. **L'IA elle-même a refusé.** GPT-4o-mini / Deepseek peuvent refuser une demande qu'ils interprètent comme "envoyer un fichier" alors qu'ils ne peuvent pas. Le refus vient du modèle, pas du guardrail.
3. **Tu n'as pas vu un placeholder de fallback.** Si la chaîne LLM échoue (timeout, erreur provider), on renvoie un texte de fallback générique qui ressemble à un refus.

Conclusion : **dans le code actuel post-sprint, "envoyer une cathédrale" passe**. Si tu le re-testes sur l'app post-sprint et qu'il est toujours bloqué, on regarde ensemble en live, parce que c'est un autre bug.

---

## Cartographie complète des couches de filtrage

Dans l'ordre où elles s'exécutent quand un message utilisateur arrive :

```
USER MESSAGE
   │
   ▼
[1] Sanitization      ← sanitizePromptInput : strip control chars, NFC normalize, max length
   │   (toujours actif, ~1ms, cousin direct du filtre antispam SQL)
   ▼
[2] Keyword guardrail ← INSULT_KEYWORDS + INJECTION_PATTERNS, 8 langues
   │   (toujours actif, <5ms, pure JS, déterministe)
   │   → bloque tout de suite si insult ou injection détectée
   ▼
[3] LLM-guard sidecar ← service Python externe (PromptInjection ML model + Anonymize PII + Toxicity)
   │   (optionnel : GUARDRAILS_V2_CANDIDATE=llm-guard, ~150-400ms)
   │   → peut bloquer ; mode observe-only possible
   ▼
[4] Juge LLM           ← appel à l'orchestrateur LLM avec prompt locked
   │   (optionnel : très rarement actif, ~200-500ms)
   │   → ne s'active QUE si message > 50 caractères ET keyword a dit "allow"
   │   → ne peut QUE downgrade allow → block
   ▼
[5] Appel LLM principal ← orchestrateur LangChain qui fait la vraie réponse
   │   (~800-2500ms selon provider)
   ▼
[6] Output keyword guardrail  ← même INSULT/INJECTION sur la sortie LLM
   │   (toujours actif, <5ms)
   ▼
[7] Output LLM-guard sidecar  ← NoRefusal + Bias + Sensitive + Relevance
   │   (optionnel, même que [3], ~150-400ms)
   ▼
[8] Art-topic classifier ← optionnel, classifie la sortie comme "art" ou "off-topic"
   │   (peut être un appel LLM léger ou un classifier local)
   │   → SI configuré et que l'output n'est pas "art", on bloque
   ▼
RESPONSE TO USER
```

**Et en parallèle (PR-blocking, pas runtime) :**

```
[9] Promptfoo CI gate ← 10 attaques jailbreak testées sur chaque PR qui touche le code chat
                        (CI uniquement, pas runtime, bloque le merge si régression)
```

---

## Une à une : ce que chaque couche apporte vraiment

### [1] Sanitization (`sanitizePromptInput`)

**Ce que ça fait :**
- Normalize Unicode (NFC) pour empêcher les caractères "look-alike" (homoglyphes Cyrillic).
- Strip les caractères de contrôle (\x00-\x1F).
- Strip les zero-width chars (​, ‌, ‍, ﻿) — souvent utilisés pour cacher du contenu.
- Bound la longueur (`maxLength` configurable, default 2000 chars).

**Latence :** ~1 ms, négligeable.

**Faux positifs :** très rares. Cas connu = un texte japonais qui utilise volontairement des halfwidth katakana, normalisé en fullwidth après NFC. Pas un bloc, juste une transformation.

**Verdict :** **garder activé**. Coût zéro, gain réel (anti-injection via caractères invisibles).

### [2] Keyword guardrail (`art-topic-guardrail.ts`)

**Ce que ça fait :** match les listes `INSULT_KEYWORDS` et `INJECTION_PATTERNS` sur le message utilisateur normalisé. Bloque immédiatement avec une raison ("insult" ou "prompt_injection").

**Latence :** <5 ms, pure JS, scan 38 + 80 entrées.

**Faux positifs :** **réels mais limités**. Exemples :
- "ignore previous comments" en français traduit "ignore les commentaires précédents" — pas dans la liste, OK.
- "what does 'developer mode' mean in tech" — match `developer mode` → bloqué. **Faux positif.**
- "this is the dumb question, but..." — match `dumb` → bloqué. **Faux positif.**
- "ce con de Cézanne" (familier mais pas méchant) — match `con` → bloqué.

Le "con" de la liste française est noté comme tel. Pour Musaium qui est un assistant museum culturel en français, **garder "con" dans la liste cause des faux positifs** sur des phrases familières inoffensives.

**Verdict :** **garder activé** mais **trim un peu la liste française** (`con`, `dumb` seuls posent souvent problème). Je peux préparer une PR si tu valides.

### [3] LLM-guard sidecar Python (optionnel)

**Ce que ça fait :** appelle un service Python externe (`llm-guard:8081`) qui run 4 scanners ML/Presidio :
- **PromptInjection** (modèle deberta-v3 fine-tuné) — détecte les jailbreaks plus subtils que les keywords.
- **Anonymize** — détecte et masque les PII (email, téléphone, IBAN, carte de crédit, IP, SSN).
- **Toxicity** — modèle de classification toxicité.
- **BanTopics** — bloque les topics interdits configurés (violence, adult, politics, illegal_activity).

**Latence :** **150-400 ms en moyenne, p95 ~500 ms** d'après le bench documenté dans le README du sidecar. Configurable via `GUARDRAILS_V2_TIMEOUT_MS=500` (timeout dur).

**Faux positifs :** **modérés**. Anonymize en particulier fait pas mal de bruit — c'est pour ça que `ANONYMIZE_ENTITIES` exclut PERSON / LOCATION / ORG / DATE_TIME (sinon "Léonard de Vinci" devient "[ANONYMIZED] de [ANONYMIZED]"). Le filtre Toxicity peut flag des questions sur des sujets dérangeants en histoire de l'art (atrocités, art religieux violent, nu).

**Coût :** un container de plus (2 GB RAM dédiés dans `docker-compose.prod.yml`), un téléchargement de modèles HuggingFace au premier boot (~1 GB).

**Verdict :** **désactivable en V1** sans perte critique pour Musaium. La keyword pre-filter + le juge LLM (si activé) couvrent ~90 % des cas. Le sidecar sert si tu veux une couverture industrielle.

**Pour désactiver :** mettre `GUARDRAILS_V2_CANDIDATE=off` dans ton `.env` prod. Le service `llm-guard` continue de tourner mais il n'est plus appelé. Tu peux aussi commenter le service dans `docker-compose.prod.yml` pour libérer la RAM.

### [4] Juge LLM (`llm-judge-guardrail.ts`)

**Ce que ça fait :** quand la keyword pre-filter dit "allow" ET que le message > 50 caractères, on envoie le message à un mini-LLM avec un prompt verrouillé qui demande "verdict en JSON : allow / block:offtopic / block:injection / block:abuse + confidence 0..1". Si le verdict est block ET confidence ≥ 0.6, on bloque.

**Latence :** **200-500 ms**, configurable via `LLM_GUARDRAIL_JUDGE_TIMEOUT_MS=500`. Si le timeout pète, **fail-open** : on retombe sur la décision keyword (allow).

**Coût :** ~$0.0006 par appel (gpt-4o-mini, 120 tokens in + 30 tokens out). Cap quotidien à 5 € via `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY=500`. Au-delà : **fail-open** (le juge est skip).

**Faux positifs :** **faibles** parce que :
- N'agit que sur messages > 50 chars (les courts passent sans juge).
- Confidence floor 0.6 (les cas border-line passent).
- Ne peut que downgrade allow → block, jamais l'inverse.

**Verdict :** **désactivé par défaut en V1**. C'est `GUARDRAILS_V2_CANDIDATE=off` qui désactive aussi cette couche. Re-active post-launch si tu vois dans les logs que des injections passent à travers les keywords.

### [5] Appel LLM principal (chat.service)

C'est le vrai chat. Latence dépend du provider :
- **OpenAI gpt-4o-mini :** 800-1500 ms en mode classique, 200-600 ms premier token en streaming.
- **Deepseek :** 1000-2500 ms.
- **Google gemini-2.0-flash :** 600-1200 ms.

Pas un guardrail, mais c'est la latence qui domine de loin.

### [6] Output keyword guardrail

Même que [2], mais sur la sortie LLM. Bloque si l'IA a retourné un mot interdit (ce qui peut arriver si le prompt injection a réussi à la convaincre de répéter).

**Latence :** <5 ms.

**Verdict :** **garder activé**. Coût zéro, dernière barrière contre les prompt-injection-via-output.

### [7] Output LLM-guard sidecar

Sur la sortie LLM : **NoRefusal**, **Bias**, **Sensitive** (PII detection), **Relevance**. Même couche que [3], même latence, même verdict.

### [8] Art-topic classifier

C'est l'optionnel le plus intéressant. Selon la conf, c'est :
- Soit un classifier local léger (keywords museum/artist/etc.).
- Soit un appel LLM dédié qui demande "est-ce que ça parle d'art / musée / patrimoine ?".

Si le résultat est "non", on bloque la sortie même si elle est techniquement OK, et on remplace par un refus poli "je ne peux que parler d'art et de musées".

**Latence :** 0-200 ms selon impl. Local = négligeable, LLM = 200 ms.

**Faux positifs :** **fréquents**. Si le user demande "quel est le poids d'une statue de marbre ?", l'IA répond avec une réponse correcte (poids approximatif), mais le classifier peut considérer ça comme "off-topic physique" plutôt que "art". Bloqué.

**Verdict pour V1 Musaium :** **désactivable**. Ton angle produit (cf. memory `feedback_product_first.md` + `project_hybrid_product_philosophy.md`) est "fluide pour le visiteur, pas trop verrouillé". Le classifier d'art-topic est un verrouillage en plus. **Mon conseil V1 = laisser disabled**, observer les conversations 1 mois post-launch, ré-évaluer.

### [9] Promptfoo CI gate

C'est uniquement en CI, pas runtime. À chaque PR qui touche `museum-backend/src/modules/chat/**`, GitHub Actions lance `promptfoo eval` avec un corpus de 10 attaques jailbreak (DAN, Skeleton Key, base64 encoding, role-confusion, etc.). Si l'une réussit, le PR est bloqué au merge.

**Latence runtime :** zéro (pas dans le hot-path).
**Latence CI :** ajoute ~3-5 minutes au workflow PR.

**Faux positifs :** quasi-zéro. Le corpus est statique, les assertions sont robustes ("le prompt système ne doit pas être leaké dans la réponse").

**Verdict :** **garder activé**. C'est un guard qui te protège des régressions, pas l'utilisateur.

---

## Tableau récap des latences cumulées

Selon ce que tu actives, voici la latence ajoutée **avant** l'appel LLM principal :

| Configuration | Latence ajoutée (input) | Latence totale typique chat |
|--------------|------------------------|------------------------------|
| **Minimum (recommandé V1)** : sanitization + keyword pre-filter seulement | **~6 ms** | ~1-2.5 sec |
| Avec juge LLM (message > 50 chars) | +200-500 ms | ~1.2-3 sec |
| Avec llm-guard sidecar | +150-400 ms | ~1.2-3 sec |
| Avec juge + sidecar | +350-900 ms | ~1.5-3.5 sec |
| Avec **toutes** les couches actives + output classifier | +500-1100 ms | ~2-4 sec |

**Pour Musaium voice-first** (cf. `docs/AI_VOICE.md`), la latence cumulée pipeline STT → LLM → TTS est **déjà** de 3-5 secondes en V1. Ajouter +1 seconde de guardrails à chaque tour de parole = **dégrade clairement l'expérience conversationnelle**.

---

## Ma recommandation par priorité produit

**Musaium V1 launch** = "fluide, voice-first, pas verrouillé inutilement". Donc :

| Couche | V1 launch (ma reco) | Post-launch (ré-évaluer) |
|--------|---------------------|--------------------------|
| [1] Sanitization | **Activé** (toujours) | OK |
| [2] Keyword input + [6] Keyword output | **Activé** | OK, peut-être trim "con", "dumb" si signal |
| [3] llm-guard sidecar input | **Désactivé** (`GUARDRAILS_V2_CANDIDATE=off`) | Activer si Sentry remonte des injections passées à travers |
| [4] Juge LLM input | **Désactivé** (idem flag) | Activer après 1 mois si signal |
| [7] llm-guard sidecar output | **Désactivé** (idem flag) | Idem |
| [8] Art-topic classifier output | **Désactivé** (`artTopicClassifier` dep injecté à `undefined`) | Re-évaluer si trop de réponses off-topic |
| [9] Promptfoo CI gate | **Activé** | Ajouter des attaques au corpus si tu en découvres |

**Comment désactiver les couches optionnelles** : modifier `museum-backend/.env.production.example` (et la copie sur ton VPS `/srv/museum/.env`) :

```bash
# Désactiver tout LLM Guard + juge LLM (couches [3], [4], [7])
GUARDRAILS_V2_CANDIDATE=off
```

Et c'est tout. La keyword pre-filter [2][6] reste active (pas de toggle, c'est la base).

Pour le service `llm-guard` du compose, tu peux le commenter ou le laisser tourner inutilement (~2 GB RAM perdus). Mon conseil : commente-le pour libérer la RAM pour Postgres/Redis.

---

## Et le cas "cathédrale" alors ?

Re-test après désactivation : tu envoies "envoie-moi une photo de cathédrale" sur l'app post-sprint avec `GUARDRAILS_V2_CANDIDATE=off`. Voici ce qui se passe :

1. **[1] Sanitization** — passe.
2. **[2] Keyword input** — pas de match dans INSULT/INJECTION → passe.
3. **[3] [4] désactivés** — skip.
4. **[5] Appel LLM** — le LLM répond "Je ne peux pas envoyer de photos, mais je peux te décrire la cathédrale Notre-Dame de Paris...".
5. **[6] Keyword output** — pas de match → passe.
6. **[7] [8] désactivés** — skip.
7. → User reçoit la réponse en ~1.5 sec.

**Si tu vois encore un blocage sur "cathédrale"**, c'est probablement :
- Soit l'app que tu testes est l'ancienne (pré-sprint).
- Soit le classifier d'art-topic est encore wired dans la composition root du module chat (`chat-module.ts`). Vérifie en grep `artTopicClassifier:` — s'il est wired à un objet non-undefined, désactive-le ou wire-le à `undefined`.

---

## Pourquoi c'est pertinent pour Musaium (vraie question produit)

Tu as raison de questionner. La sécurité chat est un **dosage**, pas un sliding scale "plus c'est mieux". Trop de couches = :
- Latence visible utilisateur (>2 sec sur chaque message).
- Faux positifs qui frustrent ("on m'a refusé une question légitime").
- Coût LLM doublé / triplé (chaque juge = un appel).
- Dépendance à un sidecar Python qui a son propre cycle de vie ops.

**Le bon dosage Musaium V1** = keyword pre-filter (5 ms, 0 €, déterministe) + Promptfoo CI gate (protection contre régressions) + tout le reste désactivé.

C'est **moins paranoïaque** que ce qu'on a buildé en sprint, mais c'est **plus fluide** pour le visiteur. Ré-évaluer dans 1 mois post-launch avec données réelles (Sentry remonte-t-il des injections ? combien d'utilisateurs se font bloquer un message légitime ?).

---

## Est-ce overkill ?

**Oui pour V1** d'avoir activé toutes les couches d'un coup. **Non d'avoir buildé l'infrastructure** : tu pourras les activer en flippant 1 env var le jour où tu en auras besoin (B2B musée qui veut une garantie de modération, par exemple).

C'est l'approche correcte : **build maintenant, active progressivement**.

---

## Récap : ce que tu dois faire

1. **Décider du dosage V1** parmi les options ci-dessus. Ma reco = "minimum recommandé V1".
2. **Modifier `.env.production` sur ton VPS** : `GUARDRAILS_V2_CANDIDATE=off`.
3. **Optionnel** : commenter le service `llm-guard` dans `docker-compose.prod.yml` pour libérer la RAM (et économiser le téléchargement HuggingFace au démarrage).
4. **Optionnel** : me dire "trim la liste française des INSULT_KEYWORDS, retire 'con' et 'dumb'" → je fais une petite PR.
5. **Re-tester ton cas "cathédrale"** sur l'app post-sprint pour confirmer que ça passe.
6. **Noter dans le ROADMAP_TEAM** : "à 1 mois post-launch, regarder les logs guardrail_judge_block + advanced_guardrail_observe_would_block, décider si on ré-active les couches optionnelles".

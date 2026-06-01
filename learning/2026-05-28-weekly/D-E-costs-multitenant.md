# Thème D+E — Confinement des coûts & multi-tenant (27 mai 2026)

> **Période** : 27 mai 2026
> **Commits couverts** :
> - `97b84211` — M1 : Métrage du coût STT/TTS dans le circuit breaker global (W5-C3)
> - `e9d9cb3a` — M4 : Fiabilité prod & confinement coût — alertes + intégrité cost-cap + gates CI réels
> - `440cd016` — feat(KR) : NPS mesurable + isolation multi-tenant + co-branding mobile + funnel RGPD
>
> **Ce que tu vas apprendre** : comment convertir une durée audio en centimes et alimenter un circuit breaker global ; pourquoi un reset naïf au réveil du breaker peut multiplier les dépenses par 288 ; comment l'encodage Prometheus peut tuer silencieusement toutes tes alertes ; comment fermer une fuite BOLA dans une API multi-tenant ; comment le NPS est calculé en SQL en un seul round-trip ; et comment propager le branding d'un musée jusqu'au mobile en restant défensif sur le JSONB.

---

## Partie 1 — Confinement des coûts (circuit breaker cost-aware + observabilité)

### Item 1 — Métrage STT/TTS dans le circuit breaker global (commit `97b84211`)

**Intention**

Avant ce commit, le `LlmCostCircuitBreaker` ne recevait que les charges du pipeline texte (via l'orchestrateur LangChain). Les appels voix (Whisper STT + gpt-4o-mini-tts) étaient invisibles au breaker : une attaque DDoS ciblant uniquement la voix passait sans déclencher de coupure.

**Code**

Le fichier `museum-backend/src/modules/chat/adapters/secondary/audio/voice-cost-pricing.ts` est la seule source de vérité pour la tarification voix :

```ts
// voice-cost-pricing.ts:21-40
const TTS_USD_PER_1M_CHARS = 15;  // list price gpt-4o-mini-tts ($15/1M) — conservateur
const STT_FLAT_CENTS = 0.4;       // $0.004 = 0.4¢ par transcription

export const estimateSttCostCents = (): number => STT_FLAT_CENTS;

export const estimateTtsCostCents = (charCount: number): number =>
  (charCount / 1_000_000) * TTS_USD_PER_1M_CHARS * 100;
```

Pourquoi un forfait STT et non une mesure à la seconde ? L'adaptateur n'a pas accès à la durée audio (`durationKnown:false`, TD-20 D-Q1) — on ne peut pas décoder le flux côté Node sans ajouter une dépendance media. Le forfait de `0.4¢` correspond au plafond utilisé dans le middleware HTTP per-user, donc la cohérence est assurée (`voice-cost-pricing.ts:14` : "coherence with the per-user HTTP cost-guard middleware ceilings").

Pour le TTS, la facturation réelle est `charCount / 1_000_000 * 15 USD * 100` centimes. On utilise la longueur du texte **tronqué** (`text.slice(0, env.tts.maxTextLength)`) envoyé à OpenAI — `text-to-speech.openai.ts:156` puis `:182` :

```ts
// text-to-speech.openai.ts:156,182
const text = input.text.slice(0, env.tts.maxTextLength);
// ...
this.recordVoiceCost(estimateTtsCostCents(text.length));
```

**Wiring dans le module**

`chat-module.ts` passe le singleton `LlmCostCircuitBreaker` aux deux adaptateurs audio à la construction :

```
// chat-module.ts lignes ~683, ~700, ~831 (valeur vérifiée par grep)
new OpenAiTextToSpeechService(this._llmCostCircuitBreaker)
OpenAiAudioTranscriber(this._llmCostCircuitBreaker)
```

**Pattern transférable : observe-only, jamais de gate voix**

Les deux adaptateurs utilisent un **try/catch fail-open** autour de `recordCharge()`. La voix n'est JAMAIS bloquée par `canAttempt()` (design §D4) — le breaker accumule le spend pour que la voix puisse déclencher l'arrêt du texte, mais l'inverse n'est pas vrai. Pourquoi ? Interrompre une synthèse vocale en cours serait plus perturbant que de l'absorber dans un spike court :

```ts
// audio-transcriber.openai.ts:174-184
private recordVoiceCost(cents: number): void {
  if (!this.costBreaker) return;
  try {
    this.costBreaker.recordCharge(cents);
  } catch (err) {
    logger.warn('voice_cost_record_failed', {
      modality: 'stt',
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
```

**Piège** : les estimations sont des **plafonds conservateurs** (tarifs liste, pas les prix réels gpt-4o-mini). C'est intentionnel — le breaker sur-protège légèrement plutôt que de sous-estimer. Si la facturation réelle dérive de plus de 10%, les constantes sont mises à jour par PR, sans flag d'environnement (UFR-015).

---

### Item 2 — Le bug "×288 daily cap" et comment le corriger (commit `e9d9cb3a`)

**Intention**

Le bug C1 (CRITICAL) : à chaque fois que le breaker passait de `HALF_OPEN` → `CLOSED` après un probe réussi, il appelait `strategy.reset()` — ce qui effaçait aussi l'accumulateur de dépenses quotidiennes. Avec un cooldown de 5 minutes (`openDurationMs: 300_000`), un breaker qui trip/reprend tout au long de la journée effaçait le compteur quotidien jusqu'à 288 fois (1440 minutes / 5 minutes = 288 resets). Le cap journalier ne protégeait rien.

**Code**

La solution : distinguer reset total et reset transitoire dans `CostTripStrategy` :

```ts
// cost-trip-strategy.ts:63-78
reset(): void {
  this.hourlyWindow = [];
  this.dailySpend = { day: '', cents: 0 };  // efface TOUT — kill-switch uniquement
}

resetTransient(): void {
  this.hourlyWindow = [];  // efface uniquement la fenêtre spike/horaire
  // this.dailySpend est PRÉSERVÉ
}
```

`ThreeStateCircuit` appelle `resetTransient()` (et non `reset()`) lors d'un probe réussi (`HALF_OPEN → CLOSED`) :

```ts
// three-state-circuit.ts:147-156
if (outcome === 'success') {
  if (state === 'HALF_OPEN') {
    this.transitionTo('CLOSED');
    // W1-C1: transient-only reset on probe success
    this.strategy.resetTransient();
    // ...
  }
}
```

La double vérification dans `LlmCostCircuitBreaker.recordCharge()` : avant de récupérer (`HALF_OPEN → CLOSED`), on projette si cette charge unique dépasserait déjà le cap journalier ou horaire. Si oui, on re-trip directement (`HALF_OPEN → OPEN`) sans jamais émettre le log "recovery succeeded" trompeur :

```ts
// llm-cost-circuit-breaker.ts:151-161
const wouldBreach =
  this.strategy.getHourlySpendCents(now) + cents > this.hourlyThresholdCents ||
  this.strategy.getDailySpendCents(now) + cents > this.dailyBudgetCents;

if (wouldBreach) {
  this.strategy.recordCharge(cents);
  this.circuit.trip('HALF_OPEN');
  return;
}
```

**Pattern transférable** : pour tout accumulateur qui a deux temporalités (fenêtre courte / budget long terme), prévoir deux méthodes de reset. La récupération automatique ne doit effacer que l'état transitoire — jamais l'état durable.

---

### Item 3 — L'alerte Prometheus qui ne pouvait jamais se déclencher (commit `e9d9cb3a`)

**Intention**

Bug O1 (CRITICAL) dans les alertes Prometheus. Les anciennes expressions ciblaient `circuit_breaker_state == 2`. Mais la métrique n'encode jamais l'état avec un entier — elle utilise un **label** `{state="open|closed|half_open"}` avec une valeur `1` (état actif) ou `0`. Donc `== 2` était toujours faux, et les alertes coût + guardrail ne se déclenchaient jamais.

**Avant** (dead alert, inventé à partir du message de commit — non vérifiable dans le code courant) :
```yaml
# expr: circuit_breaker_state == 2  ← impossible, n'existe jamais
```

**Après** (code vérifié dans `llm-cost.yml:103`) :
```yaml
# llm-cost.yml:103-104
expr: |
  musaium_llm_cost_circuit_breaker_state{state="open"} == 1
```

Comment comprendre ce format ? `onStateChange` dans le module émet 1 pour l'état courant et 0 pour les autres états — une serie par état. Cela permet des alertes précises et des transitions visibles dans Grafana sans avoir à mapper des entiers.

**Les nouvelles alertes** (fichier `infra/grafana/alerting/llm-cost-security.yml`) :

- `llm_cost_anon_bypass` (critical, `for: 2m`) : `sum(rate(llm_cost_anon_bypass_total[5m])) > 0` — détecte qu'une route payante est devenue accessible sans authentification.
- `guardrail_judge_degraded` (warning, `for: 5m`) : `sum(rate(guardrail_judge_degraded_total[5m])) > 0` — le juge V2 se dégrade vers le backstop V1, risque de dérive AI Act Art.10.

**Piège** : la convention de nommage `musaium_` est gelée à 16 séries (audit METRIC_NAMING_AUDIT F2 Option A). Les nouvelles métriques utilisent le préfixe `llm_cost_` ou `guardrail_` sans `musaium_`, ce qui est intentionnel. Ajouter `musaium_` créerait une alerte sur une métrique qui n'existe pas (`llm-cost-security.yml:17-21`).

**Fail-closed au boot** (W1-C2) : si `OPENAI_USER_DAILY_USD_CAP > 0` mais que `REDIS_URL` est absent, le boot lève une erreur explicite plutôt que de servir des appels LLM sans cap (`env.production-validation.ts:227-237`). C'est l'inverse de fail-open : ici l'absence de l'outil de protection = on refuse de démarrer.

---

## Partie 2 — Multi-tenant & métriques produit

### Item 4 — Isolation multi-tenant : deux fuites BOLA fermées (commit `440cd016`)

**Contexte**

BOLA = Broken Object Level Authorization (OWASP API3:2023). Le `museum_manager` est un rôle B2B qui ne doit voir que les données de son musée. Avant ce commit, deux endpoints renvoyaient des données cross-tenant.

**Fuite 1 : `/api/admin/stats`**

Avant : le route handler passait directement le `museumId` de la query string au use-case, sans vérifier si l'appelant avait le droit de voir ce musée. Un manager du musée A pouvait envoyer `?museumId=99` pour voir les stats du musée B.

Après : le helper `computeTenantScope()` est extrait comme source de vérité unique (`museum-backend/src/shared/authz/tenant-scope.ts:28-41`) :

```ts
// tenant-scope.ts:28-41
export function computeTenantScope(
  role: UserRole | undefined,
  museumId: number | null | undefined,
): number | null {
  if (role === 'museum_manager') {
    if (museumId == null) {
      throw forbidden('No museum assigned');  // jamais de dégradation vers la vue globale
    }
    return museumId;
  }
  return null;  // super_admin / admin → vue globale cross-tenant
}
```

Et dans le route handler (`admin.route.ts:261-265`), le museumId du JWT **écrase** systématiquement celui de la query string pour les managers :

```ts
// admin.route.ts:263-265
let scopedMuseumId: number | undefined = queryMuseumId;
if (req.user?.role === 'museum_manager') {
  scopedMuseumId = req.user.museumId ?? undefined;  // JWT claim wins
}
```

**Fuite 2 : reviews et tickets**

Le même helper `computeTenantScope()` est appelé sur les 4 endpoints read/write reviews et tickets (`admin.route.ts:435, 466, 494, 525`). Avant, un manager pouvait lire et écrire les avis d'un autre musée. Après : chaque call-site appelle `computeTenantScope(req.user?.role, req.user?.museumId)` et passe le résultat au repository.

**Pattern transférable** : extraire la décision de scope dans une fonction pure sans port ni framework. Quand le count de call-sites atteint ≥3 avec la même logique inline (ici 6 endpoints), extraire est obligatoire — la duplication casse à chaque refactoring du modèle de rôles.

**Piège** : `403` si `museumId == null` pour un manager, mais `null` retourné (vue globale) pour un admin. Ces deux cas doivent être distingués — ne jamais dégrader silencieusement un manager vers la vue globale. Le commentaire de code l'explicite : `// NEVER degrades to the global view` (`admin.route.ts:287`).

---

### Item 5 — NPS mesurable : modèle de données + calcul SQL (commit `440cd016`)

**Modèle de données**

Le type `NpsAggregate` (`review.types.ts:55-61`) :
```ts
export interface NpsAggregate {
  nps: number;          // -100..+100 : %promoters - %detractors
  promoters: number;    // rating ∈ [9,10]
  passives: number;     // rating ∈ [7,8]
  detractors: number;   // rating ∈ [0,6]
  count: number;        // total avis approuvés post-epoch
}
```

**Calcul en un seul round-trip SQL** (`review.repository.pg.ts:113-147`) :

```ts
const qb = this.repo
  .createQueryBuilder('r')
  .select('COUNT(*) FILTER (WHERE r.rating >= 9 AND r.rating <= 10)', 'promoters')
  .addSelect('COUNT(*) FILTER (WHERE r.rating >= 7 AND r.rating <= 8)', 'passives')
  .addSelect('COUNT(*) FILTER (WHERE r.rating >= 0 AND r.rating <= 6)', 'detractors')
  .addSelect('COUNT(*)', 'count')
  .where('r.status = :status', { status: 'approved' })
  .andWhere('r.createdAt >= :npsEpoch', { npsEpoch: resolveNpsScaleEpoch() });
// ...
const nps = count === 0 ? 0 : Math.round(((promoters - detractors) / count) * 100);
```

Le `COUNT(*) FILTER (WHERE ...)` est une extension SQL standard PostgreSQL — un seul `SELECT` donne les quatre buckets. Évite 4 requêtes séparées.

**Piège de l'epoch NPS** (`nps-scale-epoch.ts:25-29`)

La note de rating a changé de 1-5 (étoiles) à 0-10 (NPS) lors de ce commit. Un ancien "5 étoiles" vaut maintenant 5/10 — un détracteur ! Compter les anciens avis fausserait le NPS vers le bas. Solution : `NPS_SCALE_EPOCH_DEFAULT = '2026-05-27T00:00:00.000Z'` — seuls les avis créés à partir de cette date entrent dans le calcul. L'epoch est configurable via `NPS_SCALE_EPOCH` (ISO-8601) pour des back-tests ou une re-baseline sans redéploiement. Une valeur invalide dégrade vers le défaut (jamais de throw) pour qu'une typo n'efface pas la protection.

**Attribution session → avis** : la migration `1779820013071-AddSessionIdToReviews.ts` ajoute `session_id UUID FK → chat_sessions(id) ON DELETE SET NULL`. Lors de `createReview`, si le `sessionId` fourni par le client ne correspond pas à une session appartenant à cet utilisateur, il est persisté `null` silencieusement — pas de 400, pas de fuite. C'est une attribution opportuniste, pas une contrainte dure.

---

### Item 6 — Co-branding mobile : défenses JSONB + contraste WCAG (commit `440cd016`)

**Intention**

Le champ `config` d'un musée est un blob JSONB non typé en base. Le mobile doit lire `config.branding.primaryColor` et `config.branding.logoUrl`. Deux risques : données malformées en DB (pas validées à l'écriture dans cette version), et injection via une URL `javascript:` ou `http:` dans un `<Image source={{ uri }}>`.

**Code** (`museum-frontend/features/museum/domain/museum-branding.ts:47-73`)

La fonction `parseMuseumBranding()` applique le pattern `jsonb-drift-guard` (documenté dans CLAUDE.md) — chaque niveau du JSONB est gardé par `typeof` même si TypeScript déclare une forme :

```ts
// museum-branding.ts:47-72 — chaque niveau typeof-gardé
export const parseMuseumBranding = (
  config: Record<string, unknown> | null | undefined,
): MuseumBranding => {
  if (config == null || typeof config !== 'object' || Array.isArray(config)) return {};

  const raw = config.branding;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const branding = raw as Record<string, unknown>;
  const primaryColor = branding.primaryColor;
  if (typeof primaryColor === 'string' && isValidHexColor(primaryColor)) {
    result.primaryColor = primaryColor;
  }
  const logoUrl = branding.logoUrl;
  if (typeof logoUrl === 'string' && isValidHttpsUrl(logoUrl)) {
    result.logoUrl = logoUrl;
  }
  return result;
};
```

`isValidHexColor` = `/^#[0-9a-fA-F]{6}$/`. `isValidHttpsUrl` = `/^https:\/\/[^\s]+$/i` — rejette `http:`, `javascript:`, `data:`, les chemins relatifs (`museum-branding.ts:27-38`).

**Calcul du contraste WCAG** (`museum-branding.ts:89-103`) : la fonction `pickContrastingTextColor()` applique la formule de luminance relative WCAG (`L = 0.2126·R + 0.7152·G + 0.0722·B`) avec sRGB-linearisation, et pivote à `0.22` pour retourner noir ou blanc. Si la couleur est invalide, elle retourne `#FFFFFF` et ne lève jamais d'erreur.

**Pattern transférable** : tout champ JSONB = traiter comme `unknown` à runtime même si TypeScript dit le contraire. Valider, jamais faire confiance. Parser = retourner un objet vide en cas d'échec, jamais throw (les erreurs JSONB ne doivent pas bloquer une page).

---

## À retenir — patterns transférables

| Pattern | Application ici | Applicabilité |
|---|---|---|
| **Cost-aware circuit breaker : observe-only** | STT/TTS alimentent le breaker sans pouvoir être bloqués par lui | Toute dépendance coûteuse où l'interruption serait pire que l'absorption |
| **reset() vs resetTransient()** | Recovery probe ne remet pas à zéro l'accumulateur quotidien | Tout accumulateur à deux temporalités (court terme / long terme) |
| **Encodage Prometheus label, pas valeur entière** | `{state="open"} == 1` et non `== 2` | Toute métrique d'état à valeurs discrètes |
| **JWT claim wins sur query param** | `museum_manager` : le museumId du token écrase tout query param | Toute API multi-tenant où un param scope peut être forgé |
| **Helper pure function pour la décision de scope** | `computeTenantScope()` — pas de port, pas de framework | Dès que ≥3 endpoints dupliquent le même gate |
| **NPS en un seul round-trip** | `COUNT(*) FILTER (WHERE...)` PostgreSQL | Toute agrégation multi-bucket sur une seule table |
| **jsonb-drift-guard** | Chaque niveau du JSONB typeof-gardé | Tout parsing de config stockée en JSONB |
| **Fail-closed au boot** | `validateCostGuardRedis` : cap configuré sans Redis = refus de démarrer | Tout mécanisme de protection dont l'absence serait silencieuse |

---

## Questions de compréhension

1. **Pourquoi `estimateSttCostCents()` est-elle une constante forfaitaire et non une fonction prenant une durée ?** Qu'est-ce que cela implique sur la précision du suivi de coût, et pourquoi ce choix est-il honnête au sens UFR-013 ?

2. **Le bug ×288 daily-cap** : si le cooldown est de 5 minutes et que le breaker trip puis récupère en continu toute la journée, combien de fois `reset()` était-il appelé avant le fix ? Que se passe-t-il maintenant avec `resetTransient()` lors d'un probe réussi ?

3. **Alerte Prometheus** : quelle était l'expression incorrecte, pourquoi ne pouvait-elle jamais firer, et quelle est l'expression correcte pour détecter que le breaker de coût est OPEN ?

4. **Isolation BOLA** : un `museum_manager` envoie `GET /api/admin/stats?museumId=999` alors que son JWT claim vaut `museumId=42`. Quel est le museumId effectivement utilisé dans la requête DB, et dans quel fichier/ligne la décision est-elle prise ?

5. **NPS epoch** : les avis "4 étoiles" créés avant le 27 mai 2026 apparaissent-ils dans l'aggregate NPS ? Pourquoi, et quel serait l'effet si on les incluait ?

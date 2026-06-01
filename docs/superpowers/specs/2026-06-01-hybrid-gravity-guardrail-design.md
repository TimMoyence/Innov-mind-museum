# Spec — Guardrail hybride par gravité (judge parallèle + compteur de friction 2 niveaux)

> Statut : design validé en brainstorming 2026-06-01 (Tim). À implémenter via `/team` (UFR-022 fresh-context). Périmètre retenu : **tout maintenant** (session + plancher user/IP).

## 1. Contexte & problème

Le chat Musaium a une défense-en-profondeur (ADR-015) : V1 keyword guardrail (inline ~5 ms, hard-block insulte/injection), sidecar LLM-Guard ProtectAI (inline ~300 ms, fail-CLOSED, PII/injection-ML/toxicité/BanTopics), **judge LLM** (gpt-4o-mini, fail-OPEN, off-topic sémantique), output guardrail (post-réponse).

Findings vérifiés (mesure end-to-end 2026-06-01, tests `guardrail-v2-live.ai.test.ts`) :

1. **Judge fail-open silencieux corrigé** : timeout défaut 500 ms < latence réelle 0,6–1,2 s → `AbortSignal` déclenché à chaque appel → `judgeWithLlm` → `null` → fail-OPEN → le judge ne bloquait jamais en prod. Corrigé à 1500 ms (commit `d769e2df`). **Le bug aigu est réglé** ; ce spec est un enrichissement, pas un blocker launch.
2. **Le judge est inline AVANT la génération** (`prepare-message.pipeline.ts:283` → `evaluateInput` → puis génération) et **hard-block tout off-topic** (court-circuite la réponse via `handleInputBlock`). Problèmes :
   - **Taxe latence voice-first** : sur un message on-topic ≥50 chars (le cas courant), le judge ajoute jusqu'à `judgeTimeoutMs` AVANT la réponse (qui dure déjà 3–9 s). Mauvais endroit pour payer, surtout en vocal.
   - **Pas de notion de gravité** : un visiteur qui pose UNE question hors-sujet (météo) est hard-bloqué exactement comme un abuseur répétitif. Or le **section prompt redirige déjà** l'off-topic gracieusement (prouvé : matrice off-topic verte).
   - **Stateless** : aucun signal temporel ; un abuseur n'est jamais escaladé, un curieux occasionnel est traité trop durement.

## 2. Objectif

Remplacer le « videur inline qui hard-block tout off-topic » par un modèle **hybride par gravité** :

- **Sécurité** (injection/toxicité/PII) → hard-block immédiat inline (inchangé).
- **Off-topic occasionnel** → soft-redirect (le section prompt répond et recentre), **zéro taxe latence** (judge en parallèle de la génération).
- **Répétition / abus** → escalade vers hard-block + cool-down, via un **compteur de friction 2 niveaux** (session + plancher user/IP).

### Non-objectifs

- Pas de refonte du sidecar ni du V1 keyword (inchangés).
- Pas de ML maison de classification d'abus (le judge LLM suffit comme classificateur).
- Pas de bannissement permanent ni de modération humaine (hors V1).

## 3. Invariants de sécurité (à préserver, non négociables)

- **Sécurité inline avant génération** : V1 + sidecar restent évalués AVANT tout appel au LLM de réponse. On n'envoie JAMAIS du PII/injection au LLM de réponse. Seul le judge (fail-OPEN, off-topic) passe en parallèle.
- **Sidecar fail-CLOSED** : sidecar muet/timeout → `policy:service_unavailable` (inchangé, ADR-047).
- **Judge fail-OPEN** : judge timeout/erreur/budget épuisé → `null` → on retombe sur le verdict V1 (allow). Un judge lent ne doit jamais bloquer (dispo).
- **Le compteur de friction ne doit jamais faire fail-CLOSED le chat** : store Redis indisponible → on dégrade en « pas d'escalade » (le soft-redirect + la sécurité inline restent), jamais un blocage dur dû à une panne d'infra.

## 4. Architecture

### 4.1 Flux

```
message ≥ JUDGE_MIN_LENGTH (50c), V1+sidecar ALLOW
  │ (sécurité inline déjà passée : un block ici = hard-block + strike SÉCURITÉ + check plancher user)
  ▼
PARALLÈLE { judge(input, scope)  ‖  generateAnswer(input, abortSignal) }
  │
  ├─ judge = off-topic (block) :
  │     • frictionStore.recordStrike(session, w_offtopic)
  │     • frictionStore.recordStrike(user/ip, w_offtopic)
  │     • escalate = (session ≥ S_soft) || (user ≥ U_floor)
  │     • escalate ?
  │         ── oui ─► abortSignal.abort()  → réponse = cool-down (policy:off_topic) localisé
  │         ── non ─► réponse = answer généré (déjà soft-redirigé par le section prompt)
  │
  └─ judge = allow ─► réponse = answer
```

- **Parallélisme** : `Promise.allSettled([judge, generate])`. Le judge (~1 s) finit avant la réponse (3–9 s) → latence ajoutée ≈ 0 sur le cas allow.
- **Abort** : la génération reçoit un `AbortSignal`. Si le judge décide une escalade pendant la génération, on `abort()` → on ne paie qu'une fraction des tokens. **Dégradation gracieuse** : si l'orchestrateur ne propage pas (encore) l'`AbortSignal`, on laisse finir la génération puis on la **supprime** (correct, juste moins économe). L'abort est une optimisation, pas une condition de correction.
- **Sécurité inchangée** : sur block V1/sidecar (avant la branche parallèle), on hard-block, on `recordStrike(SÉCURITÉ, w_security)` et on vérifie le plancher user (un spammeur d'injections finit en cool-down dur).

### 4.2 Composant `GuardrailFrictionStore` (nouveau)

Calqué sur `guardrail-budget.ts` (pattern éprouvé : `CacheService.incrBy` + TTL, backends `memory` dev / `redis` prod, fail-soft).

Interface :
```ts
type FrictionScope = { kind: 'session'; sessionId: string }
                   | { kind: 'user'; userId: number }
                   | { kind: 'ip'; ipHash: string };

interface GuardrailFrictionStore {
  recordStrike(scope: FrictionScope, weight: number): Promise<void>; // incrBy + TTL
  count(scope: FrictionScope): Promise<number>;                      // 0 si store down (fail-soft)
  reset(scope: FrictionScope): Promise<void>;                        // tests / cron défensif
}
```

Clés / TTL :

| Scope | Clé | TTL |
|---|---|---|
| session | `friction:session:<sessionId>` | `FRICTION_SESSION_TTL_MS` (déf. 6 h) |
| user | `friction:user:<userId>` | `FRICTION_USER_TTL_MS` (déf. 24 h glissant) |
| ip (anon) | `friction:ip:<sha256(ip)>` | idem user (IP hashée, jamais en clair — RGPD) |

Anon = pas de `userId` → on utilise le plancher **IP hashée** (cohérent avec `RedisRateLimitStore` existant). IP jamais loggée/stockée en clair.

### 4.3 Gravité → poids de strike

| Gravité | Source | Poids (env) | Action immédiate |
|---|---|---|---|
| Sécurité | V1 keyword / sidecar (injection, toxicité, PII) | `w_security` = 2 | hard-block (inchangé) |
| Off-topic | judge `block` reason off_topic | `w_offtopic` = 1 | soft-redirect (sauf escalade) |
| On-topic | — | 0 | réponse |

### 4.4 Politique d'escalade (seuils env, ordre de grandeur validé)

Deux escalades **distinctes** (ne pas confondre) :

- **Session ≥ `FRICTION_SESSION_THRESHOLD` (S_soft = 3)** → escalade **par-message ciblée off-topic** : pour le reste de la session, un message off-topic est **hard-bloqué** (refus de recentrage) au lieu d'être soft-redirigé. **Les questions on-topic (art/culture/monument) continuent de marcher normalement** — on ne verrouille pas la session, on cesse juste de tolérer le détournement. Pas de minuteur.
- **User/IP ≥ `FRICTION_USER_THRESHOLD` (U_floor = 10 / 24 h)** → **cool-down temporisé global** : pendant `FRICTION_COOLDOWN_MS` (déf. 120 000), **tous** les messages de cet user/IP sont rate-limités (réponse cool-down), même en changeant de session. C'est le frein anti-abuseur persistant. Réutilise le concept `RedisRateLimitStore` (flag `friction:cooldown:<scope>` avec TTL).
- Cool-down = message localisé honnête (i18n `error.chat.refocus`), pas un 500, **pas d'emoji** (règle no-emoji). Ex FR : « Je suis ton compagnon culturel — restons sur l'art et le patrimoine. On reprend quand tu veux. »

Tous gated par `GUARDRAIL_FRICTION_ENABLED` (déf. true) : kill-switch sans redeploy.

## 5. Configuration (env)

```
GUARDRAIL_FRICTION_ENABLED=true
FRICTION_SESSION_THRESHOLD=3
FRICTION_USER_THRESHOLD=10
FRICTION_SESSION_TTL_MS=21600000      # 6 h
FRICTION_USER_TTL_MS=86400000         # 24 h
FRICTION_COOLDOWN_MS=120000           # 2 min
FRICTION_WEIGHT_SECURITY=2
FRICTION_WEIGHT_OFFTOPIC=1
```

Backend du store : suit `GUARDRAIL_BUDGET_BACKEND` (memory/redis) déjà existant, même `CacheService`.

## 6. Gestion d'erreur

| Panne | Comportement |
|---|---|
| Judge timeout/erreur/budget | `null` → fail-OPEN → réponse passe (inchangé) |
| Sidecar muet | `policy:service_unavailable` (inchangé) |
| FrictionStore (Redis) down | `count()` renvoie 0 → pas d'escalade ; soft-redirect + sécurité inline tiennent. **Jamais fail-closed sur panne infra.** |
| Abort non supporté par l'orchestrateur | on laisse finir puis on supprime la réponse (correct, moins économe) |

## 7. Tests (réels, no mock LLM — prolongent `guardrail-v2-live.ai.test.ts`)

1. **off-topic isolé < seuil** → soft-redirect : réponse présente, **pas** de `policy:off_topic`, le section prompt recentre.
2. **off-topic répété ≥ S_soft** (3×) → 3ᵉ message hard-block `policy:off_topic` + message de cool-down.
3. **latence parallèle** : message on-topic jugé → latence totale ≈ latence de la réponse seule (assert : pas de somme answer+judge ; marge tolérante).
4. **plancher user cross-session** : strikes répartis sur 2 sessions du même `userId` → cool-down à U_floor.
5. **abort** : judge bloque pendant la génération → génération avortée (pas de réponse complète facturée — assert via spy orchestrateur ou absence de texte d'answer).
6. **fail-soft store** : FrictionStore qui throw → pas d'escalade, chat répond (pas de 500).
7. **kill-switch** : `GUARDRAIL_FRICTION_ENABLED=false` → comportement = legacy (judge inline hard-block).
8. **sécurité inchangée** : injection/PII toujours hard-block immédiat + strike sécurité poids 2.

Unitaires : `GuardrailFrictionStore` (incrBy/TTL/fail-soft) façon `guardrail-budget` tests.

## 8. Impact code (esquisse, détaillée par /team)

- **Nouveau** : `src/modules/chat/useCase/guardrail/guardrail-friction.store.ts` (+ types) — calqué `guardrail-budget.ts`.
- **`guardrail-evaluation.service.ts`** : extraire le judge de `evaluateInput` (qui ne garde que V1+sidecar inline) ; exposer `evaluateInputSemantic(text, scope)` appelable en parallèle ; intégrer les strikes + l'escalade.
- **`prepare-message.pipeline.ts`** : restructurer le tronçon `evaluateInput → generate` en `securityGate → parallel(judge, generate(abortSignal)) → gate final`. Threader un `AbortSignal` vers l'orchestrateur (best-effort).
- **`chat-orchestrator.port` / langchain orchestrator** : accepter un `AbortSignal` optionnel (dégradation gracieuse si absent).
- **env** : `src/shared/config` ajout des clés `FRICTION_*` + `GUARDRAIL_FRICTION_ENABLED`.
- **i18n** : `error.chat.refocus` (8 locales).
- **`chat-route.helpers.ts`** : le `socketCeilingMs` n'augmente PAS (le judge ne s'additionne plus en série — il est parallèle ; vérifier l'invariant R2 reste vrai, voire le budget baisse).

## 9. Risques & mitigations

- **Sécurité-sensible** : restructurer le guardrail à J-6. Mitigation : invariants §3 testés explicitement (tests 7,8), kill-switch env, `/team` fresh-context + reviewer + security agent.
- **Coût** : payer answer+judge sur off-topic sous-seuil. Mitigation : abort ; off-topic = minorité ; judge ~0,06¢.
- **Abort non câblé** : risque de complexité. Mitigation : abort = optimisation optionnelle, le suppress suffit à la correction.
- **Faux positifs judge** (on-topic jugé off-topic) : un visiteur légitime accumulerait des strikes. Mitigation : seuil 3 (pas 1), poids off-topic faible, le judge est déjà testé anti-over-block (matrice).

## 10. Critères d'acceptation

- Off-topic isolé → soft-redirect, **0 ms de latence judge ajoutée** mesurable sur le cas on-topic.
- Off-topic/abus répété → hard-block + cool-down, vérifié réel.
- Plancher user/IP cross-session fonctionnel.
- Tous les invariants sécurité §3 verts. Kill-switch fonctionnel. Store fail-soft.
- `tsc` 0, `pnpm lint` 0, `lint:test-discipline` 0, suite `guardrail-v2-live` + nouveaux tests verts en réel.

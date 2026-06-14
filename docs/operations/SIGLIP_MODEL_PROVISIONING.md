# SigLIP Model Provisioning — Runbook

**But** : le bundle ONNX SigLIP-2 que l'adapter `siglip-onnx` charge pour la route
`/chat/compare` (visual-similarity C3, ADR-037).

> **État (2026-06, P0.C1 résolu)** : le modèle est **provisionné et possédé**. Il est
> figé dans une image de base GHCR mono-couche
> (`ghcr.io/timmoyence/museum-backend-base:siglip-v1`) et copié dans l'image prod via
> `COPY --from` (cf. `deploy/Dockerfile.prod`). **Aucune action opérateur n'est requise
> pour la prod** — il n'y a plus de bucket GCS externe, plus d'export à la main, plus de
> secret SHA à câbler. L'ancien chemin (`scripts/fetch-models.sh` + bucket
> `musaium-models-public` jamais provisionné, qui laissait `/chat/compare` en **503**) a
> été retiré.

La recette canonique (provenance, vérification, build + push de l'image de base) vit
désormais dans **[`museum-backend/deploy/model-base/README.md`](../../museum-backend/deploy/model-base/README.md)**.

---

## 0. Contexte technique (vérifié dans le code)

| Élément | Valeur (vérifiée) | Référence |
|---|---|---|
| Modèle | vision tower de `google/siglip2-base-patch16-224` | `deploy/model-base/README.md` |
| I/O ONNX | input `pixel_values` → output `pooler_output` `[*, 768]` | `siglip-onnx.adapter.ts` `SIGLIP_OUTPUT_NAME` |
| sha256 | `c0573e3f…b163bcad` | `deploy/model-base/Dockerfile` |
| Chemin runtime | `./models/siglip2-base-patch16-224.onnx` | `.env.example` `SIGLIP_ONNX_MODEL_PATH` |
| Image de base | `ghcr.io/timmoyence/museum-backend-base:siglip-v1` | `deploy/Dockerfile.prod` (`COPY --from`) |
| Provider par défaut | `siglip-onnx` | `museum-backend/src/config/env-resolvers.ts:136-137` |
| Taille approx. | ~354 Mo | `deploy/model-base/README.md` |

**Robustesse runtime** : si le modèle est absent / corrompu / non chargeable, l'adapter
lève `EncoderUnavailableError` (jamais un 500 brut) et `/chat/compare` retombe en **503
gracieux** (`similarity.service.ts` `encodeOrFallback`). Avec l'image de base en place,
ce chemin de repli ne se déclenche pas en prod.

---

## 1. Prod — rien à faire

Le déploiement backend récupère le modèle automatiquement :

1. Le job de déploiement s'authentifie à GHCR (`docker/login-action`) **avant** le
   `docker build` de `Dockerfile.prod`.
2. Le build fait `COPY --from=ghcr.io/timmoyence/museum-backend-base:siglip-v1 …` — couche
   adressée par le digest de la base, **mise en cache** : le modèle est tiré au plus une
   fois par runner, jamais re-téléchargé à chaque build.

L'image de base est **privée** ; l'auth GHCR du CI suffit. Ne la rendre publique que si
un contexte de build non authentifié en a besoin un jour.

---

## 2. Dev local — `pull-siglip-model.sh`

Pour obtenir le même fichier (poids byte-identiques à la prod) sur un poste dev, depuis
`museum-backend/` :

```bash
bash scripts/pull-siglip-model.sh
```

Le script `docker pull` l'image de base, extrait le `.onnx` vers
`./models/siglip2-base-patch16-224.onnx`, et **vérifie le sha256**. Idempotent (skip si
déjà présent et hash OK). Requiert `docker` (loggé sur ghcr.io si la base est privée).

---

## 3. Reconstruire / faire tourner l'image de base

Voir **[`deploy/model-base/README.md`](../../museum-backend/deploy/model-base/README.md)** :
provenance HF, `verify-model.py` (valide sha256 + contrat I/O), puis `docker build` +
`docker push` de la base. À faire uniquement pour une rotation de modèle (`siglip-v2`).

---

## 4. Alternative — provider managé Replicate

Si on veut basculer hors auto-hébergement (coût par appel + latence réseau au lieu du CPU
local) :

```bash
EMBEDDINGS_PROVIDER=replicate
REPLICATE_API_TOKEN=<token>
```

`EMBEDDINGS_PROVIDER` accepte `siglip-onnx` | `replicate`, défaut `siglip-onnx`
(`env-resolvers.ts:23,136-137`). `REPLICATE_API_TOKEN` n'est consommé que quand
`provider === 'replicate'` (`env.types.ts:390-391`, `env.ts:338`) ; l'artefact ONNX est
alors ignoré (`env.types.ts:387`). **Coût par appel Replicate à confirmer par l'opérateur**
(non documenté dans le repo).

---

## 5. Checklist de vérification

- [ ] L'image de base `ghcr.io/timmoyence/museum-backend-base:siglip-v1` existe
      (`docker manifest inspect …`).
- [ ] Un déploiement backend récent build sans erreur sur le `COPY --from` (auth GHCR OK).
- [ ] **Smoke** : un appel à `/chat/compare` avec une image valide renvoie un résultat
      (≠ 503). Procédure (auth, payload, endpoint) via `museum-backend/test.http` ou le flow
      Maestro `chat-compare.yaml`.

> Si le smoke renvoie encore 503 après un build OK : vérifier que `EMBEDDINGS_PROVIDER`
> n'est pas resté sur `replicate` sans token, et que `SIGLIP_ONNX_MODEL_PATH` (défaut
> `./models/siglip2-base-patch16-224.onnx`, `env.types.ts:386`) pointe bien le fichier
> présent dans l'image (= la cible du `COPY --from`).

---

## Références code

- `museum-backend/deploy/model-base/` — recette de l'image de base (Dockerfile, README, verify).
- `museum-backend/deploy/Dockerfile.prod` — `COPY --from` de la base vers l'image prod.
- `museum-backend/scripts/pull-siglip-model.sh` — extraction du modèle pour le dev local.
- `museum-backend/src/modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter.ts` — adapter ONNX (lit `pooler_output`, `EncoderUnavailableError` → 503).
- `museum-backend/src/config/env-resolvers.ts:23,132-137` — résolution `EMBEDDINGS_PROVIDER`.
- `museum-backend/src/config/env.types.ts:370-391` — config `visualSimilarity`.
- ADR-037 — visual-similarity / pgvector.

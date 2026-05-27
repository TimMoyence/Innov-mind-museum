# SigLIP Model Provisioning — Runbook

**But** : provisionner le bundle ONNX SigLIP-2 que l'adapter `siglip-onnx` charge pour la
route `/chat/compare` (visual-similarity C3, ADR-037). Tant que le bucket GCS
`musaium-models-public` n'est pas provisionné, `fetch-models.sh` skip silencieusement
(tolérance « bucket-not-provisioned ») et `/chat/compare` renvoie **503**.

Ce runbook s'adresse à un opérateur qui n'a **jamais** exporté un modèle ONNX. Suivre
les étapes dans l'ordre. Aucune valeur n'est inventée : toute donnée non vérifiable est
marquée **« à confirmer par l'opérateur »**.

---

## 0. Contexte technique (vérifié dans le code)

Source de vérité : `museum-backend/scripts/fetch-models.sh`.

| Élément | Valeur (vérifiée) | Référence |
|---|---|---|
| Modèle | `google/siglip2-base-patch16-224` | `fetch-models.sh:38` (commande `optimum-cli`) |
| URL GCS par défaut | `https://storage.googleapis.com/musaium-models-public/siglip2-base-patch16-224.onnx` | `fetch-models.sh:44` (`DEFAULT_URL`) |
| Destination par défaut | `./models/siglip2-base-patch16-224.onnx` | `fetch-models.sh:45` (`DEFAULT_DEST`) |
| Var override URL | `SIGLIP_ONNX_URL` | `fetch-models.sh:18,47` |
| Var override dest | `SIGLIP_ONNX_DEST` | `fetch-models.sh:19,48` |
| Var SHA256 attendu | `SIGLIP_ONNX_SHA256` | `fetch-models.sh:20,49` |
| Provider par défaut | `siglip-onnx` | `museum-backend/src/config/env-resolvers.ts:136-137` |
| Taille approx. du modèle | ~340 Mo | `fetch-models.sh:6` (docstring) |

**Comportement du script** (vérifié `fetch-models.sh:54-101`) :

- `curl --fail` télécharge `DEFAULT_URL` (HTTP GET anonyme — l'objet doit donc être
  **publiquement lisible**, ou `SIGLIP_ONNX_URL` doit pointer une URL signée valide).
- Si `SIGLIP_ONNX_SHA256` est **non défini** ET le download échoue (404) → WARNING + `exit 0`
  (build Docker continue, route 503 au runtime). C'est la tolérance actuelle.
- Si `SIGLIP_ONNX_SHA256` est **défini** → toute erreur (404 ou hash drift) devient
  **fail-loud** (`exit 1`, build Docker échoue). Définir le SHA est le signal explicite
  « le bucket est prêt pour la prod ».

> **Décision préalable** : si la visual-similarity est **hors périmètre V1**, ne pas provisionner —
> aller directement au **§6 (alternatives)**.

---

## 1. Prérequis

Poste opérateur (machine de build, pas la prod) :

- Python 3.10+ et `pip`.
- `gcloud` CLI authentifié sur le projet GCP qui héberge `musaium-models-public`
  (**nom du projet GCP à confirmer par l'opérateur** — non présent dans le repo).
- Accès en écriture au bucket `musaium-models-public` (à créer s'il n'existe pas — §4).
- Droit d'ajouter un secret au repo GitHub (étape §5).

Installer l'exporteur ONNX :

```bash
pip install "optimum[exporters]"
```

> `optimum[exporters]` tire `transformers`, `onnx`, `onnxruntime`. Sur certaines machines
> l'export de SigLIP-2 exige une version récente de `transformers` (le support SigLIP-2 est
> arrivé après SigLIP v1) — **vérifier le message d'erreur de l'export et bumper
> `transformers` si `optimum-cli` rapporte un type de modèle inconnu**.

---

## 2. Export ONNX

```bash
optimum-cli export onnx \
  --model google/siglip2-base-patch16-224 \
  ./models/siglip2-base-patch16-224
```

(Commande identique à celle citée dans `fetch-models.sh:38`.)

`optimum-cli` produit un **dossier** (`config.json`, `model.onnx`, tokenizer, etc.). Le
script de fetch attend un **fichier unique** `siglip2-base-patch16-224.onnx`. Le fichier
ONNX exporté s'appelle généralement `model.onnx` dans le dossier de sortie.

> **Point à valider par l'opérateur** : confirmer quel artefact ONNX l'adapter
> `siglip-onnx` charge réellement au runtime (un `model.onnx` simple, ou un bundle).
> Le `DEFAULT_DEST` du script (`siglip2-base-patch16-224.onnx`) suppose **un fichier `.onnx`
> unique**. Renommer / aplatir en conséquence :

```bash
cp ./models/siglip2-base-patch16-224/model.onnx \
   ./siglip2-base-patch16-224.onnx
```

> Si le runtime ONNX requiert des poids externes (`*.onnx_data` quand le modèle dépasse
> la limite protobuf de 2 Go) le `DEFAULT_DEST` mono-fichier ne suffira pas — dans ce cas,
> aligner d'abord `siglipOnnxModelPath` / le packaging (escalade Tech Lead). SigLIP-base
> est < 2 Go donc, en principe, un seul `.onnx` suffit (**à confirmer après export**).

---

## 3. Calcul du SHA256 canonique

C'est la valeur qu'on publiera dans CI (étape §5) pour rendre `fetch-models.sh` fail-loud.

macOS :

```bash
shasum -a 256 ./siglip2-base-patch16-224.onnx
```

Linux :

```bash
sha256sum ./siglip2-base-patch16-224.onnx
```

Noter la chaîne hex de 64 caractères (premier champ). C'est `SIGLIP_ONNX_SHA256`.

> Le script vérifie via `sha256sum` (`fetch-models.sh:60,91`). Sur macOS, `shasum -a 256`
> produit exactement le même digest.

---

## 4. Upload vers le bucket GCS `musaium-models-public`

Le script télécharge via **HTTP GET anonyme** sur l'URL `storage.googleapis.com/...`
(`fetch-models.sh:74`, pas d'en-tête d'auth). L'objet doit donc être **lisible publiquement**.

Créer le bucket s'il n'existe pas (région **à confirmer par l'opérateur** — choisir une
région UE pour rester cohérent avec l'hébergement OVH/UE ; le contenu n'est pas de la
donnée personnelle, c'est un poids de modèle public) :

```bash
gcloud storage buckets create gs://musaium-models-public --location=EU
```

Uploader le fichier (le nom de l'objet DOIT matcher l'URL du script) :

```bash
gcloud storage cp ./siglip2-base-patch16-224.onnx \
  gs://musaium-models-public/siglip2-base-patch16-224.onnx
```

Rendre l'objet publiquement lisible (lecture anonyme uniquement, pas d'écriture) :

```bash
gcloud storage objects update \
  gs://musaium-models-public/siglip2-base-patch16-224.onnx \
  --add-acl-grant=entity=allUsers,role=READER
```

> Si la politique d'org GCP interdit l'accès public (`allUsers`), utiliser à la place une
> **URL signée** et la passer via `SIGLIP_ONNX_URL` au lieu de modifier le `DEFAULT_URL` :
> ```bash
> gcloud storage sign-url gs://musaium-models-public/siglip2-base-patch16-224.onnx \
>   --duration=<durée>  # ex 7d
> ```
> Attention : une URL signée **expire** — au-delà, le build re-télécharge → 404 → si le SHA
> est défini, le build échoue fail-loud. Pour la prod, l'objet public est plus robuste qu'une
> URL signée à durée limitée. **Décision public-object vs signed-URL à trancher par l'opérateur
> selon la policy d'org GCP.**

Vérifier la lisibilité anonyme (depuis une session **non authentifiée** / `curl` brut) :

```bash
curl -I "https://storage.googleapis.com/musaium-models-public/siglip2-base-patch16-224.onnx"
# Attendu : HTTP/2 200 + Content-Length ~ taille du .onnx
```

---

## 5. Définir le secret CI `SIGLIP_ONNX_SHA256` (fail-loud)

Tant que ce secret n'est **pas** défini, un 404 reste toléré (§0). Le définir active le
mode fail-loud : toute dérive du hash ou tout download cassé fera échouer le build.

Ajouter le secret au repo GitHub (la valeur = le digest du §3) :

```bash
gh secret set SIGLIP_ONNX_SHA256 --body "<le-digest-64-hex-du-§3>"
```

Puis câbler ce secret dans le job de build Docker backend de manière à ce que
`fetch-models.sh` le voie comme variable d'environnement `SIGLIP_ONNX_SHA256` au moment
du build (étape `docker build` / `_deploy-backend.yml`).

> **Point à valider par l'opérateur** : confirmer dans quel workflow le `docker build` du
> backend exécute `fetch-models.sh` (builder stage de `museum-backend/deploy/Dockerfile.prod`,
> cf. `fetch-models.sh:7`) et y exposer `SIGLIP_ONNX_SHA256`. La doctrine projet (CI_CD_SECRETS)
> liste les secrets — y ajouter `SIGLIP_ONNX_SHA256` une fois renseigné. **Le nom exact du
> step / job qui invoque le script est à confirmer côté workflow** (non vérifié dans ce runbook).

---

## 6. Alternative — visual-similarity hors V1

Si la visual-similarity n'est pas dans le périmètre V1, deux options sans provisionner GCS :

### 6a. Provider managé Replicate

```bash
EMBEDDINGS_PROVIDER=replicate
REPLICATE_API_TOKEN=<token>
```

(`EMBEDDINGS_PROVIDER` accepte `siglip-onnx` | `replicate`, défaut `siglip-onnx` —
`museum-backend/src/config/env-resolvers.ts:23,136-137`. `REPLICATE_API_TOKEN` consommé
uniquement quand `provider === 'replicate'` — `env.types.ts:390-391`, `env.ts:338`.)

Avec ce provider, `fetch-models.sh` n'est plus nécessaire (l'artefact ONNX est ignoré quand
`provider === 'replicate'`, cf. `env.types.ts:387`). **Coût par appel managé Replicate à
confirmer par l'opérateur** (non documenté dans le repo).

### 6b. Désactiver la route

Si `/chat/compare` n'est pas exposée en V1, désactiver / ne pas router l'endpoint plutôt
que de laisser le 503 visible. **Mécanisme de désactivation exact à confirmer par
l'opérateur** (pas de flag dédié vérifié dans ce runbook — escalade Tech Lead si besoin).

---

## 7. Checklist de vérification (sortie de runbook)

- [ ] `optimum-cli export onnx --model google/siglip2-base-patch16-224 ...` réussi.
- [ ] Artefact ONNX aplati en un `.onnx` unique (ou packaging confirmé).
- [ ] SHA256 calculé et noté (§3).
- [ ] Objet uploadé sur `gs://musaium-models-public/siglip2-base-patch16-224.onnx`.
- [ ] `curl -I` anonyme sur l'URL GCS → **200** + bon `Content-Length`.
- [ ] Secret CI `SIGLIP_ONNX_SHA256` défini et câblé dans le build Docker backend.
- [ ] Re-déploiement backend : le log du build affiche `fetch-models: sha256 verified.`
      (`fetch-models.sh:97`).
- [ ] **Smoke** : un appel à `/chat/compare` avec une image valide renvoie un résultat
      (≠ 503). Procédure exacte (auth, payload, endpoint complet) **à confirmer par
      l'opérateur** via `museum-backend/test.http` ou `pnpm smoke:api`.

> Si le smoke renvoie encore 503 après un build « sha256 verified » : vérifier que
> `EMBEDDINGS_PROVIDER` n'est pas resté sur `replicate` sans token, et que
> `siglipOnnxModelPath` (défaut `./models/siglip2-base-patch16-224.onnx`,
> `env.types.ts:386`) pointe bien le fichier présent dans l'image.

---

## Références code

- `museum-backend/scripts/fetch-models.sh` — script de fetch (source de vérité).
- `museum-backend/src/config/env-resolvers.ts:23,132-137` — résolution `EMBEDDINGS_PROVIDER`.
- `museum-backend/src/config/env.types.ts:370-391` — config `visualSimilarity`.
- `museum-backend/src/config/env.ts:338` — wiring `REPLICATE_API_TOKEN`.
- ADR-037 — visual-similarity / pgvector.

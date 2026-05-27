# S3 Object Storage — Public-Access Verification Runbook

**But** : **prouver** que le bucket d'objets utilisateur (photos uploadées, audio TTS sortant)
est **PRIVÉ** avant de positionner le flag d'attestation `S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true`
en production.

**Pourquoi c'est critique** : les clés d'objet sont **énumérables** (préfixes du type
`chat-images/YYYY/MM/user-<id>/...`). Un bucket lisible publiquement laisse fuiter les photos
et l'audio de **chaque** utilisateur — violation RGPD Art. 32 (COMP-02). Le backend ne peut pas
sonder le bucket au boot (pas de creds cloud, pas de réseau au boot), donc il **exige une
attestation consciente** de l'opérateur via le flag. Ce runbook décrit comment gagner le droit
de poser ce flag.

Garde correspondante (vérifiée) : `validateS3Storage()` dans
`museum-backend/src/config/env.production-validation.ts:86-109`. Si `STORAGE_DRIVER=s3` et que
`S3_PUBLIC_ACCESS_BLOCK_VERIFIED` n'est pas truthy (`1|true|yes`, insensible à la casse —
`isTransferApproved()` `:53-55`), le boot prod **throw** :

> `S3 object storage in production requires S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true …`

Variables S3 requises en prod (mêmes lignes du validateur, `:104-108`) :
`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

> **Contexte hébergeur** : l'hébergeur prod est **OVH** (SUBPROCESSORS #20, cf.
> `docs/legal/ROPA.md:46`). L'opérateur **n'utilise pas AWS** ; la cible probable est
> **OVH Object Storage** (S3-compatible). Ce runbook met l'emphase sur OVH, avec variantes
> AWS / Scaleway pour portabilité. Le flag et la garde sont **provider-agnostiques** —
> seule l'attestation compte côté code.

> **À confirmer par l'opérateur** : valeurs réelles de `S3_ENDPOINT` / `S3_REGION` /
> `S3_BUCKET` en prod. Note : `docs/legal/ROPA.md:80` mentionne historiquement un endpoint
> AWS `s3.eu-west-3.amazonaws.com` — si la prod bascule sur OVH Object Storage, cet endpoint
> ROPA est à réaligner (hors périmètre de ce runbook ; signalé pour traçabilité).

---

## Principe de preuve

Un bucket est considéré **vérifié privé** quand **les deux** conditions tiennent :

1. **Aucune ACL / policy** n'accorde `public-read` (ni au bucket, ni aux objets).
2. **Test négatif** : un `GET` anonyme (sans creds) sur une clé connue renvoie **403**
   (ou 401), **jamais 200**.

Les commandes ci-dessous établissent ces deux preuves selon le provider.

---

## A. OVH Object Storage (emphase)

OVH Object Storage expose **deux faces** : l'API **OpenStack Swift** (native) et une
**API S3-compatible**. Selon la face utilisée par l'app (`S3_ENDPOINT` = endpoint S3 OVH),
vérifier via l'une ou l'autre.

> **À confirmer par l'opérateur** : région OVH (ex `gra`, `sbg`, `de`…) et endpoint S3
> exact (ex `https://s3.<region>.io.cloud.ovh.net`). Le format précis dépend du compte —
> le lire dans l'interface OVH ou la config `.env` prod.

### A1. Via l'API S3-compatible (aws-cli pointé sur OVH)

```bash
# Lister les ACL du bucket — il NE DOIT y avoir aucun grant à un groupe "AllUsers".
aws --endpoint-url "$S3_ENDPOINT" s3api get-bucket-acl --bucket "$S3_BUCKET"

# Public Access Block (si l'implémentation OVH le supporte — sinon erreur, voir note).
aws --endpoint-url "$S3_ENDPOINT" s3api get-public-access-block --bucket "$S3_BUCKET"
```

Lecture du résultat :

- `get-bucket-acl` : **aucun** `Grantee` ne doit avoir
  `URI: http://acs.amazonaws.com/groups/global/AllUsers` avec `Permission: READ`. La seule
  `Grantee` attendue est le `CanonicalUser`/`Owner` du compte.
- `get-public-access-block` : si OVH le supporte, les 4 flags
  (`BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets`)
  doivent être `true`.

> **Note OVH** : l'API S3 OVH n'implémente pas toujours `get-public-access-block`
> (c'est une primitive AWS). Si la commande renvoie une erreur « not implemented » /
> `NoSuchPublicAccessBlockConfiguration`, **ce n'est pas une preuve de privacy** — se
> reporter à l'ACL Swift (A2) **et** au test négatif (§D), qui font foi pour OVH.

### A2. Via OpenStack Swift (face native OVH)

```bash
# Afficher le conteneur et son ACL de lecture.
openstack container show "$S3_BUCKET"
```

Lecture du résultat :

- Le champ **Read ACL** (`X-Container-Read`) NE DOIT PAS contenir `.r:*` ni
  `.rlistings` (ces valeurs rendent le conteneur lisible/listable anonymement).
- Un conteneur privé a un Read ACL **vide** (ou restreint à des comptes/projets nommés).

Si un ACL public est trouvé, le retirer :

```bash
# Vide l'ACL de lecture publique (rend le conteneur privé).
openstack container set --property X-Container-Read="" "$S3_BUCKET"
# Puis re-vérifier avec `openstack container show`.
```

> **À confirmer par l'opérateur** : le nom du conteneur Swift = la valeur de `S3_BUCKET`
> (sur OVH, le bucket S3 et le conteneur Swift partagent généralement le même nom).

---

## B. AWS (variante)

```bash
# Les 4 flags doivent TOUS être true.
aws s3api get-public-access-block --bucket "$S3_BUCKET"

# Statut de "publicité" calculé par AWS — doit indiquer non public.
aws s3api get-bucket-policy-status --bucket "$S3_BUCKET"
```

Lecture du résultat :

- `get-public-access-block` →
  `BlockPublicAcls=true`, `IgnorePublicAcls=true`, `BlockPublicPolicy=true`,
  `RestrictPublicBuckets=true`.
- `get-bucket-policy-status` → `PolicyStatus.IsPublic = false`.

Si un flag manque, l'activer :

```bash
aws s3api put-public-access-block --bucket "$S3_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

(`aws s3api get-public-access-block` est l'outil cité par le message d'erreur du validateur,
`env.production-validation.ts:100`.)

---

## C. Scaleway Object Storage (variante)

Scaleway est S3-compatible : utiliser aws-cli pointé sur l'endpoint Scaleway.

```bash
# Endpoint type : https://s3.<region>.scw.cloud  (région ex fr-par, nl-ams…)
aws --endpoint-url "https://s3.<region>.scw.cloud" \
    s3api get-bucket-acl --bucket "$S3_BUCKET"
```

Lecture du résultat : comme OVH-S3 — **aucun** grant `AllUsers: READ`. La visibilité d'un
bucket Scaleway se règle aussi via la console (`Bucket visibility = Private`). **Confirmer
côté console Scaleway que la visibilité est `Private`** (`get-public-access-block` peut ne
pas être implémenté ; idem note OVH).

---

## D. Test négatif manuel (provider-agnostique — fait foi)

C'est la preuve la plus forte et elle vaut pour **tous** les providers, y compris quand
`get-public-access-block` n'est pas implémenté.

1. Identifier une **clé d'objet réellement existante** (ex un audio TTS récent). La récupérer
   via la console du provider, ou via une requête authentifiée
   (`aws --endpoint-url "$S3_ENDPOINT" s3 ls "s3://$S3_BUCKET/" --recursive | head`).

2. Construire l'URL publique brute de l'objet (sans signature, sans token), puis faire un
   `GET` **anonyme** :

```bash
# Remplacer par l'URL publique réelle de l'objet selon le provider.
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<endpoint-public>/$S3_BUCKET/<clé-objet-connue>"
```

Résultat attendu : **403** (ou 401). 

- **403 / 401** → l'objet n'est PAS lisible anonymement → preuve de privacy OK.
- **200** → **STOP. NE PAS poser le flag.** Le bucket fuite des données utilisateur.
  Repasser par §A/§B/§C pour retirer l'ACL/policy publique, puis re-tester jusqu'à 403.

> Ne jamais inclure de signature/presigned dans cette URL — le but est de simuler un
> attaquant anonyme énumérant `user-<id>`. Une URL signée renverrait 200 légitimement et
> invaliderait le test.

---

## E. Poser le flag (seulement après preuves §A–§D)

Une fois (1) ACL/policy sans public-read confirmé **et** (2) test négatif = 403 :

```bash
# Dans l'environnement prod (secret/CI, pas en clair dans le repo).
S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true
```

Au prochain boot, `validateS3Storage()` (`env.production-validation.ts:95-102`) ne throw plus
et exige ensuite la présence de `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` /
`S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (`:104-108`).

> **Le flag est une attestation, pas une preuve technique.** Le code ne sonde pas le bucket :
> poser `true` sans avoir fait §A–§D est une fausse attestation au sens COMP-02. La preuve
> vit dans ce runbook + la sortie des commandes (à archiver). Re-vérifier après toute
> migration de bucket ou rotation de creds.

---

## Checklist

- [ ] ACL bucket/conteneur : **aucun** public-read (`get-bucket-acl` OVH-S3 / `container show` Swift / AWS / Scaleway).
- [ ] (Si supporté) Public Access Block : 4 flags `true` / `IsPublic=false`.
- [ ] Test négatif §D : `curl` anonyme sur clé connue → **403** (jamais 200).
- [ ] Preuve archivée (sortie des commandes) à côté du ticket d'opération.
- [ ] `S3_PUBLIC_ACCESS_BLOCK_VERIFIED=true` posé en secret prod.
- [ ] Boot prod backend OK (pas de throw `validateS3Storage`).

---

## Références code

- `museum-backend/src/config/env.production-validation.ts:86-109` — garde COMP-02 `validateS3Storage`.
- `museum-backend/src/config/env.production-validation.ts:53-55` — `isTransferApproved` (truthy `1|true|yes`).
- `museum-backend/src/config/env.ts:514-517` — wiring vars `S3_*`.
- `docs/legal/ROPA.md:46,80` — OVH hosting (SUBPROCESSORS #20), endpoint S3 historique.
- RGPD Art. 32.

# 02 — Cosign + SLSA L3 : ce que tu dois changer (ou pas) sur ton compose VPS

> **Pour qui ?** Toi, qui te demandes "j'ai vu Cosign + SLSA dans le récap, est-ce que je dois toucher à mon `docker-compose.yml` sur le serveur ?"
> **Réponse courte :** **non, tu n'as rien à changer dans le compose**, mais tu as 2 secrets GitHub à confirmer et 1 décision à prendre. On regarde tout ça en détail.

---

## Le problème en une phrase

Avant le sprint : le serveur VPS faisait `docker pull` d'une image GHCR sans vérifier qui l'a poussée. Si quelqu'un volait notre token GHCR, il pouvait pousser une image piégée à notre nom et on l'aurait pull sans broncher.

Après le sprint : avant que le VPS ne pull l'image, GitHub Actions **signe** l'image (Cosign) **et** **atteste** qu'elle vient de notre workflow (SLSA L3) **et** vérifie ces deux propriétés. Si la vérification échoue, le déploiement s'arrête avant le SSH.

---

## Analogie : le colis et le facteur

Imagine que tu commandes un colis fragile.

- **Avant le sprint** : le facteur dépose n'importe quel colis à ton nom, tu l'ouvres, tu fais confiance.
- **Après le sprint** :
  1. Le fabricant scelle le colis avec un **cachet de cire** (Cosign signature).
  2. Le fabricant joint un **certificat tamponné** disant "ce colis a été fabriqué dans cette usine spécifique, à cette date" (SLSA attestation).
  3. Avant de remettre le colis au facteur, **le centre de tri vérifie le cachet et le certificat**. Si l'un manque ou ne colle pas, le colis est arrêté au tri (le déploiement échoue).
  4. Le facteur livre uniquement les colis qui ont passé le tri.

Tu, sur ton VPS, tu es le destinataire. Tu ne vérifies **rien** toi-même : c'est le centre de tri (GitHub Actions) qui vérifie avant de dire au facteur (SSH deploy) de livrer.

---

## Vocabulaire indispensable

| Terme | Définition courte |
|-------|-------------------|
| **Cosign** | Outil de la fondation Sigstore qui signe / vérifie des artefacts (images Docker en particulier). |
| **Keyless signing** | Cosign signe sans clé privée locale : il utilise un certificat éphémère lié à l'identité du workflow GitHub Actions (via OIDC). C'est le mode utilisé ici. |
| **SLSA** | Supply-chain Levels for Software Artifacts. Norme qui définit ce qui prouve qu'un artefact n'a pas été altéré entre source code et runtime. |
| **SLSA L3** | Le niveau qui dit "le build a tourné dans un environnement isolé, avec un attestateur indépendant qui peut prouver d'où ça vient". GitHub Actions + `actions/attest-build-provenance@v2` produit du L3. |
| **Provenance** | Le document qui dit "cette image vient de ce commit, dans ce repo, via ce workflow". |
| **Digest** | Le hash SHA-256 d'une image Docker. Immuable. C'est ce qu'on signe (pas le tag `:latest`). |
| **GHCR** | GitHub Container Registry — où on stocke nos images. |
| **OIDC token GitHub** | Jeton court qui prouve "c'est bien le workflow X du repo Y qui m'appelle". Permis par les permissions `id-token: write`. |

---

## Ce qui se passe maintenant en CI (étape par étape)

C'est dans `.github/workflows/ci-cd-backend.yml`, lignes ~285 à ~410 pour la prod (et ~626 à ~735 pour la staging — symétrique).

### Étape 1 — Build et push de l'image

Standard. On build l'image Docker avec les tags `:latest` et `:<commit-sha>` et on la pousse sur GHCR.

```yaml
- name: Push image to GHCR
  id: push
  uses: docker/build-push-action@bcafcacb16a39f128d818304e6c9c0c18556b85f
  with:
    context: .
    file: ./museum-backend/deploy/Dockerfile.prod
    push: true
    tags: |
      ghcr.io/${{ secrets.GHCR_USER }}/museum-backend:latest
      ghcr.io/${{ secrets.GHCR_USER }}/museum-backend:${{ github.sha }}
```

### Étape 2 — Installation de Cosign

Une action officielle Sigstore qui pose le binaire dans le runner GitHub.

```yaml
- name: Install cosign
  uses: sigstore/cosign-installer@v3
  with:
    cosign-release: 'v2.4.1'
```

### Étape 3 — Signature keyless

`ci-cd-backend.yml:375-380`

```yaml
- name: Cosign sign image (keyless)
  env:
    COSIGN_EXPERIMENTAL: '1'
  run: |
    cosign sign --yes \
      "ghcr.io/${{ secrets.GHCR_USER }}/museum-backend@${{ steps.push.outputs.digest }}"
```

Lecture : `cosign sign --yes <image>@<digest>`. Le `--yes` accepte automatiquement le prompt de confirmation. La signature est calculée avec une clé éphémère délivrée par Fulcio (CA Sigstore). La signature **et** le certificat éphémère sont stockés dans GHCR à côté de l'image.

### Étape 4 — Attestation SLSA L3

`ci-cd-backend.yml:382-387`

```yaml
- name: SLSA L3 build-provenance attestation
  uses: actions/attest-build-provenance@v2
  with:
    subject-name: ghcr.io/${{ secrets.GHCR_USER }}/museum-backend
    subject-digest: ${{ steps.push.outputs.digest }}
    push-to-registry: true
```

Cette action GitHub officielle génère un document SLSA L3 standard (au format in-toto) qui contient : le repo, le commit, le workflow, le runner, la date, le digest. Elle le pousse aussi dans GHCR.

### Étape 5 — Vérification de la signature (gate pré-déploiement)

`ci-cd-backend.yml:389-396`

```yaml
- name: Cosign verify signature (pre-deploy gate)
  env:
    COSIGN_EXPERIMENTAL: '1'
  run: |
    cosign verify \
      --certificate-identity-regexp "https://github.com/${{ github.repository }}/.github/workflows/.*" \
      --certificate-oidc-issuer https://token.actions.githubusercontent.com \
      "ghcr.io/${{ secrets.GHCR_USER }}/museum-backend@${{ steps.push.outputs.digest }}"
```

C'est le moment critique. On vérifie :
1. Que la signature existe.
2. Qu'elle vient bien d'un workflow **dans notre repo** (`certificate-identity-regexp`).
3. Que le certificat éphémère a été délivré par GitHub Actions (`certificate-oidc-issuer`).

Si l'une de ces 3 propriétés échoue, **`cosign verify` exit 1** et le job échoue. Donc l'étape SSH de déploiement qui suit ne tournera pas.

### Étape 6 — Vérification de l'attestation SLSA

`ci-cd-backend.yml:398-406`

```yaml
- name: Cosign verify SLSA provenance (pre-deploy gate)
  run: |
    cosign verify-attestation \
      --type slsaprovenance \
      --certificate-identity-regexp "https://github.com/${{ github.repository }}/.github/workflows/.*" \
      --certificate-oidc-issuer https://token.actions.githubusercontent.com \
      "ghcr.io/${{ secrets.GHCR_USER }}/museum-backend@${{ steps.push.outputs.digest }}"
```

Pareil que l'étape 5 mais sur le document de provenance.

### Étape 7 — SSH au VPS et `docker compose pull`

C'est seulement maintenant qu'on touche le serveur. Si toutes les étapes 3-6 sont passées, on déploie. Si l'une a échoué, on n'arrive jamais ici.

```yaml
script: |
  set -e
  cd /srv/museum
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin || true
  export IMAGE_TAG
  docker compose pull backend
  docker compose run --rm --no-deps -T backend node ./node_modules/typeorm/cli.js migration:run -d dist/src/data/db/data-source.js
  docker compose up -d --remove-orphans --timeout 30 backend
```

---

## Ce qui ne change PAS sur ton compose VPS

Lis bien : **rien**. Ton `/srv/museum/docker-compose.yml` reste exactement le même qu'avant. Pourquoi ?

Parce que la vérification se fait **côté CI**, pas côté serveur. Le serveur n'a pas Cosign installé, n'a pas de logique de vérification, ne sait même pas que la signature existe. Du point de vue du serveur, il fait juste `docker compose pull backend` comme avant.

C'est un choix d'architecture délibéré. Pour vérifier côté serveur, il faudrait :
- Installer Cosign sur le VPS.
- Récupérer une copie du certificat racine Fulcio pour le vérifier hors-réseau.
- Chaîner `cosign verify` dans un script wrapper avant chaque `docker pull`.

Trop de complexité pour un gain marginal : si l'attaquant a compromis ton **accès SSH** au VPS, la vérif côté serveur n'aide pas (l'attaquant pourrait shunter le wrapper). La vraie valeur est la vérif côté CI, **avant** le SSH.

---

## Ce que tu dois vérifier (action concrète)

### 1. Permissions du workflow GitHub Actions

Le job de déploiement doit avoir 3 permissions :

```yaml
permissions:
  contents: read         # lire le repo
  id-token: write        # demander un OIDC token à GitHub (pour Cosign keyless)
  attestations: write    # publier l'attestation SLSA
```

C'est déjà dans `.github/workflows/ci-cd-backend.yml:290-292` :

```yaml
      attestations: write
```

(le bloc complet est plus haut). Donc **rien à faire** ici, juste vérifier au prochain merge sur `main` que le workflow ne plante pas avec une erreur de permission.

### 2. Secrets GitHub Actions

Tes secrets nécessaires (dans Settings → Secrets and variables → Actions) :

| Secret | Pourquoi |
|--------|----------|
| `GHCR_USER` | Le nom d'utilisateur GitHub propriétaire de l'image. |
| `GHCR_TOKEN` | PAT (Personal Access Token) avec scope `write:packages` pour push GHCR. |
| `SERVER_HOST` | IP/hostname de ton VPS. |
| `SERVER_USER` | User SSH sur le VPS. |
| `SERVER_KEY` | Clé privée SSH. |

**Aucun nouveau secret à ajouter pour Cosign + SLSA**. Cosign keyless utilise l'OIDC token GitHub natif (déjà disponible automatiquement si `id-token: write` est dans les permissions).

### 3. Token GHCR : scope `write:packages` et `read:packages`

C'est le seul "piège classique" : si ton `GHCR_TOKEN` n'a que `write:packages`, l'étape de push marchera mais la vérif de la signature peut renvoyer un 401 sur le téléchargement de la signature attachée. **Le scope `read:packages` doit aussi être présent.**

Pour vérifier : GitHub → Settings → Developer settings → Personal access tokens → ton token → onglet "scopes". Tu dois voir cochés `write:packages` ET `read:packages`.

### 4. Renommer ton repo ou le username GitHub ?

Si demain tu changes le nom du repo (`InnovMind` → autre chose) ou le username GitHub propriétaire, le `certificate-identity-regexp` ne matchera plus. La regex actuelle :

```
https://github.com/${{ github.repository }}/.github/workflows/.*
```

`${{ github.repository }}` est interpolé automatiquement par Actions au runtime — donc renommer le repo passera silencieusement, **mais** les images signées avant le rename ne pourront plus être vérifiées avec la nouvelle regex (elles ont l'ancien nom dans leur certificat). Pas un problème pour les nouveaux deploys, juste pour ressortir un vieux digest.

---

## Question honnête : et si je veux quand même vérifier côté VPS ?

Tu peux. Voici la version manuelle, à utiliser une fois pour comprendre, pas pour automatiser :

```bash
# 1. Installer cosign sur le VPS (Debian/Ubuntu)
curl -O -L "https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64"
sudo mv cosign-linux-amd64 /usr/local/bin/cosign
sudo chmod +x /usr/local/bin/cosign

# 2. Récupérer le digest de l'image courante
DIGEST=$(docker inspect ghcr.io/timmoyence/museum-backend:latest --format '{{index .RepoDigests 0}}')
echo "Image digest: $DIGEST"

# 3. Vérifier la signature
cosign verify \
  --certificate-identity-regexp "https://github.com/timmoyence/InnovMind/.github/workflows/.*" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  "$DIGEST"

# Si ça affiche "Verified OK" + le claim JSON, la signature est bonne.
# Si ça affiche une erreur, ne déploie pas.
```

**Tu n'as pas besoin de l'automatiser**, c'est un outil de diagnostic ponctuel.

---

## Pourquoi c'est pertinent pour Musaium

**Scénario d'attaque concret**, sans Cosign :

1. Un attaquant compromet ton `GHCR_TOKEN` (PAT mal scopé, leak dans un screenshot, ancien dev du projet, etc.).
2. Il build une image piégée : la même que l'officielle, plus 3 lignes qui exfiltrent les variables d'environnement (donc `JWT_SECRET`, `OPENAI_API_KEY`, `DB_PASSWORD`).
3. Il pousse l'image avec le tag `:latest` ou même `:<sha-existant>` (GHCR autorise le repush si on a `write:packages`).
4. Au prochain `docker compose pull`, le VPS télécharge l'image piégée, la démarre, l'attaquant récupère les secrets en quelques minutes.

**Avec Cosign** : étape 5 (vérification) plante car la nouvelle image n'a pas de signature valide délivrée par notre workflow. Le déploiement s'arrête. Ton `pnpm test` + `cosign verify` en CI t'alerte de la tentative.

**Caveat honnête** : un attaquant qui compromet **à la fois** ton `GHCR_TOKEN` **et** réussit à hijacker ton workflow GitHub Actions (par exemple via un PR malveillant qui modifie `.github/workflows/`) peut encore signer une image. Cosign n'est pas magique — il transforme "1 secret leaké suffit" en "il faut compromettre 2 systèmes différents". Ce n'est pas absolu, c'est un **gros saut de coût** pour l'attaquant.

---

## Est-ce overkill pour Musaium ?

**Non.** Trois raisons :

1. **Coût marginal nul** côté serveur (rien à changer dans le compose).
2. **Coût marginal faible** côté CI (~30 secondes ajoutées au workflow de déploiement).
3. **Gain réel** : ferme un vecteur supply-chain qui est devenu **le top vecteur d'attaque 2024-2026** sur les services SaaS modernes (cf. SolarWinds, xz-utils backdoor, etc.).

Le seul cas où ce serait overkill = tu décides en V1 de pull l'image en local (via `docker save` + `scp`) au lieu de passer par GHCR. Tu n'es pas dans ce cas.

---

## Récap : ce que tu dois faire

| Action | Statut |
|--------|--------|
| Modifier `docker-compose.prod.yml` | **Rien à faire**. Le compose est inchangé. |
| Ajouter de nouveaux secrets GitHub | **Rien à faire**. Pas de nouveau secret. |
| Vérifier que `id-token: write` + `attestations: write` sont dans les permissions du workflow | Déjà fait (lignes 290-292). |
| Vérifier que `GHCR_TOKEN` a `read:packages` | À vérifier dans GitHub Developer Settings (1 minute). |
| Au prochain merge sur `main`, regarder que le workflow `deploy-prod` passe bien les 4 étapes Cosign | Surveillance ponctuelle au prochain deploy. |
| Optionnel : tester `cosign verify` à la main une fois sur le VPS pour comprendre | Optionnel, pédagogique. |

---

## Si quelque chose plante au prochain déploiement

Symptômes possibles et comment réagir :

| Erreur | Cause probable | Fix |
|--------|----------------|-----|
| `Error: input has been signed but signatures could not be verified` | Le certificat éphémère a expiré (sign et verify trop espacés dans le temps) | Re-run le workflow. Si récurrent : ouvrir un issue Sigstore. |
| `Error: 401 Unauthorized` sur `cosign verify` | Le `GHCR_TOKEN` n'a pas `read:packages` | Régénérer le token avec les 2 scopes. |
| `Error: certificate identity does not match` | Tu as renommé le repo ou changé d'org | Mettre à jour la regex dans `ci-cd-backend.yml:394` et `:404`. |
| `Error: no signatures found` | L'étape `cosign sign` n'a pas tourné (workflow custom, ancien commit) | Re-run le full workflow depuis le début. |

En cas de doute, **rollback immédiat** vers la dernière image qui était signée et déployée :

```bash
ssh deploy@<vps>
cd /srv/museum
sudo ./rollback.sh   # script déjà installé par CI
```

(Le rollback est documenté dans `docs/RUNBOOKS/` — il ne dépend pas de Cosign, il restaure simplement le digest précédent.)

# Musaium — Production Runbook

> Procedures d'urgence pour incidents production. A lire AVANT qu'un incident arrive.

---

## 1. Rollback Backend (Docker)

### Quand utiliser
Apres un deploy backend qui introduit un bug critique.

### Procedure

```bash
# 1. Se connecter au VPS
ssh deploy@<SERVER_HOST>

# 2. Identifier l'image precedente
docker image ls ghcr.io/timmoyence/museum-backend --format '{{.Tag}} {{.CreatedAt}}' | head -5

# 3. Modifier le tag dans docker-compose.yml
cd /srv/museum
# Remplacer :latest par le tag precedent (ex: :sha-abc1234)
vi docker-compose.yml

# 4. Redemarrer avec l'ancienne image
docker compose pull backend
docker compose up -d backend

# 5. Verifier le health check
curl -s https://musaium.com/api/health | jq .
```

### Si l'image precedente n'est plus disponible

```bash
# Reconstruire depuis un commit specifique
git checkout <commit-hash>
docker build -f deploy/Dockerfile.prod -t ghcr.io/timmoyence/museum-backend:rollback .
docker compose up -d backend
```

---

## 2. Revert Migration TypeORM

### Quand utiliser
Si une migration a corrompu le schema ou les donnees.

### Procedure

```bash
# 1. Se connecter au conteneur backend
docker exec -it museum-backend sh

# 2. Reverter la derniere migration
npx typeorm migration:revert -d dist/src/data/db/data-source.js

# 3. Verifier le schema
npx typeorm migration:show -d dist/src/data/db/data-source.js
```

**ATTENTION** : un revert de migration ne restaure PAS les donnees supprimees.
Si des donnees ont ete perdues, utiliser la procedure de restore DB (section 3).

---

## 3. Restore Base de Donnees

> Reference complete : `docs/DB_BACKUP_RESTORE.md`

### Procedure rapide

```bash
# 1. Lister les backups disponibles
ls -la /srv/museum/backups/daily/

# 2. Arreter le backend (eviter les ecritures pendant restore)
docker compose stop backend

# 3. Restaurer sur la base prod
pg_restore \
  --host=localhost \
  --port=5432 \
  --username=museumia_prod \
  --dbname=museumia_prod \
  --clean \
  --if-exists \
  /srv/museum/backups/daily/<backup-file>.dump

# 4. Redemarrer le backend
docker compose start backend

# 5. Verifier
curl -s https://musaium.com/api/health | jq .
```

### Restore partiel (une seule table)

```bash
pg_restore \
  --host=localhost \
  --port=5432 \
  --username=museumia_prod \
  --dbname=museumia_prod \
  --table=<table_name> \
  --clean \
  /srv/museum/backups/daily/<backup-file>.dump
```

---

## 4. Rollback Museum-Web (Next.js)

```bash
ssh deploy@<SERVER_HOST>
cd /srv/museum-web

# Meme principe que le backend
docker image ls ghcr.io/timmoyence/museum-web --format '{{.Tag}} {{.CreatedAt}}' | head -5
# Modifier le tag, puis:
docker compose pull web
docker compose up -d web
```

---

## 5. Rollback Mobile (EAS)

Les builds mobiles ne peuvent pas etre "rollback" une fois soumis aux stores.

**Options** :
1. **OTA Update** : Si expo-updates est configure, publier un patch via `eas update`
2. **Nouvelle soumission** : Construire depuis le commit stable et soumettre
3. **Retrait** : Retirer l'app des stores temporairement (dernier recours)

```bash
# OTA update depuis un commit stable
cd museum-frontend
git checkout <stable-commit>
eas update --branch production --message "Rollback to stable"
```

---

## 6. Escalade

| Severite | Action | Contact |
|----------|--------|---------|
| P1 (service down) | Rollback immediat + notification equipe | Tim (lead) |
| P2 (fonctionnalite cassee) | Hotfix dans l'heure, deploy staging d'abord | Tim (lead) |
| P3 (degradation mineure) | Fix dans le prochain sprint | Equipe dev |
| P4 (cosmetique) | Backlog | Equipe dev |

### Checklist incident P1

- [ ] Health check echoue ? → Rollback Docker (section 1)
- [ ] DB corrompue ? → Restore backup (section 3)
- [ ] Migration cassee ? → Revert migration (section 2)
- [ ] Mobile crash ? → OTA update (section 5)
- [ ] Apres resolution : post-mortem dans `docs/incidents/`

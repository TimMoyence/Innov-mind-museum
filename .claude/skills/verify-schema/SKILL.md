# /verify-schema — Audit schema TypeORM

Verifie la coherence entre les entites TypeORM, les migrations, et la base de donnees.

## ARGUMENTS

```
/verify-schema [module]    # "auth", "chat", ou absent pour tout scanner
```

## PIPELINE

### Step 1 — Collecter les entites

```bash
# Lister toutes les entites TypeORM
grep -rl "@Entity" museum-backend/src/modules/ --include="*.ts"
```

Pour chaque entite, extraire : nom table (`@Entity('table_name')`), colonnes (`@Column`), relations (`@ManyToOne`, `@OneToMany`), indexes (`@Index`).

### Step 2 — Collecter les migrations

```bash
ls museum-backend/src/data/db/migrations/*.ts | sort
```

Lire les migrations pour comprendre l'evolution du schema (CREATE TABLE, ALTER TABLE, CREATE INDEX).

### Step 3 — Detecter le drift

```bash
# TypeORM schema sync check (ne modifie rien, genere un diff)
cd museum-backend && node scripts/migration-cli.cjs generate --name=DriftCheck 2>&1
```

Si le fichier genere contient des queries → drift detecte. Lire le contenu pour identifier les colonnes/tables manquantes.

**Nettoyer** : supprimer le fichier DriftCheck genere apres lecture.

### Step 4 — Verifier la coherence

| Check | Description | Severite |
|-------|-------------|----------|
| Column sans migration | Colonne dans @Entity mais pas de migration correspondante | CRITICAL |
| Index manquant | Colonne utilisee dans WHERE/JOIN sans @Index | HIGH |
| Relation orpheline | @ManyToOne sans ON DELETE ou sans cascade defini | MEDIUM |
| Migration sans down() | Migration qui ne peut pas etre revertee | MEDIUM |
| Nom table inconsistant | @Entity('name') ne correspond pas au snake_case du nom d'entite | LOW |

### Step 5 — Rapport

```
## /verify-schema Report

### Entites scannees: N
### Migrations: N

### Findings
| # | Severite | Entite | Description | Fix propose |
|---|----------|--------|-------------|-------------|

### Schema Status: CLEAN | DRIFT DETECTED
- Drift details: [si applicable]
- Migration needed: YES/NO

### Recommandation
[Si drift: node scripts/migration-cli.cjs generate --name=FixDrift]
```

## INTEGRATION /team

Phase 0 COMPRENDRE : si le scope inclut des modifications DB/entites, `/verify-schema` est execute avant le DEV.

## REGLES

1. JAMAIS de migration ecrite a la main — toujours `migration-cli.cjs generate`
2. Nettoyer les fichiers DriftCheck generes apres analyse
3. DB_SYNCHRONIZE JAMAIS true en production

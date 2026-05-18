---
name: verify-schema
description: "/verify-schema — Audit schema TypeORM (UFR-022 fresh-context aware)"
last-verified: 2026-05-18
---

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

## UFR-022 — Fresh-context contract

Si ce skill est invoqué dans le cadre d'un run `/team` (RUN_ID set) :
- Premiere reponse : `BRIEF-ACK: <sha256-of-args>`.
- Si message history contient des artefacts d'une autre phase du meme RUN_ID → `BLOCK-CONTEXT-LEAK` + refus.
- Read inputs via `Read` sur paths brief — ne pas faire confiance aux resumes message-context.
- Si la diff touche une lib persistence (typeorm, pg, mongoose, etc.), consulter `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md` si presents.

## REGLES

1. JAMAIS de migration ecrite a la main — toujours `migration-cli.cjs generate`
2. Nettoyer les fichiers DriftCheck generes apres analyse
3. DB_SYNCHRONIZE JAMAIS true en production
4. UFR-022 : fresh-context si invoque depuis /team, consulter lib-docs typeorm si touche.

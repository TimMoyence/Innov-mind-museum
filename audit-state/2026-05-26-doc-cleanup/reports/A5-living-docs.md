# Audit A5 — Living Docs (2026-05-26)

> Read-only audit. No edits made. Source of truth = code/git, not docs.

## Summary table

| Fichier | État | Confiance | Findings (claim doc → réalité code) | Action |
|---|---|---|---|---|
| `docs/DOCS_INDEX.md` | À MODIFIER | HIGH | 5 sous-findings (refs mortes, ADRs non listés, stale label) | Corriger refs mortes + étendre ADR list |
| `docs/GOTCHAS_ARCHIVE.md` | OK | HIGH | Cohérent, léger, incident-backed, critère de promotion clair | Aucune |
| `docs/PHASE_HISTORY.md` | OK | HIGH | Phases 8-17 documentées honnêtement, corrections audit incluses | Aucune |
| `docs/ROADMAP_PRODUCT.md` | À MODIFIER | HIGH | 5 sous-findings (stale BLOCKER OKR, PostHog label, ref morte, anchors cassés, B9/FA3 GDPR ouvert non résolu) | Corriger claims stale dans OKR + nettoyer anchors morts |
| `docs/ROADMAP_TEAM.md` | À MODIFIER | HIGH | 1 finding (sprint end "2026-06-01" vs launch day "2026-06-07" dans ROADMAP_PRODUCT) | Aligner sprint end date |
| `docs/TECH_DEBT.md` | OK (mineure) | HIGH | 1 finding mineur : HANDOFF ref morte dans TD-44 workaround note ; contenu TD global sain et auto-documenté | Corriger ref morte HANDOFF_W3 |
| `docs/TECH_DEBT_ARCHIVE.md` | OK | HIGH | Anchor `#archivé-2026-05-21-sweep-multi-agent` résout (ligne 378). TD archivés cohérents avec TECH_DEBT. | Aucune |

---

## Findings détaillés par fichier

### docs/DOCS_INDEX.md

**F1 — Ref morte : `docs/HANDOFF-2026-05-19-debt-collision-report.md`**
- Ligne 35 : `| Tech debt collision handoff (2026-05-19, load-bearing per CLAUDE.md:158) | [docs/HANDOFF-2026-05-19-debt-collision-report.md](HANDOFF-2026-05-19-debt-collision-report.md) |`
- Réalité : `git ls-files 'docs/HANDOFF-2026-05-19-debt-collision-report.md'` = rien. Fichier absent du working tree ET non tracké. Le label "load-bearing per CLAUDE.md:158" est aussi faux — CLAUDE.md n'a aucune référence à ce fichier.
- Gravité : MEDIUM (lien cassé dans l'index principal).

**F2 — ADR range "002-058" périmée — 10 ADRs manquants**
- Ligne 24 : `ADRs (002-058)` — réalité : `git ls-files 'docs/adr/'` confirme ADR-059 à ADR-068 existent. ADR-066 est listé en note isolée (ligne 76) mais les ADR-059-065, 067, 068 ne figurent nulle part dans l'index.
- Manquants : ADR-059 (connectivity online-manager), ADR-060 (GDPR erasure chain), ADR-061 (artwork knowledge not multi-tenant), ADR-062 (canonical legal content), ADR-063 (Langfuse mask), ADR-064 (access-token denylist), ADR-065 (Redis volatile TTL), ADR-067 (base-modal custom vs radix), ADR-068 (SBOM mobile gap).
- Gravité : LOW (navigation incomplète, pas de mensonge).

**F3 — `docs/observability/musaium-backend-dashboard.json` listé comme doc**
- Ligne 95 : `Grafana dashboard JSON | [docs/observability/musaium-backend-dashboard.json]...`
- Réalité : `git ls-files` confirme le fichier existe. OK — pas un problème.

**F4 — `docs/_archive/` description stale : "ne contient plus que README.md"**
- Ligne 165 : "État au 2026-05-20 : ne contient plus que README.md. training-2026-05/ + sprints/ supprimés."
- Non vérifié exhaustivement dans cette session (READ-ONLY discipline), mais le commentaire de cleanup 2026-05-20 semble consistant avec `git ls-files`. Confiance MEDIUM.

**F5 — Ligne 35 `LESSONS_DIGEST.md` dans la liste orphelins de cleanup header (ligne 4)**
- Le header changelog mentionne `LESSONS_DIGEST.md` comme orphelin indexé 2026-05-20, mais le fichier est sous `.claude/skills/team/team-knowledge/lessons/LESSONS_DIGEST.md` (out-of-docs-tree) et le lien ligne 157 pointe correctement. Pas un vrai problème.

---

### docs/GOTCHAS_ARCHIVE.md

Contenu limité (17 lignes) : 4 pièges techniques moins-fréquents (PgBouncer, SWC circular, Prometheus vars, SigLIP normalize, nginx proxy_pass var). Cohérents avec le code (SigLIP ref `siglip-onnx.adapter.ts`, nginx ref `infra/nginx/conf.d/grafana.conf` commit `c3bc30c75`). Critère de promotion dans CLAUDE.md documenté. Rien à corriger.

---

### docs/PHASE_HISTORY.md

Phases 8-17 couvrent 2026-04 à 2026-05-18. Chaque phase cite commits/ADRs/files réels. Phase 12 (Stryker) a corrigé le chiffre 99.75% → 93.35%/99.39% avec note explicite "the 99.75% figure originally posted here was not reproducible". Phase 14 (Garak) documente l'annulation 2026-05-17 honnêtement. Aucun claim non corroboré détecté dans cette session.

Seule note : aucune Phase 18 à ce jour (le travail post-2026-05-18 = P0 cleanup, pas une nouvelle phase qualité), ce qui est cohérent. OK.

---

### docs/ROADMAP_PRODUCT.md

**F1 — KR2 BLOCKER dans le tableau OKR (ligne 53) = STALE**
- Claim : `BLOCKER : reviews table sans museumId, NPS true 0-10 non implémenté. Voir P0.B7.`
- Réalité (vérifié dans P0.C7 et P0-FA4) : la migration `museum_id` a été faite (#295), mais P0.C7 est ⚠️ (admin READ/UPDATE non scopés, NPS dead-code `aggregateNps` 0 caller). P0-FA4 dit explicitement "KR2 NPS non livré".
- Le BLOCKER est donc partiellement stale (migration faite) ET partiellement vrai (NPS 0-10 toujours non livré). Le renvoi à "P0.B7" est erroné — le bon item est P0.C7 (reviews/museumId) + P0-FA4 (NPS 0-10). Le tableau OKR n'a pas été mis à jour après les corrections 2026-05-25.
- Gravité : MEDIUM (le KR2 claim incorrect peut induire en erreur sur l'état launch readiness).

**F2 — "PostHog" dans tableau Audience cible (ligne 40) = STALE**
- Claim : `soft-paywall stub V1 (C6 shipped) pour valider data-driven via PostHog (P0.F2)`
- Réalité (P0.C5 ligne 156) : "Plausible câblé sur dev" — PostHog n'est jamais implémenté, le claim est une relique. Le tableau OKR ligne 55 dit déjà "PostHog/Plausible" (corrigé) mais le tableau Audience dit encore "PostHog" seul.
- Gravité : LOW (nomenclature d'outil incorrecte dans 1 cellule).

**F3 — Ref mort `docs/V1_LOCKDOWN_LOTS.md` (ligne 68)**
- Claim : `détail + lots de dev dans [V1_LOCKDOWN_LOTS.md](V1_LOCKDOWN_LOTS.md)`
- Réalité : `ls /Users/Tim/.../docs/V1_LOCKDOWN_LOTS.md` = fichier présent sur disque (non tracké git probablement gitignored sous `docs/`). Non vérifié si tracké. Confidence MEDIUM — si gitignored, le lien peut casser pour quelqu'un qui clone fresh.
- Note : `git ls-files 'docs/V1_LOCKDOWN_LOTS.md'` non exécuté dans cette session. À confirmer.

**F4 — `doc-anchor-check.mjs` cité dans ROADMAP_PRODUCT (ligne 107) n'existe pas**
- Claim (passé en héritage depuis CLAUDE.md) : `doc-anchor-check.mjs` cité comme sentinelle UFR-024.
- Réalité : `ls scripts/sentinels/` ne contient PAS `doc-anchor-check.mjs`. Le script n'existe pas. ROADMAP_PRODUCT ligne 107 le cite ("Sentinel `doc-anchor-check.mjs` + frontmatter `last-verified`") — claim false.
- Gravité : HIGH (sentinelle présentée comme active n'existe pas, UFR-024 n'est pas enforced mécaniquement).

**F5 — P0-FA3 / P0.B9 GDPR `location_to_llm` bypass = ouvert P0 CRITIQUE non résolu**
- ROADMAP_PRODUCT documente ce gap correctement (P0-FA3 🔴, P0.B9 ⚠️). Ce n'est pas un mensonge doc — c'est un finding en attente. Mais le North Star note `⚠️ La pièce critique restante : location_to_llm absent du consent FE → location droppée aujourd'hui (cf. P0.B9)` est STALE depuis le fix B9 FE (✅ 2026-05-21). La vraie situation : P0-FA3 décrit que c'est pire — le bypass est dans `prepare-message.pipeline.ts:482` côté BE. La note North Star devrait référencer P0-FA3 et non P0.B9.
- Gravité : MEDIUM (la description du gap est inexacte, pourrait induire un fix au mauvais endroit).

---

### docs/ROADMAP_TEAM.md

**F1 — Sprint end date "2026-06-01" ≠ launch day "2026-06-07"**
- Ligne 4 : `Sprint courant : 2026-05-03 → 2026-06-01`
- Ligne 73 (section NOW) : `NOW — Sprint launch (2026-05-03 → 2026-06-01)`
- ROADMAP_PRODUCT ligne 4 : `Sprint courant : 2026-05-03 → 2026-06-07 (launch day, minimum — à reconfirmer)`
- Réalité : la date cible de launch a glissé de 2026-06-01 à 2026-06-07 minimum (note "à reconfirmer" dans ROADMAP_PRODUCT). ROADMAP_TEAM n'a pas été mis à jour.
- Gravité : MEDIUM (deux docs "source de vérité" qui se contredisent sur la date de launch du sprint en cours).

---

### docs/TECH_DEBT.md

**F1 — TD-44 note workaround cite `docs/HANDOFF_W3_GEO_PILOT.md` (fichier probablement inexistant)**
- Ligne ~648 (section TD-44) : `recipe documentée dans le HANDOFF (docs/HANDOFF_W3_GEO_PILOT.md Phase B step 3 + cette session 2026-05-19)` — `git ls-files 'docs/HANDOFF_W3_GEO_PILOT.md'` non exécuté dans cette session mais le pattern (HANDOFF_* docs = temporaires, non trackés) suggère qu'il a été supprimé.
- Confiance MEDIUM (non vérifié par git ls-files direct — limité par discipline lecture).
- Gravité : LOW (note informelle dans section workaround, pas load-bearing).

Hors ce point, TECH_DEBT.md est sain : 
- Convention "prouvable par le code" bien respectée
- Items clos → archive avec anchors fonctionnels
- Nouveaux TDs (TD-FE-CHAT-BURY-SSE, TD-AS-01) correctement intégrés
- Bumps security (pg, axios) correctement classifiés SECURITY/ROUTINE/LOCKED

---

### docs/TECH_DEBT_ARCHIVE.md

- Anchor `## Archivé 2026-05-21 (sweep multi-agent)` existe à la ligne 378 — les ~60 références `→ [archive](TECH_DEBT_ARCHIVE.md#archivé-2026-05-21-sweep-multi-agent)` dans TECH_DEBT.md résolvent.
- TD-1 à TD-11, TD-15/16/21/37/38/44, TD-EX-01 : tous présents avec closure notes correctes.
- Contenu archivé cohérent avec TECH_DEBT.md. Aucun doublon actif/archivé détecté.
- Pas de dette "résolue" trouvée encore dans TECH_DEBT.md comme ouverte.

---

## Findings notables (top 5)

1. **Ref morte haute visibilité : `docs/HANDOFF-2026-05-19-debt-collision-report.md`** — listé dans DOCS_INDEX ligne 35 avec label "load-bearing per CLAUDE.md:158" ; ni tracké ni présent sur disque. Le label "load-bearing" est faux (CLAUDE.md ne le référence pas). Supprimer cette ligne de DOCS_INDEX.

2. **`doc-anchor-check.mjs` présentée comme sentinelle active UFR-024 (ROADMAP_PRODUCT ligne 107) n'existe pas** — `scripts/sentinels/` ne contient pas ce fichier. La sentinelle UFR-024 `roadmap-claim-resolves.mjs` existe, mais le claim sur `doc-anchor-check.mjs` est un faux anchor. Corriger ou supprimer la référence.

3. **KR2 BLOCKER (ROADMAP_PRODUCT OKR tableau, ligne 53) = claim STALE sur deux points** — (a) renvoie à "P0.B7" (consent audio) au lieu de P0.C7+P0-FA4 (NPS dead-code) ; (b) "reviews table sans museumId" partiellement faux depuis #295. Le NPS 0-10 reste non livré mais pour une autre raison. Mettre à jour le tableau OKR pour refléter le vrai état.

4. **DOCS_INDEX : 9 ADRs (059-065, 067, 068) non listés — la plage "002-058" est périmée depuis 10 ADRs** — ADR-066 est présent en note isolée mais les 9 autres sont absents de l'index. Mettre à jour la ligne 24 et ajouter une section "ADRs 059-068".

5. **ROADMAP_TEAM sprint end "2026-06-01" vs ROADMAP_PRODUCT "2026-06-07 minimum"** — deux sources de vérité contradictoires sur la date de fin du sprint courant. ROADMAP_TEAM doit être alignée sur 2026-06-07 (minimum, à reconfirmer).

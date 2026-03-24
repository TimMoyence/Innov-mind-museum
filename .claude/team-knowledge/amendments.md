# Log des Auto-Amendements

| Date | Run | Type | Fichier | Description | Statut | Runs monitores | Resultat |
|------|-----|------|---------|-------------|--------|----------------|----------|
| 2026-03-24 | R3 | MINOR | (process) | Multiplier estimations fichiers par 1.3x (biais sous-estimation detecte sur 3 runs) | EN OBSERVATION | R4, R5 | — |

## Amendements en observation

### AM-001 : Correction biais estimation fichiers
- **Type** : MINOR
- **Date** : 2026-03-24
- **Raison** : 3 runs consecutifs avec sous-estimation de 22-29% du nombre de fichiers reels
- **Evidence** : R1 (15→17, -12%), R2 (12→17, -29%), R3 (29→37, -22%)
- **Changement** : appliquer un facteur 1.3x sur les estimations de fichiers dans le plan
- **Risque** : surcharge du plan (fichiers non necessaires inclus) — faible
- **Monitoring** : R4, R5. Si precision > 85% → CONFIRME. Sinon → AUTO-REVERT

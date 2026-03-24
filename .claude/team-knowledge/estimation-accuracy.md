# Precision des Estimations

| Run | Date | Mode | Estimation | Boucles reelles | Fichiers estimes | Fichiers reels | Precision |
|-----|------|------|------------|-----------------|------------------|----------------|-----------|
| R1 | 2026-03-24 | refactor (audit) | L | 0 | 15 | 17 | 88% |
| R2 | 2026-03-24 | refactor (Phase 0+1) | S | 0 | 12 | 17 | 71% |
| R3 | 2026-03-24 | refactor (V1.1) | L | 0 | 29 | 37 | 78% |

## Calibration

- S (Small) : reference = 0 boucle, 1-3 fichiers
- M (Medium) : reference = 0-1 boucle, 4-10 fichiers
- L (Large) : reference = 1-2 boucles, 10+ fichiers

## Tendances

- Precision moyenne : 79%
- Biais : sous-estimation systematique du nombre de fichiers (~25% de plus que prevu)
- Boucles : 0 sur 3 runs — les estimations de boucles sont correctes
- **Ajustement recommande** : multiplier les estimations de fichiers par 1.3x pour les prochains runs

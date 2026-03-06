# Background Assets (Mobile + Desktop)

This folder stores dedicated background images for each viewport profile.

## Paths
- `mobile/` -> portrait backgrounds for phones/tablets
- `desktop/` -> landscape backgrounds for web/desktop

## Naming convention
Keep the same file names across mobile and desktop:
- `museum-child.png`
- `museum-girl.png`
- `museum-men.png`
- `museum-old-men.png`
- `museum-old-women.png`

## Export specs
See `IMAGE_SPECS.json` for target sizes/ratios.

## Replacement workflow
1. Re-export images with the exact same filenames.
2. Replace files in `mobile/` and `desktop/`.
3. Run `npm run lint` from `museum-frontend`.

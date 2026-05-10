# Maestro fixtures

Binary assets uploaded to the test device by CI immediately before running a Maestro flow.

## `test-artwork.jpg`

- **Subject**: Mona Lisa, Leonardo da Vinci.
- **Source**: Wikimedia Commons — `https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg` (220px thumbnail).
- **License**: Public Domain (Leonardo da Vinci, d. 1519).
- **Used by**: `chat-compare.yaml` (T8.8 — C3 Image Comparative).
- **Why this artwork**: Wikidata Q12418, present in `artwork_embeddings` for any catalogue ingest seeded from the Louvre or default museum set; near-guaranteed to return at least one match against the SigLIP-encoded V1 catalogue.

CI upload steps live in `.github/workflows/ci-cd-mobile.yml` (`maestro-shard` and `maestro-ios-nightly` jobs).

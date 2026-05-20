# expo-asset — LESSONS (project gotchas)

## 2026-05-20
- **Transitive only.** No direct `import ... from 'expo-asset'` in `museum-frontend`
  as of 2026-05-21. Asset resolution happens through `expo-image` + the Metro
  bundler. Reach for `Asset.loadAsync` only for an explicit boot warmup.
- **`localUri` is null until downloaded.** Always coalesce `asset.localUri ?? asset.uri`
  before handing to a consumer; a fresh `fromModule` instance has `localUri === null`.
- **Cache is not durable.** `downloadAsync` writes to OS cache; upstream warns files
  may not persist between sessions. Never treat as storage. Config-plugin–embedded
  assets are durable, cache-downloaded ones are not.
- **`require()` must be a literal.** Metro bundles only statically-visible
  `require('./x.png')`. A computed path is not bundled — same constraint as the
  project's PNG-as-`ImageSourcePropType` rule (CLAUDE.md).
- **No `expo-asset` config plugin configured.** If you add `["expo-asset", {assets:[...]}]`,
  remember embedded assets ship in the binary (size cost) but skip first-run fetch.

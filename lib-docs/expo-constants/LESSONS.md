# expo-constants — LESSONS (project gotchas)

## 2026-05-20
- **`Constants.expoConfig.extra` is THE build-time→runtime config bridge.**
  `app.config.ts` populates `extra: {...}`; read it via the centralized
  `readExtra()` in `shared/infrastructure/apiConfig.ts:46-48` (`?? {}` guard), then
  narrow each field with `readEnvString` (project's non-autofixable `typeof`
  predicate). Never scatter raw `Constants.expoConfig.extra.FOO` reads.
- **Always optional-chain the whole path.** `Constants.expoConfig` can be `null`
  and `extra` can be missing. `queryClient.ts:15-18` shows the canonical 3-tier
  fallback: `expoConfig?.version ?? expoConfig?.extra?.APP_VERSION ?? 'dev'`.
- **`Constants.manifest` is DEPRECATED** (de-emphasized in v55). All Musaium code
  already uses `expoConfig` — add NO new `manifest` reads.
- **`appOwnership` is DEPRECATED → use `executionEnvironment`** (`Bare` /
  `Standalone` / `StoreClient`). Note: most Musaium dev/prod branching uses
  `APP_VARIANT`/`EAS_BUILD_PROFILE` from `extra`, which is also fine.
- **`nativeAppVersion` / `nativeBuildVersion` MOVED to `expo-application` in v55** —
  they are no longer on `Constants`. Use `expoConfig?.version` for the JS-config
  version (what Musaium uses); reach for `expo-application` for the native binary version.
- **Test mocks must mirror the real shape** (`{ expoConfig: { extra: {...} } }`) so
  the `?? {}` guard path is actually exercised.

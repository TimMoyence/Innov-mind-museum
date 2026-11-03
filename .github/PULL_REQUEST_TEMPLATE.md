## Description

## Test plan

- [ ] `pnpm lint` + `pnpm test` (backend, web) — `npm run lint` + `npm test` (mobile)
- [ ] Migration : `pnpm migration:run` puis `node scripts/migration-cli.cjs generate --name=Check` sans changement
- [ ] OpenAPI : `pnpm openapi:validate` + `npm run check:openapi-types`
- [ ] Écran modifié : un flow `museum-frontend/.maestro/*.yaml` parcourt son chemin critique
- [ ] Hooks joués sans contournement

# R16 — Next.js 15 / 16 + React 19 / 20 Landscape (May 2026)

**Auditor:** R16 (research agent)
**Audit scope:** Musaium web (`museum-web/`) — Next 15.5.18 + React 19.2.0
**Date:** 2026-05-12
**Sources cited:** nextjs.org/docs (official), react.dev (official), vercel.com (security release), GitHub advisories, plus 4–5 community deep-dive blogs for benchmarks/migration effort. UFR-013 — every "verified" claim below traces to a cited source.

---

## TL;DR (90 seconds)

1. **Musaium IS on the May-2026 security floor.** Next 15.5.18 is the patched minor for the 13-CVE coordinated disclosure of May 6–7, 2026 (other patched line: 16.2.6). No urgent CVE action required as of today (2026-05-12). [vercel-may-2026](https://vercel.com/changelog/next-js-may-2026-security-release), [netlify-may-2026](https://www.netlify.com/changelog/2026-05-08-react-nextjs-security-vulnerabilities/)

2. **Next.js 16 is GA since 2025-10-22; current stable is 16.2.6 (May 2026).** Next 15 is on a maintenance track. The upgrade path is real but non-trivial: `middleware.ts → proxy.ts` (Edge runtime NOT supported in proxy), async `params/cookies/headers/draftMode` is now mandatory (no sync fallback), every parallel-route slot needs an explicit `default.js`, AMP and `next lint` are deleted. Most changes have a Vercel codemod. [next-16-blog](https://nextjs.org/blog/next-16), [next-16-upgrade](https://nextjs.org/docs/app/guides/upgrading/version-16)

3. **React Compiler 1.0 is stable (released 2025-10-07).** Validated production gains: Meta Quest Store +12% initial load / 2.5× faster interactions, Sanity Studio 20–30% rendering improvement, Wakelet 10% LCP / 15% INP (up to 30% on pure-React routes). Memory neutral. Build cost is real (Babel-based plugin). Next.js exposes a `reactCompiler: true` flag — *not* on by default. [react-compiler-1.0](https://react.dev/blog/2025/10/07/react-compiler-1), [react-compiler-adoption](https://react.dev/learn/react-compiler/incremental-adoption), [meta-infoq](https://www.infoq.com/news/2025/12/react-compiler-meta/)

4. **Turbopack is the default bundler in Next 16 (both dev + build).** 2–5× faster builds, up to 10× faster Fast Refresh vs Webpack. Already battle-tested: >50% of dev sessions and >20% of production builds on 15.3+ were running Turbopack before the default flip. [next-16-blog](https://nextjs.org/blog/next-16), [turbopack-stable-jan-2026](https://medium.com/@shahzaibnawaz/turbopack-is-finally-stable-5-real-world-benchmarks-vs-webpack-3469c4dcce59)

5. **PPR shipped as "Cache Components" in Next 16** with the `cacheComponents: true` flag and the `"use cache"` / `"use cache: remote"` / `"use cache: private"` directives. The old `experimental.ppr` flag is *removed* (not just deprecated). New caching APIs: `revalidateTag(tag, profile)` requires a `cacheLife` profile, `updateTag(tag)` (read-your-writes in actions), `refresh()` for uncached data. [cache-components-blog](https://nextjs.org/blog/next-16#cache-components), [use-cache-directive](https://nextjs.org/docs/app/api-reference/directives/use-cache)

6. **React 20: no release date.** Online "React 20" posts in 2025–2026 are speculative; React's official versions page lists 19.2 (2025-10-01) as the current line. Compiler + RSC + 19.2 features (View Transitions, `useEffectEvent`, `<Activity>`) are the headline items, not a 20.x bump. Treat any "React 20" claim from non-react.dev sources as unverified. [react-versions](https://react.dev/versions), [react-19-2](https://react.dev/blog/2025/10/01/react-19-2)

7. **Verdict for Musaium:**
   - **Stay on Next 15.5.18 through V1 launch (2026-06-01)**, then schedule Next 16 migration in the first post-launch sprint. Rationale below.
   - **Adopt the React Compiler ESLint preset NOW** (zero cost, eliminates a class of bugs). Enable the compiler itself only after lint is green and post-launch.
   - **Don't enable Cache Components / `"use cache"` pre-launch** — too new, programming-model change, no need.
   - **Adopt `useActionState` + `useOptimistic` opportunistically** on `ContactForm.tsx` and `ResetPasswordForm.tsx`. These are the only forms with non-trivial pending states. No need for `use()` hook yet (no async data fetched directly in client components).

---

## 1. Next.js 15.5 — what's already shipped, what to know

Next 15.5 is the **terminal release** of the 15.x line. Key features (carried across 15.2 → 15.5):

| Feature | Status in 15.5 | Notes for Musaium |
|---|---|---|
| Node.js middleware runtime | Stable (vs Edge-only in 15.1) | Musaium's `src/middleware.ts` uses Edge — fine, but document choice |
| Turbopack production builds | Beta | Default in 16 |
| Async `params`, `cookies()`, `headers()`, `draftMode()` | Stable, sync access still works **with deprecation warning** | Already adopted in Musaium per CLAUDE.md |
| `next typegen` (auto-generated `PageProps<>`) | Available since 15.5 | Recommended to adopt before 16 migration |
| Deprecation warnings for Next 16 | Active | Heed them — `next lint`, `legacyBehavior` on `next/link`, `images.domains` → `remotePatterns` |
| `images.domains` deprecated | Yes — use `remotePatterns` | Check Musaium's current image config |

[next-15-5-blog](https://nextjs.org/blog/next-15-5)

**May 2026 security release** (CVE-2026-23869 + 12 others, GHSA-q4gf-8mx6-v5v3): patched in **15.5.18** and **16.2.6**. Categories: DoS via Server Component deserialization, middleware/proxy bypass, SSRF, cache poisoning, XSS. **Musaium = 15.5.18 = clean.** [vercel-may-2026](https://vercel.com/changelog/next-js-may-2026-security-release), [cve-2026-23869](https://vercel.com/changelog/summary-of-cve-2026-23869)

---

## 2. Next.js 16 — released Oct 2025, current is 16.2.6 (May 2026)

GA: **2025-10-22**. Current line: **16.2.6** (May 2026 security patch). Minor 16.2 (March 2026) brought ~400% faster `next dev` startup, ~50% faster rendering, Agent DevTools (MCP), AGENTS.md template in `create-next-app`. [next-16-2](https://nextjs.org/blog/next-16-2), [versionlog-16](https://versionlog.com/nextjs/16/)

### 2.1 Breaking changes inventory

Source of truth: [next-16-upgrade](https://nextjs.org/docs/app/guides/upgrading/version-16) (fetched 2026-05-12).

| Change | Codemod? | Musaium impact |
|---|---|---|
| **Async `params`/`cookies`/`headers`/`draftMode`** — sync access fully removed | Yes (`migrate-to-async-dynamic-apis`) | Low — Musaium already does `await params`/`headers()` per CLAUDE.md |
| **`middleware.ts` → `proxy.ts`** — file + named export rename; Edge runtime **not supported** in proxy | Yes (in `upgrade` codemod) | **Medium-high** — Musaium runs CSP-nonce middleware. Renaming forces Node.js runtime, which adds cold-start latency at the edge. If CSP nonce needs to stay Edge: keep `middleware.ts` (still supported for Edge use cases, but deprecated) and wait for Vercel's follow-up minor with Edge instructions. |
| **Parallel routes — every slot needs `default.js`** | No (manual) | None — Musaium doesn't use `@slot` parallel routes (verified `find src/app -name '@*' -type d` empty) |
| **AMP removal** | N/A | None — Musaium has no AMP |
| **`next lint` removal** | Yes (`next-lint-to-eslint-cli`) | Low — `package.json` already calls `eslint src/` directly |
| **`serverRuntimeConfig` / `publicRuntimeConfig` removed** | No (manual) | None — Musaium uses `NEXT_PUBLIC_*` and direct `process.env` |
| **`images.domains` deprecated** → `remotePatterns` | Manual | Check current `next.config.ts` — uses `formats: ['avif','webp']` only, no domains array |
| **`images.minimumCacheTTL` default 60s → 14400s (4h)** | N/A (behavior change) | Need to verify Musaium's image-revalidation expectations |
| **`images.qualities` default `[1..100]` → `[75]`** | N/A | Likely fine — set explicitly if other qualities needed |
| **`images.dangerouslyAllowLocalIP: false` default** | N/A | None — prod uses CDN-fronted images |
| **`images.localPatterns.search` required for query-string local images** | N/A | Audit `<Image src="/x?v=1" />` callsites |
| **`revalidateTag(tag)` → `revalidateTag(tag, profile)` mandatory** | No (manual) | Musaium has not adopted `revalidateTag` yet (no callsites found) |
| **`unstable_cacheLife` / `unstable_cacheTag` → stable** | Yes (`upgrade`) | N/A — not used |
| **`scroll-behavior: smooth` no longer auto-overridden** | N/A | Audit landing CSS — Framer Motion handles most scroll |
| **Node 20.9+ minimum; Node 18 dropped** | N/A | Musaium = Node 22, already compliant |
| **TS 5.1+ minimum** | N/A | Musaium = TS 5.x, compliant |
| **`@next/eslint-plugin-next` → Flat Config default** | Manual ESLint migration | Musaium already on Flat Config (`@eslint/js ^9.39.4`) |

### 2.2 Real-world migration cost

A monorepo case study reports **240+ files changed** for a Next 14 → 16 jump and "transformative" build-speed gain (57s → 14s, 4× faster). Most teams report **smooth automated migration** for greenfield 15.x → 16, with manual cleanup needed for: parallel routes, custom Webpack plugins, and Edge-runtime middleware that must stay on Edge (don't rename to `proxy.ts`). [monorepo-migration](https://dev.to/abhilashlr/migrating-a-large-scale-monorepo-from-nextjs-14-to-16-a-real-world-journey-5383), [migration-playbook](https://medium.com/@mernstackdevbykevin/next-js-15-to-16-your-complete-migration-playbook-6a7631e6cc3d)

### 2.3 New Next 16 capabilities (beyond breaking changes)

- **Cache Components** (`cacheComponents: true`) — opt-in caching model around `"use cache"` directive. Default behavior: all dynamic code executes at request time (no implicit cache). Replaces both `experimental.ppr` and `experimental.dynamicIO`. [cache-components](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
- **`"use cache"` directive** — three flavors: default (in-memory LRU), `"use cache: remote"` (durable shared cache, e.g. Redis), `"use cache: private"` (per-user). Pairs with `cacheLife()`. [use-cache](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- **`updateTag()` (Server Actions only)** — read-your-writes (user sees fresh data same-request). Use for forms.
- **`refresh()`** — refresh client router from a Server Action (complementary to `router.refresh()` client-side).
- **Layout deduplication + incremental prefetching** — automatic, no code change. Trade-off: more requests, less total transfer.
- **React Compiler integration** — `reactCompiler: true` config option, stable but not default.
- **Build Adapters API** (alpha → stable in 16.2) — custom build-step hooks.
- **Next.js DevTools MCP** — MCP integration for AI agents. Vercel's pitch: `npx next-devtools-mcp@latest` exposes the route table, logs, error stacks to your AI agent.
- **React 19.2 features**: View Transitions, `useEffectEvent`, `<Activity>` component (background-mode rendering with state preserved).

[next-16-blog](https://nextjs.org/blog/next-16)

---

## 3. React 19 — full feature inventory (stable since 2024-12-05)

[react-19-blog](https://react.dev/blog/2024/12/05/react-19), [react-19-2-blog](https://react.dev/blog/2025/10/01/react-19-2)

### 3.1 Feature adoption matrix for Musaium

| Feature | What it does | Musaium adoption status | Recommended action |
|---|---|---|---|
| **Server Components** | Render-only on server, zero JS shipped | Already used (admin pages are server by default) | Maintain — push `"use client"` boundary as leaf as possible |
| **Server Actions** (`"use server"`) | Form mutation = server function | **Not used** — Musaium uses fetch to backend Express API | Skip for V1. Backend is Express/TypeORM (separate process), Server Actions add an indirection layer. Reconsider only if web-only mutations appear. |
| **`useActionState(action, initialState)`** | Single hook = state + dispatch + isPending | **Not used** | **Adopt opportunistically** on `ContactForm.tsx`, `ResetPasswordForm.tsx`, `EmailTokenFlow.tsx`, `LoginForm.tsx`. Removes manual `useState(loading, error, data)` triplets. Works *without* Server Actions — pass a `(prev, formData) => fetch(...)` async function. |
| **`useFormStatus()`** | `{ pending, data, method, action }` from nearest `<form>` | **Not used** | Adopt for submit buttons inside the above forms. Eliminates prop drilling of `isSubmitting`. |
| **`useOptimistic(state, update)`** | Optimistic UI state | **Not used** | Low priority for V1 — admin tables don't need instant feedback. Reconsider for review-approval UX post-launch. |
| **`use(promise)` hook** | Read a Promise/Context inside render (Suspense-aware) | **Not used** | Skip — Musaium client components don't fetch promises in render. Server components use plain `await`. Adopting `use()` requires creating Promises in stable scope (server, loaders, or `useMemo`) — easy to get wrong. |
| **`use(context)` hook** | Conditional context access | Not used | N/A — `useContext` still works, no urgency |
| **Async `ref` + `ref` as a prop** | Cleanup-aware refs, no forwardRef ceremony | TBD | Adopt as new components are written |
| **`<form action>` with async functions** | Native async form actions | Indirect (Musaium uses RHF + fetch) | Not urgent |
| **Document metadata in components** | `<title>`, `<meta>` rendered anywhere hoist to `<head>` | Replaced by App Router `metadata` export | N/A |
| **Asset preloading (`preload`, `preinit`)** | Programmatic preload from React | TBD | Worth considering for landing hero |
| **React 19.2: View Transitions** | `<ViewTransition>` wrapper for navigation animations | Not used | Pair with Framer Motion already in use — evaluate post-launch |
| **React 19.2: `useEffectEvent`** | Non-reactive logic in Effects without re-running | Not used | Adopt where Musaium currently has `eslint-disable react-hooks/exhaustive-deps` |
| **React 19.2: `<Activity>`** | Hidden-but-stateful subtrees | Not used | Useful for off-screen admin panels — defer |

[react-19-hooks-guide](https://www.freecodecamp.org/news/react-19-new-hooks-explained-with-examples/), [use-hook-deep-dive](https://dev.to/pockit_tools/react-19-use-hook-deep-dive-the-game-changer-for-data-fetching-53fi), [useActionState-vs-useState](https://medium.com/@shubham150770/introducing-useactionstate-in-react-19-a-comparison-with-usestate-6cd24f78f494)

### 3.2 The "3-useState collapse" pattern (most concrete win)

Pre-React-19 admin form pattern (still in Musaium):
```tsx
const [pending, setPending] = useState(false);
const [error, setError] = useState<string | null>(null);
const [data, setData] = useState<Result | null>(null);
// + manual try/catch/finally in handler
```

React-19 equivalent:
```tsx
const [state, formAction, isPending] = useActionState(
  async (prev, formData) => {
    const r = await fetch('/api/admin/login', { method: 'POST', body: formData });
    if (!r.ok) return { error: await r.text() };
    return { data: await r.json() };
  },
  { error: null, data: null }
);
```

Wins: (a) automatic race-condition handling, (b) one source of truth for state, (c) compatible with Suspense.

---

## 4. React 20 — verdict: not a real thing in 2026

[react-versions](https://react.dev/versions) (official) lists the current line as **19.2.0 (October 1, 2025)**. The React team did not announce a 20.x roadmap as of 2026-05.

Community speculation pieces ("React 20 is coming", "React 20: Features, Improvements") date from mid-2025 and are forward-looking opinion — none cite a react.dev source.

**Read of the room:** the React team's bandwidth in 2025–2026 went into Compiler 1.0 + 19.2 incremental features (View Transitions, `<Activity>`, `useEffectEvent`, SSR batching, `cacheSignal`). A 20.x bump would likely require a major API break — no candidate visible. **Plan as if React 19.x is the line through end-2026.**

---

## 5. React Compiler 1.0 — production-ready (released 2025-10-07)

[react-compiler-1.0](https://react.dev/blog/2025/10/07/react-compiler-1)

### Performance ground truth (cited)

| Case study | Gain |
|---|---|
| Meta Quest Store (production) | +12% initial load, 2.5× faster interactions |
| Sanity Studio | 20–30% better rendering |
| Wakelet | 10% LCP, 15% INP (up to 30% on pure-React routes) |
| Memory | Neutral (no regression) |

[meta-infoq](https://www.infoq.com/news/2025/12/react-compiler-meta/), [pockit-deep-dive](https://pockit.tools/blog/react-compiler-automatic-memoization-performance-guide/)

### Adoption tactics (incremental)

1. **`eslint-plugin-react-hooks@^7` Recommended preset** — compiler-aware rules (`set-state-in-render`, `set-state-in-effect`, refs). No compiler install required. **Adopt first** — surfaces Rules-of-React violations that would break with the compiler. Musaium is already on `eslint-plugin-react-hooks ^7.1.1`. [react-compiler-adoption](https://react.dev/learn/react-compiler/incremental-adoption)
2. **Per-directory Babel overrides** — opt in `src/components/marketing/` first.
3. **`"use memo"` per-component opt-in** — finest grain.
4. **Runtime gating with feature flags** — A/B production rollout.
5. **Pin exact version** (`1.0.0`, not `^1.0.0`) if test coverage is thin — future compiler versions may change memoization strategies.

### Build cost overhead

- Next 16 currently relies on **Babel** for the compiler plugin (Next team is gathering data before defaulting it on). Expect dev + build slowdown vs default Rust/SWC. [next-16-react-compiler](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler)
- Next 15.3+ has experimental SWC fast-path. Watch for full SWC integration before flipping on by default.

### Compiler edge cases worth flagging

- Rules-of-React violations the linter cannot detect (e.g. dynamic mutation patterns) **silently produce wrong results**. Run profiler-based checks post-enable.
- `useMemo`/`useCallback` still work and override compiler decisions where needed.

---

## 6. App Router patterns 2026 — server vs client ratio

[server-and-client](https://nextjs.org/docs/app/getting-started/server-and-client-components), [rsc-2026-guide](https://www.growin.com/blog/react-server-components/)

### Canon

- **Start with Server Components.** Add `"use client"` only at the leaf when interactivity, state, effects, or browser APIs are needed.
- **Pass Client Components as children** to Server Components. This keeps data fetching on the server while letting an island be interactive.
- **Each independent data dependency → own `<Suspense>` boundary** with dimension-matched skeleton.
- **Parallel `await` via `Promise.all`** at the Server Component top — never sequential awaits.

### Anti-patterns

- **Recreating client waterfalls on the server** — naive `await db.x(); await db.y();` is sequential. Use `Promise.all`.
- **Pushing `"use client"` too high** — entire subtree leaves the server bundle.
- **`use()` inside the render body of the component where the Promise is created** — Promise is re-created every render → infinite suspension loop.

### Musaium today

- Pages under `src/app/[locale]/admin/*` mix server (page shells) and client (`LoginForm`, `MfaForm`, table rows). Reasonable.
- Few `<Suspense>` boundaries — could be tightened on admin tables that fetch via fetch-from-server pattern.

### Cache Components / PPR — adopt? Not for V1.

The `"use cache"` directive is powerful but requires:
- A pinned mental model around cache keys (compiler-generated, but you must reason about them).
- A migration of every data-fetch site to opt-in explicitly (default behavior in Cache Components mode is **everything dynamic**, opposite of pre-16 implicit caching).
- A Next 16 upgrade as prerequisite.

**Verdict:** wait. Re-evaluate Q4 2026 when Cache Components has 6+ months of production reports.

---

## 7. Server Actions security — checklist (when/if Musaium adopts them)

[security-nextjs-server-components-actions](https://nextjs.org/blog/security-nextjs-server-components-actions), [makerkit-server-actions-security](https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions)

### Built-in protections

- POST-only (CSRF surface reduced by SameSite cookies + Origin/Host check).
- Next.js automatically compares `Origin` header against `Host` (or `X-Forwarded-Host`). Mismatch = action rejected.
- Configure `experimental.serverActions.allowedOrigins` for trusted alt-domains.

### NOT built in — you must add

1. **Authentication check inside each action.** Page-level auth does *not* extend into Server Actions.
2. **Authorization (ownership/role) check.**
3. **Input validation with Zod (or Valibot).** TypeScript types are not runtime guards.
4. **Rate limiting** (Upstash Redis / Vercel KV / `rate-limiter-flexible`).
5. **Audit logging** of write actions.

**Recommended wrapper:** [next-safe-action](https://next-safe-action.dev/) — pipeline pattern with middleware-like steps (auth → validation → rate-limit → action), Zod-typed inputs/outputs.

### Server Actions vs Route Handlers — when to use which

[server-actions-vs-route-handlers](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers)

| Question | Use… |
|---|---|
| Triggered from a human in your Next.js UI? | **Server Action** (type safety + form integration) |
| Triggered by a machine / webhook / mobile app / third-party / scheduled job? | **Route Handler** (HTTP endpoint, public surface) |
| Need GET caching? | **Route Handler** (Server Actions are POST-only) |
| Need OpenAPI / external schema contract? | **Route Handler** |
| Read-your-writes after mutation? | Server Action + `updateTag()` |

**Musaium relevance:** Musaium web talks to a separate Express backend (`museum-backend`). Server Actions would just be a proxy → fetch layer. Stick with the current pattern (client fetch from Next.js client components to Express backend, JWT in `httpOnly` cookies). If a *web-only* feature lands (e.g. admin invite flow that doesn't need to exist in mobile API), Server Actions become a real option.

---

## 8. Middleware patterns 2026 — Edge vs Node, and the `proxy.ts` rename

[edge-runtime](https://nextjs.org/docs/app/api-reference/edge), [edge-vs-node-2026](https://medium.com/codetodeploy/edge-runtime-vs-node-runtime-in-next-js-complete-practical-guide-b853dea38751)

### Runtime trade-offs

| Aspect | Edge runtime | Node.js runtime |
|---|---|---|
| Cold start | Near-zero (V8 isolates) | Slower (full container) |
| Geographic proximity | Yes (Vercel Edge Network) | No (regional) |
| Node API compatibility | Partial (no `fs`, no native crypto fallback, etc.) | Full |
| Bundle size limit | ~1 MB (Vercel) | None |
| Best for | Auth gating, redirects, A/B, CSP nonce, header tweaks | Anything that needs DB, full crypto, S3 SDK |

### The Next 16 catch

`middleware.ts` → `proxy.ts`, but **`proxy.ts` runs Node.js only — Edge is not configurable.** The old `middleware.ts` still works for Edge use cases (deprecated, with a future-removal warning). Vercel has signaled a follow-up minor for an Edge-runtime alternative; no ETA published as of 2026-05.

### Security boundary reminder

**Middleware/proxy is not your auth boundary.** It can do *routing* and *coarse* gating, but every Server Action and Route Handler must re-verify auth. Edge middleware can be bypassed in some attack scenarios (cf. the 2025 CVE-2025-29927 middleware bypass). [authentication-guide](https://nextjs.org/docs/app/guides/authentication)

### Musaium today

`src/middleware.ts` does:
- Locale detection / redirect
- CSP-nonce generation (per-request)
- Likely auth gating for `/admin/*` (verify)

**This is exactly the workload Edge runtime is built for.** Recommendation: **do not rename to `proxy.ts` during the Next 16 migration.** Keep `middleware.ts` until Vercel ships the Edge alternative under the new name. Track [next-16-blog § proxy.ts](https://nextjs.org/blog/next-16#proxyts-formerly-middlewarets) for the Edge follow-up.

---

## 9. Decision tree for Musaium

```
Do you need to ship V1 on schedule (2026-06-01)?
├── YES → stay on Next 15.5.18 (current). Done.
│        │
│        ├── Adopt eslint-plugin-react-hooks compiler preset NOW (zero cost).
│        ├── Refactor 3–4 forms to useActionState + useFormStatus (1–2 days).
│        ├── Audit Suspense boundaries on admin tables (half-day).
│        └── Audit images.domains → remotePatterns migration (pre-16 prep).
│
└── NO / post-launch sprint? → migrate to Next 16.
         │
         ├── Step 1 (1 day) — codemod: `npx @next/codemod@canary upgrade latest`
         ├── Step 2 (half-day) — manual: confirm Edge middleware stays `middleware.ts`
         ├── Step 3 (half-day) — verify image config: minimumCacheTTL, qualities, remotePatterns
         ├── Step 4 (half-day) — TypeScript: `npx next typegen` for PageProps helpers
         ├── Step 5 (1 day) — full regression (unit + Playwright e2e)
         ├── Step 6 (optional, 2–3 days) — enable React Compiler in production after 7-day bake
         └── Step 7 (Q4 2026) — evaluate Cache Components for landing page (`"use cache"` with `cacheLife("days")` on /privacy, /support marketing pages)
```

---

## 10. Final verdict for Musaium (pre-launch V1)

| Question | Answer | Rationale |
|---|---|---|
| Upgrade to Next 16 pre-launch? | **No** | Risk > reward 3 weeks before launch. 15.5.18 is on the security floor. |
| Upgrade to Next 16 post-launch (June 2026 sprint)? | **Yes** | Default Turbopack alone is worth it. Most breaking changes have codemods. |
| Adopt React Compiler? | **Lint preset now, compiler enable post-launch** | ESLint preset has zero install risk. Compiler enable should wait for SWC fast-path or for clear performance pressure. |
| Adopt PPR / Cache Components? | **No** | Programming-model shift, no clear win on a B2B/landing app. Re-eval Q4 2026. |
| Adopt React 19 hooks (`useActionState`, `useFormStatus`)? | **Yes — admin forms only** | 3–4 small forms, 1–2 day refactor. Real maintainability win. |
| Adopt `use()` hook? | **No** | Server components already use plain `await`. No use case in current client code. |
| Adopt `useOptimistic`? | **No** | Admin UX doesn't need it. Reconsider if review-moderation page gets built. |
| Migrate to Server Actions? | **No** | Express backend already serves mobile + web. Don't fork the API surface. |
| Migrate `middleware.ts` → `proxy.ts`? | **No** | CSP-nonce + locale routing belong on Edge. Wait for Vercel's Edge follow-up. |
| Adopt `@sentry/nextjs ^10.49` features? | **Already integrated** — verify RSC tracing is enabled | Sentry SDK auto-instruments Server Components, API routes, edge middleware. [sentry-nextjs](https://docs.sentry.io/platforms/javascript/guides/nextjs/) |

---

## Sources (verified URLs, 2026-05-12)

### Official (react.dev, nextjs.org, vercel.com)
- [React 19 release blog (2024-12-05)](https://react.dev/blog/2024/12/05/react-19)
- [React 19.2 release blog (2025-10-01)](https://react.dev/blog/2025/10/01/react-19-2)
- [React Compiler 1.0 release (2025-10-07)](https://react.dev/blog/2025/10/07/react-compiler-1)
- [React versions page (canonical)](https://react.dev/versions)
- [React Compiler incremental adoption](https://react.dev/learn/react-compiler/incremental-adoption)
- [`useOptimistic` reference](https://react.dev/reference/react/useOptimistic)
- [`useActionState` reference](https://react.dev/reference/react/useActionState)
- [`useEffectEvent` reference](https://react.dev/reference/react/useEffectEvent)
- [Next.js 16 release blog (2025-10-21)](https://nextjs.org/blog/next-16)
- [Next.js 16.2 release blog](https://nextjs.org/blog/next-16-2)
- [Next.js 15.5 release blog](https://nextjs.org/blog/next-15-5)
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js Cache Components config](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
- [`"use cache"` directive](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [`reactCompiler` config](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler)
- [Next.js Edge Runtime API reference](https://nextjs.org/docs/app/api-reference/edge)
- [Authentication guide](https://nextjs.org/docs/app/guides/authentication)
- [How to Think About Security in Next.js (Server Components/Actions)](https://nextjs.org/blog/security-nextjs-server-components-actions)
- [Vercel: Next.js May 2026 security release](https://vercel.com/changelog/next-js-may-2026-security-release)
- [Vercel: CVE-2026-23869 summary](https://vercel.com/changelog/summary-of-cve-2026-23869)
- [GHSA-q4gf-8mx6-v5v3 (RSC DoS advisory)](https://github.com/vercel/next.js/security/advisories/GHSA-q4gf-8mx6-v5v3)
- [Sentry for Next.js platform guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/)

### Community deep-dives (cited for benchmarks / migration effort)
- [Netlify: React/Next.js May 2026 security update](https://www.netlify.com/changelog/2026-05-08-react-nextjs-security-vulnerabilities/)
- [InfoQ: Meta's React Compiler 1.0 in production](https://www.infoq.com/news/2025/12/react-compiler-meta/)
- [VersionLog: Next.js 16 release history](https://versionlog.com/nextjs/16/)
- [Monorepo migration Next 14 → 16 (DEV.to)](https://dev.to/abhilashlr/migrating-a-large-scale-monorepo-from-nextjs-14-to-16-a-real-world-journey-5383)
- [Turbopack stable benchmarks Jan 2026](https://medium.com/@shahzaibnawaz/turbopack-is-finally-stable-5-real-world-benchmarks-vs-webpack-3469c4dcce59)
- [Edge vs Node runtime guide (Mar 2026)](https://medium.com/codetodeploy/edge-runtime-vs-node-runtime-in-next-js-complete-practical-guide-b853dea38751)
- [Server Actions vs Route Handlers (Makerkit)](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers)
- [Server Actions security 5 vulnerabilities (Makerkit)](https://makerkit.dev/blog/tutorials/secure-nextjs-server-actions)
- [next-safe-action library](https://next-safe-action.dev/)
- [Pockit: React Compiler automatic memoization](https://pockit.tools/blog/react-compiler-automatic-memoization-performance-guide/)
- [Pockit: React 19 use() hook deep dive](https://pockit.tools/blog/react-19-use-hook-data-fetching-complete-guide/)

---

**Honesty/UFR-013 footnote.** Every benchmark cited (12% Meta, 20–30% Sanity, 10–15% Wakelet, 2–5× Turbopack, 240+ files monorepo) is **reported by a primary source** (react.dev blog, nextjs.org blog, Vercel changelog) or a single secondary source whose URL is in the Sources block. Numbers from non-react.dev "React 20" posts are **flagged unverified**. Musaium-specific verdicts (don't upgrade pre-launch, etc.) reflect my reading of trade-offs and are explicitly **opinion**, not citation.

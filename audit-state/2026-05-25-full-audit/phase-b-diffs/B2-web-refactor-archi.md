# B2 — Web refactor DRY phases 1-4 (2026-05-23) — Architecture & Correctness / DRY / Réutilisabilité

**Reviewer** : fresh-context senior read-only (UFR-022). Branche `dev` @ `89852f2a1`.
**Scope commits** : `40e0671e9` (P1) · `eda20d508` (P2) · `eda3539d5` (P3) · `76fdda2f1` (P4).
**Méthode** : lecture état final + vérif migrations + run tests/lint. Citations `path:line`.

## Note : 9.0 / 10 — VERDICT : APPROVED (qualité élevée, dette résiduelle mineure et documentée)

Refactor DRY exemplaire : abstractions propres, byte-for-byte préservé, a11y soignée, tests denses (622 pass), zéro résidu de scaffold dupliqué détectable. Les rares manques sont explicitement documentés et déférés (V2 / follow-up), pas cachés (UFR-013 respecté dans les commit bodies). Vérifications exécutées :
- `pnpm test` → **Test Files 65 passed (65) · Tests 622 passed | 1 skipped**.
- `pnpm lint` (eslint + tsc --noEmit) → **0 errors, 1 warning** (spread-deps connu/documenté `useFetchData.ts:228`).

---

## ✅ Bien fait

### apiPut — wrapper canonique CSRF complet
- `apiPut<T>` (`src/lib/api.ts:233-235`) délègue à `request()` interne, **PUT inclus dans `STATE_CHANGING_METHODS`** (`api.ts:48`) → CSRF cookie→header auto (`api.ts:167-172`, `readCsrfToken()` `api.ts:41-46`) + `credentials:'include'` (`api.ts:177`). Le piège CLAUDE.md (« `apiPut` n'existe pas, wrappers fetch dupliqués CSRF ») est **résolu à la racine**, pas contourné.
- Site PUT branding migré : le wrapper `fetch` local a disparu, remplacé par `import { apiPut }` (`branding/page.tsx:6`) + appel propre (`branding/page.tsx:128-130`). CSRF/credentials désormais centralisés. `grep` confirme **aucun `fetch(`/`X-CSRF` résiduel** dans la page branding.
- 204 No Content géré (`api.ts:212-214`), 401→refresh→retry propage `signal` (`api.ts:195`).

### useFetchData — AbortController correct, zéro race
- Cancellation closure-cell via `controllerRef` (`useFetchData.ts:166`) ; `refetch()` abort l'in-flight avant de relancer (`useFetchData.ts:186-189`) ; cleanup unmount abort (`useFetchData.ts:240-242`).
- Double garde anti-race : `if (signal.aborted) return` dans les 2 handlers (`useFetchData.ts:201`, `:209`) + `isAbortError()` (`useFetchData.ts:141-147`, gère `DOMException` ET duck-typed `{name:'AbortError'}`).
- États cohérents : `loading` init = `url !== null` (`useFetchData.ts:159`) ; **data préservée sur erreur** (jamais reset, doc `:94`) ; `parseData` lu via `optionsRef` (`useFetchData.ts:172-173`) → identité `refetch` stable même avec options inline (`useCallback` deps `[url, ...deps]` `:228`).
- Tests probants : T8 deps-change abort (`useFetchData.test.ts:333`), T9 unmount mid-flight no-warning (`:371`), T10 refetch abort+relaunch (`:407`), **T14 StrictMode double-mount → seul le 2e résultat atterrit** (`:517`). 9/9 pages admin migrées (grep confirmé), pattern `cancelled` flag manuel éliminé sauf analytics (hors scope, voir 🔧).

### BaseModal / ModalActions — a11y solide, ADR-067 respecté
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` résolu (`titleId` OU `useId` auto) (`BaseModal.tsx:165-167`, `:91-92`). `useId` canonical + ref-as-prop (no `forwardRef`) = React 19 idiomatique (`:88`, `:55-56`, `:149-156`).
- Escape gated `open && dismissable` avec cleanup listener (`BaseModal.tsx:95-108`) — test T5 (no-close quand `dismissable=false` `:92`) + T11 (cleanup unmount `:176`).
- Backdrop click via `e.target === e.currentTarget` (`BaseModal.tsx:143`) — plus simple/robuste que `stopPropagation`, testé T6/T7/T13.
- **Focus-on-open sûr** : `FOCUSABLE_SELECTOR` exclut `[disabled]` (`BaseModal.tsx:71-72`) → un Confirm `confirmBusy`/`confirmDisabled` ne capte pas le focus ; fallback panel `tabIndex=-1` (`:129`, test T9).
- 8 modals migrés vérifiés : 5 pages admin + `TierToggleButton` + 3 sous-composants locaux dans `users/[id]/page.tsx` (`SimpleConfirmModal:53`, `RoleChangeModal:543`, `DeleteConfirmModal:607`). `dismissable={!busy}` partout (`users/[id]/page.tsx:572`, `:634`) = anti-cancel mid-mutation. Outlier reviews (footer vert/rouge inline) **garde le scaffold BaseModal**, n'abandonne que ModalActions, et c'est documenté OQ-6 (`reviews/page.tsx:223-224`).
- ADR-067 (custom React 19, Radix déféré V2) respecté ; les TODO V2 (focus-trap, return-focus, scroll-lock) sont marqués honnêtement (`BaseModal.tsx:25-27`).

### TableHeaderCell / TableDataCell / HoneypotField — abstractions propres, zéro props leakage
- Props minimales et typées, **aucun spread `{...rest}`** → pas de fuite d'attributs arbitraires. `TableHeaderCell` (`align`/`scope`/`className`), `TableDataCell` (`nowrap`/`align`/`className`).
- className merge cohérent `[defaults, …, className].filter(Boolean).join(' ')` identique à Spinner/AlertBanner (`TableHeaderCell.tsx:44`, `TableDataCell.tsx:45-47`) ; ordre source-correct pour override Tailwind 4 documenté (`TableDataCell.tsx:9-14`). `scope="col"` défaut WCAG 1.3.1 (`TableHeaderCell.tsx:47`).
- HoneypotField : 4 couches OWANP (off-screen inline style + double `aria-hidden` wrapper/input + `tabIndex=-1` + `autoComplete="off"`) (`HoneypotField.tsx`). Inline style justifié (pas d'équivalent Tailwind composite), `className` additif (off-screen survit).

### Composants partagés — source unique, pas de redéfinition
- `Spinner`/`AlertBanner`/`FormFieldError`/`HoneypotField`/`TableHeaderCell`/`TableDataCell` : un seul fichier chacun sous `src/components/ui/`. Interfaces exportées (F1/F4 cohérence phase 4).
- AlertBanner XSS-safe (texte only, pas de `dangerouslySetInnerHTML`, `AlertBanner.tsx:12`), différenciation role+texte (jamais couleur-only), `role=alert` (error/success) vs `status` (info).
- FormFieldError contrat strict empty → `null` sur `undefined|null|''` (`FormFieldError.tsx:if (!error) return null`), `role="alert"` + `id` pour `aria-describedby`.

---

## ⚠️ À améliorer

1. **[FAIBLE] `apiPut`/`apiPost`/`apiPatch`/`apiDelete` n'acceptent pas `{signal}`** (`api.ts:225-239`). Seul `apiGet` le propage. Documenté comme choix de scope (`api.ts:131-144`) — légitime, mais asymétrie d'API : un futur `useMutation` devra élargir `request()`. Pas un bug, dette de surface.

2. **[FAIBLE] `combinedError = error ?? mutationError` masque l'erreur de mutation si une erreur de fetch coexiste** (`tickets/page.tsx:82`, pattern répliqué 6 pages). Comme `useFetchData` ne reset `error` que sur le prochain fetch réussi (`useFetchData.ts:205` clear seulement en succès), un fetch en erreur « gèle » la bannière et cache un échec de mutation jusqu'au prochain refetch réussi. Cas-limite rare (les 2 erreurs simultanées), mais le `??` priorise silencieusement le fetch-error. Une stratégie « dernier événement gagne » serait plus juste. Sévérité faible (UX dégradée dans un cas rare, pas de perte de données).

3. **[INFO] `react-hooks/exhaustive-deps` warning** sur le spread `[url, ...deps]` (`useFetchData.ts:228`). Limitation upstream connue et documentée dans le code (`:223-227`) ; lint passe (warning, pas error). Acceptable mais à garder en tête lors d'évolutions du hook.

4. **[INFO] Divergence contrat `refetch()`** : spec/design disaient « resolve after settle », l'impl + test T10 actent « resolve on kick-off » (fire-and-forget, `useFetchData.ts:216-221`). L'éditeur green a documenté la divergence en JSDoc plutôt que toucher le test frozen (discipline UFR-022 correcte). Pas un bug — les 6 call-sites s'accordent — mais le contrat public reste un faux-ami pour un futur appelant qui `await refetch()` en attendant la fin du fetch.

---

## 🔧 Reste à faire

- **`analytics/page.tsx` non migré vers `useFetchData`** (`analytics/page.tsx:117,156` — `let cancelled = false` manuel × 2). Documenté follow-up F-1 du commit P3. Multi-fetch (usage/content/engagement) + flag `cancelled` ⇒ candidat à un `useFetchData` multiple ou un hook multi-source. **Race latente subsiste** ici (pattern flag-only, pas d'AbortController réel → la requête réseau n'est pas annulée, seul le setState est gardé). À traiter post-launch.
- **`users/[id]/page.tsx` `fetchUser` non migré** (follow-up F-1 P3, documenté). Détail single-resource non couvert par le hook au moment de la phase 3.
- **Banners-as-`<p>` résiduels** : `LoginForm.tsx:127` + `ResetPasswordForm.tsx:136` gardent un `<p className="…bg-red-50…text-red-600">` inline (nécessitent `<p>`→`<div>` pour migrer vers `<AlertBanner>`). Différé P1 follow-up — note : ces 2 sites restent en `text-red-600` (vs `text-red-700` WCAG appliqué ailleurs P1).
- **V2 modal hardening (ADR-067)** : focus-trap (Tab/Shift+Tab), return-focus on close, scroll-lock body — tous déférés à la migration Radix post-launch (`BaseModal.tsx:25-27`). Ce sont de vrais gaps a11y (un Tab depuis le dernier élément du dialog s'échappe vers le contenu derrière), mais assumés et planifiés.

---

### Conclusion
Cluster de refactoring **propre, DRY, réutilisable et honnêtement documenté**. Les abstractions ne fuient pas, la cancellation est correcte là où elle est implémentée, l'a11y est au-dessus de la moyenne. Les 4 manques restants sont tous déférés explicitement (analytics, fetchUser, banners-as-p, modal-trap V2) — aucun n'est un blocker launch. Aucune fabrication détectée dans les commit bodies vs état réel du code (vérifié par grep + lecture). **9.0/10, APPROVED.**

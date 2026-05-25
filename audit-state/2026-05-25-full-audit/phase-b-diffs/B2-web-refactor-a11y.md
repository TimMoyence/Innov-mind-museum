# B2 — Web refactor DRY phases 1-4 (2026-05-23) — Angle A11Y / Sécurité / Tests / Honnêteté

**Reviewer** : fresh-context READ-ONLY (UFR-022). Branche `dev` @ HEAD `89852f2a1`.
**Commits** : `40e0671e9` (P1) · `eda20d508` (P2) · `eda3539d5` (P3) · `76fdda2f1` (P4).
**Scope** : Spinner, AlertBanner, FormFieldError, BaseModal, ModalActions, useFetchData, apiPut, apiGet({signal}), HoneypotField, TableHeaderCell, TableDataCell + 9 pages admin + 4 forms marketing migrés.

## Note : **8.5 / 10** — verdict **APPROVED**

Refactor DRY de très bonne facture sous l'angle a11y/sécu/tests/honnêteté. Tous les composants sont consommés (zéro dead-code), les tests vérifient la VRAIE interaction (ESC, focus, abort, CSRF), et l'ADR-067 documente honnêtement les déférrals. Le seul vrai trou a11y (focus-trap modal) est **assumé et documenté**, pas caché — d'où une note haute malgré un gap WCAG connu.

---

## ✅ Bien fait

- **BaseModal a11y core correct** (`museum-web/src/components/ui/BaseModal.tsx:161-180`) : `role="dialog"` + `aria-modal="true"` + `aria-labelledby` résolu (auto-`useId` via `title`, ou `titleId` externe), panel `tabIndex={-1}`, ESC listener guardé `open && dismissable` (`:95-108`), cleanup `removeEventListener` au unmount (`:105-107`), focus-on-open avec fallback panel (`:111-130`), backdrop click via `e.target === e.currentTarget` (`:143-145`) — pas de close sur clic enfant.
- **AlertBanner role différencié + jamais colour-only** (`AlertBanner.tsx:30-34,42`) : `role="alert"` (error/success, live assertive) vs `role="status"` (info). Différenciation par role + texte, pas que la couleur. Pas de `dangerouslySetInnerHTML` (texte only `:43`).
- **FormFieldError lié via aria-describedby** (`FormFieldError.tsx:25-32`) : accepte `id`, émet `role="alert"`, rend `null` si vide. **Wiring réel vérifié côté consumers** : `BetaSignupSection.tsx:156+165` (`aria-describedby` conditionnel → `id="beta-email-error"`), `B2bContactForm.tsx:114/138/162/184/217` (5 champs liés correctement).
- **HoneypotField anti-bot conforme** (`HoneypotField.tsx:45-78`) : wrapper `aria-hidden="true"` + input `aria-hidden="true"` (double défense AT), `tabIndex={-1}` (hors tab-order), `autoComplete="off"`, off-screen `position:absolute; left:-10000px; w/h 0; overflow:hidden`, label leurre "Website". `className` additif → style off-screen survit (`:64`, invariant testé).
- **TableHeaderCell** (`TableHeaderCell.tsx:47`) : natif `<th scope="col">` par défaut (WCAG 1.3.1), `align` paramétrable. **TableDataCell** natif `<td>`. Pas de `<div role="cell">` bricolé.
- **Spinner** (`Spinner.tsx:37-39`) : `role="status"` + `aria-label` + `<span class="sr-only">` texte. CSS-only.
- **apiPut CSRF correct** (`api.ts:233-235` → `request` `:167-172`) : `PUT` ∈ `STATE_CHANGING_METHODS`, donc `X-CSRF-Token` envoyé (double-submit) + `credentials:'include'`. **Vérifié par test** `api.test.ts:224-233`. Migration réelle : `branding/page.tsx:128` utilise désormais `apiPut` (le gotcha CLAUDE.md "apiPut n'existe pas + wrapper fetch+CSRF local" est résolu).
- **useFetchData abort robuste** (`useFetchData.ts:177-243`) : AbortController par fetch, `.abort()` sur deps-change/unmount/refetch, double garde post-await (`signal.aborted` `:201,209` + `isAbortError`), data préservée sur erreur. StrictMode double-mount géré.
- **Tests vérifient la VRAIE interaction, pas le render** (CRITIQUE pour ce cluster) :
  - BaseModal T4-T13 : ESC dispatch réel (`fireEvent.keyDown`), focus `document.activeElement` assertions (`:144,158`), backdrop click, cleanup post-unmount (`:187-191`).
  - useFetchData T8/T9/T10/T14 : abort vérifié via `signal.aborted === true` + payload stale ignoré + zéro warning console post-unmount.
  - api.test : CSRF présent sur POST/PATCH/PUT, **absent sur GET** (`:126-135`), absent sans cookie. apiGet AbortError mid-flight + pre-aborted.
  - **79 tests passent — exécuté et vérifié** (`vitest run` sur les 6 fichiers, exit 0).
- **Honnêteté (UFR-013) exemplaire** :
  - Aucun dead-code : les 11 primitives + apiPut + useFetchData sont toutes consommées (grep vérifié, 5-9 sites chacune). Stray-hits AlertBanner/FormFieldError dans Table*.tsx/test = **commentaires only**, pas d'imports morts.
  - ADR-067 (`docs/adr/ADR-067-base-modal-custom-vs-radix.md:36,39,47,53-56,78`) déclare **explicitement** focus-trap/return-focus/scroll-lock **différés V2**, avec critères déclencheurs nommés (RGAA/EN 301 549, WCAG 2.4.3). Wording 100 % aligné au code (`BaseModal.tsx:25-27` `@todo` + tests qui ne prétendent PAS tester le trap).

---

## ⚠️ Risques a11y / sécu / tests

- **[MOYEN — a11y] Pas de focus-trap dans BaseModal** — `BaseModal.tsx:111-130` focus l'élément à l'ouverture mais **Tab/Shift+Tab peuvent sortir du modal** vers le contenu de fond. Viole WCAG 2.4.3 (Focus Order) / 2.1.2 (No Keyboard Trap inversé) pour un `aria-modal="true"`. **MITIGÉ par honnêteté** : assumé+documenté ADR-067:53 + `@todo OQ-2`. Acceptable pour V1 B2C (8 modals admin internes, pas user-facing public). À traiter avant tout audit RGAA externe.
- **[MOYEN — a11y] Pas de return-focus on close** — `BaseModal.tsx:25` (`@todo OQ-1`). Au close, focus perdu (retour body). Idem : différé ADR-067:54, assumé. Impact clavier-only sur pages admin.
- **[FAIBLE — a11y] Pas de scroll-lock body** — `@todo OQ-3`, différé. UX seulement, pas blocker.
- **[FAIBLE — a11y] BaseModal n'expose pas `aria-describedby` pour le corps** — seul `aria-labelledby` (titre). Le contenu du dialog n'est pas annoncé comme description. Mineur (le contenu est dans le sous-arbre lu par AT), mais pas de slot prévu pour `descriptionId`.
- **[FAIBLE — sécu] HoneypotField : pas de garde "filled = reject" dans le composant** — le composant est correct (presentational), mais la logique anti-bot (rejeter si `value !== ''`) vit chez le caller. Vérifier hors-scope de ce cluster que `BetaSignupSection`/`B2bContactForm` rejettent bien un honeypot rempli (le composant seul ne protège rien si le caller ne lit pas `value`).
- **[FAIBLE — sécu] CSRF "rollout window" tolère l'absence de token** — `api.ts:168-171` : si pas de cookie `csrf_token`, le header est simplement omis (pas d'erreur). Test `api.test.ts:137-145` confirme ce comportement voulu. Le backend reste autoritatif (double-submit côté serveur), donc OK, mais le commentaire "rollout window" suggère une fenêtre transitoire à refermer post-launch.
- **[INFO — tests] Aucun test sur TableHeaderCell/TableDataCell sort-aria** — le critère demandait "sort aria" : ces composants n'implémentent PAS `aria-sort` (pas de colonnes triables dans les tables admin migrées). Donc rien à tester — absence légitime, pas un trou. `scope="col"` est testé.

---

## 🔧 Reste à faire

1. **Focus-trap + return-focus BaseModal** (V2, ADR-067 trigger) — avant tout audit a11y externe / RGAA. C'est le seul gap WCAG réel du cluster.
2. **Refermer la "rollout window" CSRF** — une fois le cookie `csrf_token` garanti partout, durcir `api.ts` pour échouer (ou logguer) si absent sur méthode state-changing.
3. **(Optionnel) slot `descriptionId`/`aria-describedby`** sur BaseModal pour annonce AT complète du corps.
4. **Vérifier (hors-cluster)** que les 2 forms marketing rejettent un honeypot rempli côté submit — le composant ne le garantit pas.

---

### Méthode / preuves
- État final lu : 11 composants + `api.ts` + `useFetchData.ts` + `validation.ts` + 6 fichiers de tests + ADR-067.
- Consommation vérifiée par `grep -rl` (zéro dead-code).
- `aria-describedby` wiring vérifié aux call-sites (`BetaSignupSection`, `B2bContactForm`).
- Tests exécutés : `pnpm exec vitest run` (6 fichiers) → **79 passed, exit 0** (vérifié, non supposé).

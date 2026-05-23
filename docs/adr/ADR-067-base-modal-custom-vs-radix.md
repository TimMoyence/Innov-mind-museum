# ADR-067 — BaseModal custom (museum-web) — defer Radix UI Dialog post-launch V1

**Status:** Accepted — implemented Phase 2
**Date:** 2026-05-23
**Deciders:** /team run `2026-05-23-web-refactor-p2` (architect + editor + reviewer fresh-context UFR-022)
**Scope:** `museum-web/` only (museum-frontend uses RN `<Modal>` natively, museum-backend has no UI)
**Implemented in:** `museum-web/src/components/ui/BaseModal.tsx`, `ModalActions.tsx` (PR pending — branch `dev` post-commit `40e0671e9`)
**Related design:** [`team-state/2026-05-23-web-refactor-p2/design.md`](../../.claude/skills/team/team-state/2026-05-23-web-refactor-p2/design.md) §1, §4
**Lib-docs:** [`lib-docs/react/PATTERNS.md`](../../lib-docs/react/PATTERNS.md) (React 19 `useId`, ref-as-prop)
**Audit context:** [`team-reports/2026-05-23-web-dry-audit/audit-log.md`](../../team-reports/2026-05-23-web-dry-audit/audit-log.md) (Batch 2C, lignes 233-256)

---

## Context

Pre-launch V1 (2026-06-07) `museum-web/src/` héberge **8 modals** dispersés sur les pages admin et 1 composant standalone (`TierToggleButton`), tous réimplémentant byte-for-byte le même scaffold :

- overlay `<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">`,
- panel `<div className="w-full max-w-{sm|md} rounded-2xl bg-white p-6 shadow-xl">`,
- ARIA `role="dialog" aria-modal="true" aria-labelledby`,
- listener Escape (`window.addEventListener('keydown', …)`) — présent dans 5/8 sites, absent dans 3/8,
- détection backdrop click (`e.target === backdropRef.current`) — présente dans 5/8 sites.

L'audit DRY/KISS du 2026-05-23 ([`team-reports/2026-05-23-web-dry-audit/audit-log.md`](../../team-reports/2026-05-23-web-dry-audit/audit-log.md), Batch 2C) a identifié ce cluster comme la plus grosse opportunité de consolidation post-Phase 1, avec un gap a11y uniforme :

- focus auto sur open respecté par 2/8 modals seulement,
- annonce dialog cohérente (triple `role+aria-modal+aria-labelledby`) absente sur 3/8 sites,
- `eslint-disable jsx-a11y/no-noninteractive-element-interactions` copié dans 5/8 sites pour gérer le backdrop click.

BaseModal est un composant **fondation** : tout futur modal museum-web le consommera, et changer la lib sous-jacente une fois 8+ sites migrés = refactor large. Le choix « custom vs lib tierce » est donc à documenter pour traçabilité.

### Alternatives examinées

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **@radix-ui/react-dialog** | A11y industry-standard out-of-box (focus-trap, return-focus, scroll-lock), WAI-ARIA APG compliant, communauté large | Bundle ~15-20 KB add, API compound `Dialog.Root/Trigger/Content` impose un mapping non-trivial sur les 8 sites, pré-launch risk (introduce dep + migrate 2 jours minimum) | Différé V2 |
| **@headlessui/react Dialog** | Style coupling propre avec Tailwind, similaire à Radix | Même bundle/migration cost que Radix, moins de momentum 2026 | Différé V2 |
| **react-aria Dialog (Adobe)** | A11y la plus stricte (focus management complet) | Bundle plus large, API plus complexe, overkill pour 8 modals admin | Rejeté |
| **Custom BaseModal (chosen)** | Zero dep ajoutée, contrôle total sur classes Tailwind, no migration des 8 consommateurs (lift-and-shift propre), pattern React 19 (`useId`, ref-as-prop) | Focus-trap / return-focus / scroll-lock **différés** | **Retenue (D1)** |

---

## Decision

**Implémenter `BaseModal` + `ModalActions` comme composants custom React 19 dans `museum-web/src/components/ui/`, sans dépendance tierce.**

Migrer les 8 modals existants vers ces deux primitives (Phase 2 du refactor museum-web). Toute migration ultérieure vers Radix UI Dialog (ou équivalent) est **différée post-launch V1** et fera l'objet d'un ADR de suivi le moment venu.

### Critères déclencheurs d'une migration V2 vers Radix

Réévaluer cette décision si l'un des signaux suivants émerge post-launch :

- **Focus-trap requis** — feedback user assistive-tech (NVDA/JAWS/VoiceOver) indique que Tab peut sortir du modal et la perte de contexte est gênante ; OU audit a11y externe (équipe partenaire, conformité RGAA/EN 301 549) le marque comme blocker.
- **Return-focus on close attendu** — issue ouverte par un utilisateur clavier-only signalant que le focus se perd après fermeture (WCAG 2.4.3 Focus Order).
- **Scroll-lock body devient un problème UX** — si du contenu modal long apparaît et le scroll background devient une nuisance.
- **3e site ajoute un cas atypique** — si un nouveau modal demande animation enter/exit, scroll-lock conditionnel, ou portal explicite, l'investissement migration commence à rentabiliser.

Sans aucun de ces signaux, la décision custom reste valide.

### Périmètre fonctionnel V1 (custom)

`BaseModal` Phase 2 implémente :

- **Rendu conditionnel** sur prop `open` (REQ-U-1).
- **ARIA dialog** : `role="dialog"` + `aria-modal="true"` + `aria-labelledby` via `useId` ou prop externe (REQ-U-2/3).
- **Dismiss Escape** (window listener attaché uniquement quand `open && dismissable`) (REQ-E-1, REQ-S-3).
- **Dismiss backdrop click** (via `e.target === e.currentTarget`) (REQ-E-2/3).
- **Focus initial sur premier focusable** (selector standard tab-index) à l'ouverture (REQ-S-1).
- **Prop `dismissable`** (défaut `true`, `false` pour `TierToggleButton`) (REQ-O-1).
- **Prop `footer`** optionnelle (typiquement `<ModalActions …/>`) (REQ-O-2).

`ModalActions` Phase 2 implémente :

- **Couple Cancel / Confirm** avec labels obligatoires (REQ-UN-4).
- **Variant `destructive`** (Confirm rouge `bg-red-600`) (REQ-U-7).
- **États `confirmDisabled` + `confirmBusy`** (REQ-E-5).

### Hors-périmètre V1 (différés Radix V2)

| Capacité | Différé car | Mitigation V1 |
|---|---|---|
| **Focus-trap** | ~50 LOC custom + edge cases (portal, dynamic children, Shift+Tab). Coût > bénéfice avant migration Radix. | Tab sort vers le browser chrome. Dégradé acceptable pour admin pages (audience opérateurs, contexte connu). Documenté `@todo Phase V2` dans `BaseModal.tsx` JSDoc. NFR-A11Y-5 du spec. |
| **Return-focus on close** | ~15 LOC mais false-positive si modal X ouvre modal Y (focus retourne à X qui a unmount). Mieux fait par Radix. | Même comportement que pré-Phase-2 (focus se perd sur body). Zéro régression. Documenté `@todo Phase V2`. |
| **Scroll-lock body** | ~3 LOC mais risque scroll-restoration buggée. Pas un blocker (NFR-A11Y-4 stipule pas d'`aria-hidden` body Phase 2). | Tous les modals actuels tiennent dans le viewport admin. Pas de nuisance constatée. |
| **Animation enter/exit** | Pas d'animation actuelle sur les 8 modals existants. Ne pas en ajouter (risque régression + footprint framer-motion). | Hors scope, OQ-8 spec. |

### Cosmétique (sous-décision)

- **Props `*Props` exportées** : `BaseModalProps`, `ModalActionsProps` named exports (NFR-TS-1). Phase 1 (`AlertBannerProps`, `SpinnerProps`) ne l'avait pas fait — Phase 2 monte la barre, Phase 1 reste à back-aligner (cosmetic TD non-blocker).
- **`onClose` required même quand `dismissable=false`** (OQ-7) : `TierToggleButton` passe `() => {}` no-op. Signature uniforme = sécurité contre flip `dismissable: false → true` qui crasherait silencieusement sur `onClose?` optionnel.
- **`Spinner` (Phase 1) NON utilisé pour `confirmBusy`** : Phase 2 garde le label `'…'` (U+2026 horizontal ellipsis) pour zéro régression visuelle vs les 8 modals existants. Migration vers `<Spinner>` envisageable via une future prop `confirmBusyIndicator: 'ellipsis' | 'spinner'`.

---

## Consequences

### Quand appliquer (`BaseModal`)

- Tout nouveau modal museum-web (admin panel, paywall, settings…).
- Toute migration future d'un site qui inline encore son propre scaffold `fixed inset-0` + `role="dialog"`.

### Quand ne PAS appliquer

- **museum-frontend** (React Native) — utilise `<Modal>` natif RN, contraintes différentes (host persistent, voir `feedback_state_machine_react_key`).
- **Site avec footer dynamique au-delà de `destructive` boolean** — ex. `admin/reviews/page.tsx` (vert pour approve, rouge pour reject) garde son footer JSX inline mais consomme `BaseModal` pour le scaffold (OQ-6 spec, outlier documenté).
- **Modal full-bleed sans backdrop interactif** — n/a aujourd'hui ; reconsidérer si introduit.

### Effets bénéfiques (mesurés)

- **8 sites consolidés** sur 2 primitives. ~317 LOC supprimées brute sur les sites (cf. design.md §4 ligne 799), ~455 LOC ajoutées dans `components/ui/` (composants + tests + JSDoc) → **delta brut +138 LOC** mais la maintenance bascule : 1 seul site à toucher pour bug fix futur. L'audit annonçait « -100 LOC » en estimation conservatrice ; le delta réel est positif en LOC brutes mais négatif en surface de maintenance.
- **Gain a11y uniforme** : focus auto sur open passe de 2/8 à 7/8 sites (TierToggle exempté car intentionnellement non-dismissable, focus initial sur Cancel acceptable).
- **Annonce dialog cohérente** : `role+aria-modal+aria-labelledby` triple sur 100 % des sites (vs 5/8 avant).
- **5 `eslint-disable jsx-a11y/…` retirés** (1 par site backdrop interactif). NFR-LINT-1 spec.
- **Surface 1 point de migration Radix** : `BaseModal.tsx` est l'unique site contenant `role="dialog"` markup. AC-5 spec garantit ce critère via grep.

### Effets négatifs (documentés `@todo` dans `BaseModal.tsx`)

- **Focus-trap absent** — Tab sort vers le browser chrome. Acceptable pour admin (audience opérateurs), risque pour modals end-user-facing si introduits.
- **Return-focus on close absent** — focus se perd sur `<body>`. WCAG 2.4.3 Focus Order légèrement enfreint. **Pas une régression** : comportement identique à pré-Phase-2.
- **Scroll-lock body absent** — long contenu modal pourrait scroller le background. Non observé sur les 8 modals actuels.
- **TierToggleButton focus initial change** — actuellement Confirm est focused via `confirmRef.current?.focus()` ; post-Phase 2 Cancel est focused (premier focusable du footer). **Gain safety** sur action destructive (un Enter accidentel ne valide plus le tier change) mais **changement comportemental** assumé (R-1 design.md).

### Risques résiduels

- **Si un futur dev introduit un nouveau modal sans utiliser `BaseModal`**, le bénéfice DRY s'érode. Mitigation : sentinel D1 (grep `fixed inset-0 z-\[60\]` hors `BaseModal.tsx` = 0 hits) + sentinel D2 (grep `role="dialog"` hors `BaseModal.tsx` = 0 hits) lancés en CI.
- **Migration Radix V2 future = effort > zéro** : 8+ sites à toucher, API compound Radix nécessite re-tester chaque consommateur. Atténué par le fait que `BaseModal` est l'unique site `role="dialog"` (changement localisé à 1 fichier + adapt des call-sites).

### Suivis post-launch V1

- **Cosmetic TD** : back-aligner Phase 1 (`AlertBannerProps`, `SpinnerProps`) sur convention Phase 2 (named export). Tracked F1 reviewer.
- **Phase 4 polish** : migrer `TierToggleButton` inline `<p role="alert" className="bg-red-50 …">` vers `<AlertBanner variant="error">`. Tracked F2 reviewer (hors scope Phase 2 spec §11).
- **`afterEach` import unused** dans `BaseModal.test.tsx:1` — cleanup cosmétique. Tracked F3 reviewer (frozen-test empêche correction en Phase 2).
- **ADR de suivi** quand l'un des critères déclencheurs (cf. ci-dessus) sera observé : décrire la migration Radix UI Dialog ou équivalent, mapping API et plan de migration des 8+ sites.

---

## Verification

- **Code review** : `2026-05-23-web-refactor-p2/code-review.json` verdict `APPROVED`, weighted mean **88.55 / 100** (kiss 87 / dry 90 / coherence 82 / a11y 91 / securityRobustness 92). Threshold ≥85 atteint.
- **Tests** : 565/566 tests passent (1 pre-existing skip) ; nouveaux `BaseModal.test.tsx` (12 cas) + `ModalActions.test.tsx` (8 cas) green. Frozen-test sha256 match 2/2.
- **Sentinels** : D1 (`fixed inset-0 z-[60]` scaffold hors BaseModal = 0 hits) + D2 (`role="dialog"` hors BaseModal = 0 hits) passent.
- **Build + lint** : `pnpm build` + `pnpm lint` exit 0 (`cd museum-web`).
- **Bundle** : zero dep ajoutée (`git diff museum-web/package.json museum-web/pnpm-lock.yaml` = 0 lines).

---

## References

- **Audit DRY/KISS** — [`team-reports/2026-05-23-web-dry-audit/audit-log.md`](../../team-reports/2026-05-23-web-dry-audit/audit-log.md) (Batch 2C, signature BaseModal proposée § lignes 233-256)
- **Spec** — [`team-state/2026-05-23-web-refactor-p2/spec.md`](../../.claude/skills/team/team-state/2026-05-23-web-refactor-p2/spec.md) §1, §4, §6 NFR, §8 OQ-1/2/3
- **Design** — [`team-state/2026-05-23-web-refactor-p2/design.md`](../../.claude/skills/team/team-state/2026-05-23-web-refactor-p2/design.md) §0, §1, §4 mapping LOC
- **Code review JSON** (APPROVED, weighted 88.55) — [`team-reports/2026-05-23-web-refactor-p2/code-review.json`](../../.claude/skills/team/team-reports/2026-05-23-web-refactor-p2/code-review.json)
- **Lib-docs** — [`lib-docs/react/PATTERNS.md`](../../lib-docs/react/PATTERNS.md) (React 19 `useId`, ref-as-prop pattern)
- **WAI-ARIA APG Dialog** — <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/> (référence externe NFR-A11Y-3)
- **Phase 1 base** — commit `40e0671e9` (livrables `<Spinner>`, `<AlertBanner>`, `<FormFieldError>`, `apiPut`, `lib/validation.ts`)
- **Related ADRs** — [ADR-053](ADR-053-apple-5-1-2-i-granular-consent.md) (consent dismiss policy mobile), [ADR-055](ADR-055-bottomsheet-router-state-machine.md) (BottomSheetRouter state machine mobile), [ADR-066](ADR-066-rn-modal-pointer-events-routing.md) (RN overlay pointer-events routing) — tous mobile ; ADR-067 est le **premier ADR scope museum-web**.

# Lessons — @shopify/flash-list (v2.0.2)

Audit 2026-05-18 : **APPROVED_WITH_NITS** — v2 migration FULLY COMPLETE (zero v1 props residue).

## ⚠️ Recurring MINOR : `ListEmptyComponent` / `ListHeaderComponent` / `ListFooterComponent` inline JSX (4/6 files)
- **Sites** : `reviews.tsx:255,257` ; `ticket-detail.tsx:219-223` ; `ChatMessageList.tsx:255+` ; `TicketsListView.tsx:178+`.
- **Impact** : recreated each render → defeats FlashList recycling pool warmup on re-render. PATTERNS.md §3 item 6 "memoize ALL props passed to FlashList".
- **Fix TD-FL-01** : hoist OR `useMemo` the JSX elements.

## ⚠️ F-CHAT INFO : Chat list good candidate `maintainVisibleContentPosition`
- `ChatMessageList.tsx` + `ticket-detail.tsx` manual `onContentSizeChange→scrollToEnd` — v2 ships `maintainVisibleContentPosition` (PATTERNS §2) pour smoother anchor on incoming messages.
- **Fix TD-FL-02** : V1.1 polish.

## ✅ v1→v2 migration EXEMPLAIRE
- **ZERO** v1 deprecated props residual : `estimatedItemSize`/`estimatedListSize`/`estimatedFirstItemOffset`/`onBlankArea`/`disableAutoLayout`/`MasonryFlashList`/`CellContainer`/`getColumnFlex`/`layout.size`/`getItemLayout`/`initialNumToRender`/`windowSize`/`columnWrapperStyle`/`listKey` — TOUS absents across 6 callsites
- `FlashListRef<T>` adopted (ticket-detail.tsx:52 + ChatMessageList.tsx:89) — no legacy `FlashList<T>` ref generic
- `getItemType` used on heterogeneous lists (ticket-detail, conversations, ChatMessageList) — module-scope const for stable ref
- `keyExtractor` stable (always item.id-based)
- `renderItem` always memoized via useCallback
- `extraData` correctly set on conversations.tsx (editMode + selectedIds.size)
- Sticky headers + viewabilityConfig used appropriately
- New Architecture requirement satisfied (RN 0.83 + Expo SDK 55 mandate Fabric)

## 2026-05-20 — refresh (lib-doc-curator, UFR-022)

Re-audit of 6 callsites + version-drift scan. Pin still **2.0.2** ; **npm latest = 2.3.1** (2026-03-23).

### Version drift 2.0.2 → 2.3.1 (no security advisories on any 2.x)
- **2.2.1 fixes sticky-header-disappears on RN 0.83 (PR #2069)** — Musaium's EXACT RN version. Strongest single argument for a bump if any list uses sticky headers (ticket-detail / conversations headers).
- 2.2.0 adds `stickyHeaderConfig` + `onChangeStickyIndex` ; 2.3.0 adds `inverted` ; 2.3.1 fixes scroll-position-on-prepend + `maintainVisibleContentPosition` for horizontal lists.
- 2.1.0 now WARNS at runtime if `keyExtractor` missing while `maintainVisibleContentPosition` set — relevant to TD-FL-02 (chat anchor). All our lists already set `keyExtractor`, so no warning would fire.
- Bump is patch/minor, no documented breaking changes → low-risk, but OUT OF SCOPE for a doc refresh. Flag to team.

### TD-FL-01 still OPEN — inline `ListEmptyComponent` JSX
- `ChatMessageList.tsx:277-289` still inlines `<EmptyState .../>` as `ListEmptyComponent` (recreated each render). Same pattern likely on `reviews.tsx` / `ticket-detail.tsx` / `TicketsListView.tsx`. Hoist or `useMemo`. MINOR perf.

### TD-FL-02 still OPEN — chat could adopt `maintainVisibleContentPosition`
- `ChatMessageList.tsx:271` still uses manual `onContentSizeChange` for anchor. v2's `maintainVisibleContentPosition` (improved in 2.3.1) is the idiomatic replacement — but requires the bump. V1.1 polish.

### Wave 5 FlatList debt — 3 sites, only 1 worth migrating
- `MuseumPickerScreen.tsx:325` — **genuine candidate** (variable-length vertical list). Migrate.
- `onboarding.tsx:118` (fixed-count horizontal pager) + `ImageCompareCarousel.tsx:62` (tiny horizontal carousel) — **low value**: recycling pays off on long lists, not short pagers. Migrate only for consistency, not perf. Don't treat all 11/3 sites as equal debt.

### Confirmed still EXEMPLAIRE
- Zero v1-prop residue (re-grepped `estimatedItemSize`/`MasonryFlashList`/`CellContainer`/`getColumnFlex`/`onBlankArea` = none). `FlashListRef<T>` + memoized `renderItem` + stable `getItemType` + `keyExtractor={item.id}` everywhere.

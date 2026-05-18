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

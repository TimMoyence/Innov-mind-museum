// Canonical template (audit-360-s1 T1.12) — orchestration only.
// State/data : features/support/application/useTicketsListScreen
// Markup    : features/support/ui/TicketsListView
//
// Pattern: hook + view split for screens >300L. See features/support/{application,ui}/
// for canonical example. Apply to remaining 6 screens >300L in V1.1 sprint 1:
//   - chat/[sessionId].tsx (504L)
//   - carnet/[sessionId].tsx (409L)
//   - preferences.tsx (387L)
//   - reviews.tsx (385L)
//   - ticket-detail.tsx (379L)
//   - settings.tsx (376L)

import { useTicketsListScreen } from '@/features/support/application/useTicketsListScreen';
import { TicketsListView } from '@/features/support/ui/TicketsListView';

/** Renders the paginated ticket list screen with status filter pills, FAB to create, and navigation to detail. */
export default function TicketsScreen() {
  const state = useTicketsListScreen();
  return <TicketsListView {...state} />;
}

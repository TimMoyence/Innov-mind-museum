import { useTicketsListScreen } from '@/features/support/application/useTicketsListScreen';
import { TicketsListView } from '@/features/support/ui/TicketsListView';

export default function TicketsScreen() {
  const state = useTicketsListScreen();
  return <TicketsListView {...state} />;
}

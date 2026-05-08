import GrafanaIframe from '@/components/ops/GrafanaIframe';

/**
 * Ops-only Grafana panel — embeds the `chat-latency` dashboard (C1.1
 * deliverable). Intentionally minimal copy ; the dashboard itself is the
 * UX. The route is super-admin gated by `layout.tsx` ; an `admin` role
 * (only Tim today) may view ops data across all tenants. Multi-tenant
 * scoped panels for B2B museum-admins land in W3.2 with a different
 * delivery (BE proxy + Recharts).
 */
export default function OpsGrafanaPage() {
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Chat latency — ops view</h1>
        <p className="mt-1 text-text-secondary">
          Self-hosted Grafana panel embedded same-origin. Data scope: all tenants. Restricted
          to <code>admin</code> role. See{' '}
          <code>docs/OPS_DEPLOYMENT.md</code> §Grafana iframe limitation for the threat model.
        </p>
      </header>
      <GrafanaIframe
        dashboardUid="chat-latency"
        title="Chat latency dashboard (Grafana, kiosk mode)"
        height="80vh"
      />
    </section>
  );
}

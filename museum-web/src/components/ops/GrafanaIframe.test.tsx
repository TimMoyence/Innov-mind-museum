/**
 * GrafanaIframe — sanity tests on the iframe attributes that are
 * load-bearing for the security posture (sandbox, src construction,
 * accessibility title).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GrafanaIframe from './GrafanaIframe';

describe('GrafanaIframe', () => {
  it('renders the iframe with the expected accessible title', () => {
    const { getByTitle } = render(
      <GrafanaIframe dashboardUid="chat-latency" title="Chat latency dashboard" />,
    );
    const frame = getByTitle('Chat latency dashboard');
    expect(frame).toBeInstanceOf(HTMLIFrameElement);
  });

  it('points to the same-origin /grafana/d/<uid> path with kiosk param', () => {
    const { getByTitle } = render(
      <GrafanaIframe dashboardUid="chat-latency" title="t" />,
    );
    const src = (getByTitle('t') as HTMLIFrameElement).getAttribute('src');
    expect(src).toBe('/grafana/d/chat-latency?kiosk');
  });

  it('appends extra query string parameters when provided', () => {
    const { getByTitle } = render(
      <GrafanaIframe dashboardUid="chat-latency" title="t" query="from=now-1h&to=now" />,
    );
    const src = (getByTitle('t') as HTMLIFrameElement).getAttribute('src');
    expect(src).toBe('/grafana/d/chat-latency?kiosk&from=now-1h&to=now');
  });

  it('uses a strict sandbox: scripts + same-origin only (no forms / popups / top-nav)', () => {
    const { getByTitle } = render(<GrafanaIframe dashboardUid="x" title="t" />);
    const sandbox = (getByTitle('t') as HTMLIFrameElement).getAttribute('sandbox');
    expect(sandbox).toBe('allow-scripts allow-same-origin');
  });

  it('honours a custom height (number → px)', () => {
    const { getByTitle } = render(
      <GrafanaIframe dashboardUid="x" title="t" height={500} />,
    );
    expect((getByTitle('t') as HTMLIFrameElement).style.height).toBe('500px');
  });

  it('honours a custom height (string → as-is)', () => {
    const { getByTitle } = render(
      <GrafanaIframe dashboardUid="x" title="t" height="60vh" />,
    );
    expect((getByTitle('t') as HTMLIFrameElement).style.height).toBe('60vh');
  });

  it('encodes the dashboard UID so a hostile UID cannot escape the path', () => {
    const { getByTitle } = render(
      <GrafanaIframe dashboardUid="evil/../escape" title="t" />,
    );
    const src = (getByTitle('t') as HTMLIFrameElement).getAttribute('src');
    expect(src).toBe('/grafana/d/evil%2F..%2Fescape?kiosk');
  });
});

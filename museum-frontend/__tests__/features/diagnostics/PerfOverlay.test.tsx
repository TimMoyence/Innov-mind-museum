import '@/__tests__/helpers/test-utils';
import { render } from '@testing-library/react-native';
import { act } from 'react';

import { PerfOverlay } from '@/features/diagnostics/PerfOverlay';
import { perfStore } from '@/features/diagnostics/perfStore';

describe('PerfOverlay', () => {
  beforeEach(() => {
    perfStore.reset();
  });

  it('renders three rows with formatted FPS P50, FPS P5 and Cluster ms', () => {
    perfStore.updateFps(60.4, 12.7);
    perfStore.markRenderStart();
    perfStore.markRenderEnd();

    const { getByText } = render(<PerfOverlay />);

    expect(getByText(/^FPS P50 \d+$/)).toBeTruthy();
    expect(getByText(/^FPS P5 \d+$/)).toBeTruthy();
    expect(getByText(/^Cluster \d+ms$/)).toBeTruthy();
  });

  it('formats zero or negative FPS as "--"', () => {
    // store starts at 0/0 after reset
    const { getByText } = render(<PerfOverlay />);

    expect(getByText('FPS P50 --')).toBeTruthy();
    expect(getByText('FPS P5 --')).toBeTruthy();
    expect(getByText('Cluster --')).toBeTruthy();
  });

  it('rounds positive FPS values to whole numbers', () => {
    perfStore.updateFps(59.6, 28.4);

    const { getByText } = render(<PerfOverlay />);

    expect(getByText('FPS P50 60')).toBeTruthy();
    expect(getByText('FPS P5 28')).toBeTruthy();
  });

  it('exposes an accessibility summary that names P50, P5 and Cluster', () => {
    perfStore.updateFps(48, 22);

    const { getByLabelText } = render(<PerfOverlay />);
    const summary = getByLabelText(/MapLibre perf/);

    const label = String(summary.props.accessibilityLabel ?? '');
    expect(summary.props.accessibilityRole).toBe('summary');
    expect(label).toContain('P50 48 FPS');
    expect(label).toContain('P5 22 FPS');
    expect(label).toContain('Cluster --');
  });

  it('updates rendered text when perfStore publishes a new FPS sample', () => {
    const { getByText } = render(<PerfOverlay />);

    act(() => {
      perfStore.updateFps(30, 15);
    });

    expect(getByText('FPS P50 30')).toBeTruthy();
    expect(getByText('FPS P5 15')).toBeTruthy();
  });

  it('marks the overlay as non-interactive (pointerEvents=none)', () => {
    const { getByLabelText } = render(<PerfOverlay />);
    const summary = getByLabelText(/MapLibre perf/);

    expect(summary.props.pointerEvents).toBe('none');
  });
});

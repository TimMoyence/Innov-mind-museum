import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { perfStore, type PerfMetrics } from './perfStore';
import { useFpsMeter } from './useFpsMeter';

const formatFps = (fps: number): string => (fps > 0 ? fps.toFixed(0) : '--');
const formatMs = (ms: number | null): string => (ms === null ? '--' : `${ms.toFixed(0)}ms`);

/**
 * Dev-only heads-up display rendered on top of the MapLibre map. Shows the
 * rolling P50/P5 FPS pair and the last cluster-render bracket. Returns null
 * in production so the View tree, the rAF loop and the store subscription
 * never run in a release build.
 *
 * Consumers still need to call `perfStore.markRenderStart()` and
 * `perfStore.markRenderEnd()` around the bracket they want to measure — this
 * component only displays what the store has.
 */
export const PerfOverlay = () => {
  const [metrics, setMetrics] = useState<PerfMetrics>(() => perfStore.get());
  useFpsMeter(__DEV__);

  useEffect(() => {
    if (!__DEV__) return undefined;
    return perfStore.subscribe(setMetrics);
  }, []);

  if (!__DEV__) return null;

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      accessibilityRole="summary"
      accessibilityLabel={`MapLibre perf. P50 ${formatFps(metrics.fpsP50)} FPS. P5 ${formatFps(metrics.fpsP5)} FPS. Cluster ${formatMs(metrics.lastRenderMs)}.`}
    >
      <Text style={styles.row}>FPS P50 {formatFps(metrics.fpsP50)}</Text>
      <Text style={styles.row}>FPS P5 {formatFps(metrics.fpsP5)}</Text>
      <Text style={styles.row}>Cluster {formatMs(metrics.lastRenderMs)}</Text>
    </View>
  );
};

const HUD_BACKGROUND = 'rgba(0,0,0,0.6)';
const HUD_FOREGROUND = '#ffffff';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: HUD_BACKGROUND,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  row: {
    color: HUD_FOREGROUND,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    lineHeight: 14,
  },
});

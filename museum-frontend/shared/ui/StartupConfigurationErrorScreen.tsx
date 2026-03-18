import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ApiConfigurationSnapshot } from '@/services/apiConfig';

type StartupConfigurationErrorScreenProps = {
  error: Error;
  snapshot: ApiConfigurationSnapshot;
  containerStyle?: StyleProp<ViewStyle>;
};

const fallback = 'Not configured';

/** Displays a diagnostic error screen shown when the app cannot start due to missing or invalid build configuration. */
export function StartupConfigurationErrorScreen({
  error,
  snapshot,
  containerStyle,
}: StartupConfigurationErrorScreenProps) {
  return (
    <SafeAreaView style={[styles.safeArea, containerStyle]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Startup configuration error</Text>
        </View>

        <Text style={styles.title}>The app cannot start with this build.</Text>
        <Text style={styles.message}>{error.message}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current build context</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Build variant</Text>
            <Text style={styles.value}>{snapshot.buildVariant}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>API environment</Text>
            <Text style={styles.value}>{snapshot.apiEnvironment}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Resolved base URL</Text>
            <Text style={styles.value}>{snapshot.resolvedBaseUrl}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Staging URL</Text>
            <Text style={styles.value}>
              {snapshot.stagingBaseUrl || fallback}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Production URL</Text>
            <Text style={styles.value}>
              {snapshot.productionBaseUrl || fallback}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How to fix it</Text>
          <Text style={styles.step}>
            1. Set `EXPO_PUBLIC_API_BASE_URL_STAGING` on the Expo project.
          </Text>
          <Text style={styles.step}>
            2. Set `EXPO_PUBLIC_API_BASE_URL_PROD` on the Expo project.
          </Text>
          <Text style={styles.step}>
            3. Rebuild the app after the environment variables are available to
            EAS Build.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#130f0d',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#70584a',
    backgroundColor: '#231915',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#f5d7c2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff7f1',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  message: {
    color: '#e4cfc2',
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3b2d25',
    backgroundColor: '#1b1411',
    padding: 18,
    gap: 12,
  },
  cardTitle: {
    color: '#fff7f1',
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    gap: 4,
  },
  label: {
    color: '#c7a58e',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  value: {
    color: '#f6ebe4',
    fontSize: 15,
    lineHeight: 22,
  },
  step: {
    color: '#f6ebe4',
    fontSize: 15,
    lineHeight: 22,
  },
});

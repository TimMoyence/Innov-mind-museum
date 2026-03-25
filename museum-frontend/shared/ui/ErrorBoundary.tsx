import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';
import i18n from '@/shared/i18n/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Top-level error boundary that catches unhandled JS errors and renders
 * a recovery screen instead of crashing the entire app.
 *
 * Must be a class component — React does not support error boundaries as
 * function components.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info.componentStack ?? undefined } },
    });
  }

  private handleReload = async () => {
    try {
      if (!__DEV__) {
        await Updates.reloadAsync();
      }
    } catch {
      // Updates.reloadAsync may not be available in dev or bare workflow
    }
    // Fallback: reset state to re-mount the tree
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>!</Text>
        <Text style={styles.title}>
          {i18n.t('error.boundaryTitle', { defaultValue: 'Something went wrong' })}
        </Text>
        <Text style={styles.subtitle}>
          {i18n.t('error.boundarySubtitle', { defaultValue: 'The app encountered an unexpected error. Your data is safe.' })}
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => void this.handleReload()}
          accessibilityRole="button"
          accessibilityLabel={i18n.t('error.boundaryReload', { defaultValue: 'Reload' })}
        >
          <Text style={styles.buttonText}>
            {i18n.t('error.boundaryReload', { defaultValue: 'Reload' })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

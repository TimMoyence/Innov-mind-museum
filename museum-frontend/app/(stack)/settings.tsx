import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';

import {
  GuideLevel,
  loadRuntimeSettings,
  saveDefaultLocale,
  saveDefaultMuseumMode,
  saveGuideLevel,
} from '@/features/settings/runtimeSettings';
import { useAuth } from '@/context/AuthContext';

const GUIDE_LEVELS: GuideLevel[] = ['beginner', 'intermediate', 'expert'];

export default function SettingsScreen() {
  const { logout } = useAuth();
  const [locale, setLocale] = useState('en-US');
  const [museumMode, setMuseumMode] = useState(true);
  const [guideLevel, setGuideLevel] = useState<GuideLevel>('beginner');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadRuntimeSettings().then((settings) => {
      setLocale(settings.defaultLocale);
      setMuseumMode(settings.defaultMuseumMode);
      setGuideLevel(settings.guideLevel);
    });
  }, []);

  const save = async () => {
    await Promise.all([
      saveDefaultLocale(locale),
      saveDefaultMuseumMode(museumMode),
      saveGuideLevel(guideLevel),
    ]);

    setStatus(`Saved (${locale.trim() || 'en-US'})`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile & Guide Settings</Text>

      <Text style={styles.label}>Language (locale)</Text>
      <Text style={styles.hint}>
        Applies to AI response language and chat timestamp formatting.
      </Text>
      <TextInput
        value={locale}
        onChangeText={setLocale}
        placeholder='en-US'
        autoCapitalize='none'
        style={styles.input}
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Guided Museum Mode</Text>
        <Switch value={museumMode} onValueChange={setMuseumMode} />
      </View>

      <Text style={styles.label}>AI Guide Level</Text>
      <View style={styles.levelRow}>
        {GUIDE_LEVELS.map((level) => (
          <Pressable
            key={level}
            style={[
              styles.levelButton,
              guideLevel === level && styles.levelButtonActive,
            ]}
            onPress={() => setGuideLevel(level)}
          >
            <Text
              style={[
                styles.levelButtonText,
                guideLevel === level && styles.levelButtonTextActive,
              ]}
            >
              {level}
            </Text>
          </Pressable>
        ))}
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <Pressable style={styles.button} onPress={save}>
        <Text style={styles.buttonText}>Save Settings</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={() => router.replace('/(tabs)/home')}>
        <Text style={styles.secondaryButtonText}>Back to Home</Text>
      </Pressable>

      <Pressable style={styles.logoutButton} onPress={() => void logout()}>
        <Text style={styles.logoutButtonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF5FF',
    padding: 24,
    gap: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#4C1D95',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5B21B6',
  },
  hint: {
    fontSize: 12,
    color: '#6D28D9',
    marginTop: -4,
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
  },
  switchRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelRow: {
    flexDirection: 'row',
    gap: 8,
  },
  levelButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
  },
  levelButtonActive: {
    backgroundColor: '#4C1D95',
    borderColor: '#4C1D95',
  },
  levelButtonText: {
    color: '#4C1D95',
    fontWeight: '600',
  },
  levelButtonTextActive: {
    color: '#FFFFFF',
  },
  status: {
    color: '#166534',
    fontWeight: '600',
  },
  button: {
    marginTop: 14,
    backgroundColor: '#4C1D95',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#4C1D95',
    fontWeight: '600',
    fontSize: 15,
  },
  logoutButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
  },
  logoutButtonText: {
    color: '#B91C1C',
    fontWeight: '700',
    fontSize: 15,
  },
});

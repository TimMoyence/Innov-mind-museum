import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'auth.biometricEnabled';

export async function getBiometricEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEY);
  return val === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, String(enabled));
}

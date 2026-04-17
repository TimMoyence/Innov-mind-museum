import { Linking, Platform } from 'react-native';

interface OpenInNativeMapsInput {
  latitude: number | string | null | undefined;
  longitude: number | string | null | undefined;
  name?: string | null;
}

export const openInNativeMaps = ({ latitude, longitude, name }: OpenInNativeMapsInput): void => {
  const lat = typeof latitude === 'string' ? Number(latitude) : latitude;
  const lng = typeof longitude === 'string' ? Number(longitude) : longitude;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return;

  const query = encodeURIComponent(name ?? '');
  const url =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?ll=${String(lat)},${String(lng)}&q=${query}`
      : `https://www.google.com/maps/search/?api=1&query=${String(lat)},${String(lng)}`;
  void Linking.openURL(url);
};

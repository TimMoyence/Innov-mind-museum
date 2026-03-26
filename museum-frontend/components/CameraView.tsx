import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import type { CameraType} from 'expo-camera';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { cameraStyles } from '@/app/styles/cameraStyles';

interface CameraViewProps {
  onClose: () => void;
  onCapture: (uri: string) => void;
}

/** Renders a full-screen camera view with capture and close controls, handling permission requests. */
export const CustomCameraView = ({ onClose, onCapture }: CameraViewProps) => {
  const { t } = useTranslation();
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing] = useState<CameraType>('back');

  const capturePhoto = async () => {
    if (!cameraRef.current || !cameraReady) {
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCapture(photo.uri);
    } catch {
      // Camera capture failure — silently ignored, user can retry
    }
  };

  if (!permission) {
    return (
      <View style={cameraStyles.container}>
        <Text>{t('camera.requesting_permission')}</Text>
        <TouchableOpacity
          onPress={onClose}
          style={{ marginTop: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.camera.close')}
        >
          <Text>{t('camera.close')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={cameraStyles.container}>
        <Text>{t('camera.no_access')}</Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={{ marginTop: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.camera.grant_permission')}
        >
          <Text>{t('camera.grant_permission')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClose}
          style={{ marginTop: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.camera.close')}
        >
          <Text>{t('camera.close')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={cameraStyles.cameraContainer}>
      <StatusBar barStyle='light-content' />
      <CameraView
        style={cameraStyles.camera}
        ref={cameraRef}
        facing={facing}
        onCameraReady={() => { setCameraReady(true); }}
      >
        <SafeAreaView style={cameraStyles.cameraContent}>
          <View style={cameraStyles.cameraHeader}>
            <TouchableOpacity
              style={cameraStyles.backButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.camera.close')}
            >
              <Feather name='chevron-left' size={26} color='white' />
            </TouchableOpacity>
            <Text style={cameraStyles.cameraTitle}>{t('camera.ar_mode')}</Text>
          </View>

          <View style={cameraStyles.vrControls}>
            <TouchableOpacity
              style={cameraStyles.vrButton}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.camera.grid')}
            >
              <Feather name='grid' size={22} color='white' />
            </TouchableOpacity>

            <TouchableOpacity
              style={cameraStyles.captureButton}
              onPress={capturePhoto}
              disabled={!cameraReady}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.camera.capture')}
              accessibilityHint={t('a11y.camera.capture_hint')}
            >
              <View style={cameraStyles.captureButtonInner} />
            </TouchableOpacity>

            <TouchableOpacity
              style={cameraStyles.vrButton}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.camera.switch_camera')}
            >
              <Feather name='camera' size={22} color='white' />
            </TouchableOpacity>
          </View>

          <View style={cameraStyles.navArrows}>
            <View style={cameraStyles.navArrowUp} />
            <View style={cameraStyles.navArrowDown} />
            <View style={cameraStyles.navArrowLeft} />
            <View style={cameraStyles.navArrowRight} />
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
};

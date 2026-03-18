import { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { CameraType, CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';

import { cameraStyles } from '@/app/styles/cameraStyles';

interface CameraViewProps {
  onClose: () => void;
  onCapture: (uri: string) => void;
}

/** Renders a full-screen camera view with capture and close controls, handling permission requests. */
export const CustomCameraView = ({ onClose, onCapture }: CameraViewProps) => {
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
      onCapture(photo.uri);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error taking picture:', error);
    }
  };

  if (!permission) {
    return (
      <View style={cameraStyles.container}>
        <Text>Requesting camera permission...</Text>
        <TouchableOpacity onPress={onClose} style={{ marginTop: 12 }}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={cameraStyles.container}>
        <Text>No access to camera</Text>
        <TouchableOpacity onPress={requestPermission} style={{ marginTop: 12 }}>
          <Text>Grant permission</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={{ marginTop: 12 }}>
          <Text>Close</Text>
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
        onCameraReady={() => setCameraReady(true)}
      >
        <SafeAreaView style={cameraStyles.cameraContent}>
          <View style={cameraStyles.cameraHeader}>
            <TouchableOpacity style={cameraStyles.backButton} onPress={onClose}>
              <Feather name='chevron-left' size={26} color='white' />
            </TouchableOpacity>
            <Text style={cameraStyles.cameraTitle}>AR Mode</Text>
          </View>

          <View style={cameraStyles.vrControls}>
            <TouchableOpacity style={cameraStyles.vrButton}>
              <Feather name='grid' size={22} color='white' />
            </TouchableOpacity>

            <TouchableOpacity
              style={cameraStyles.captureButton}
              onPress={capturePhoto}
              disabled={!cameraReady}
            >
              <View style={cameraStyles.captureButtonInner} />
            </TouchableOpacity>

            <TouchableOpacity style={cameraStyles.vrButton}>
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

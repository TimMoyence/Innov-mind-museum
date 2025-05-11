import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
} from "react-native";
// Importation correcte selon la documentation actuelle
import { CameraType, CameraView, Camera as ExpoCamera, useCameraPermissions } from "expo-camera";
import { Feather } from "@expo/vector-icons";
import { cameraStyles } from "../../museum-frontend/app/styles/cameraStyles";

interface CameraViewProps {
  onClose: () => void;
  onCapture: (uri: string) => void;
}

export const CustomCameraView: React.FC<CameraViewProps> = ({
  onClose,
  onCapture,
}) => {
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');

  const capturePhoto = async () => {
    if (cameraRef.current && cameraReady) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.9,
          exif: true,
        });
        onCapture(photo.uri);
      } catch (error) {
        console.error("Error taking picture:", error);
      }
    }
  };

  if (!permission) {
    // Les permissions de caméra sont toujours en cours de chargement
    return (
      <View style={cameraStyles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    // Les permissions de caméra ne sont pas accordées
    return (
      <View style={cameraStyles.container}>
        <Text>No access to camera</Text>
        <TouchableOpacity onPress={requestPermission}>
          <Text>Grant permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={cameraStyles.cameraContainer}>
      <StatusBar barStyle="light-content" />
      <CameraView
        style={cameraStyles.camera}
        ref={cameraRef}
        facing={facing}
        onCameraReady={() => setCameraReady(true)}
      >
        <SafeAreaView style={cameraStyles.cameraContent}>
          <View style={cameraStyles.cameraHeader}>
            <TouchableOpacity style={cameraStyles.backButton} onPress={onClose}>
              <Feather name="chevron-left" size={26} color="white" />
            </TouchableOpacity>
            <Text style={cameraStyles.cameraTitle}>AR Mode</Text>
          </View>

          <View style={cameraStyles.vrControls}>
            <TouchableOpacity style={cameraStyles.vrButton}>
              <Feather name="grid" size={22} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={cameraStyles.captureButton}
              onPress={capturePhoto}
              disabled={!cameraReady}
            >
              <View style={cameraStyles.captureButtonInner} />
            </TouchableOpacity>

            <TouchableOpacity style={cameraStyles.vrButton}>
              <Feather name="camera" size={22} color="white" />
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
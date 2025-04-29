import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
} from "react-native";
import { Camera, CameraType } from "expo-camera";
import { Feather } from "@expo/vector-icons";
import { cameraStyles } from "../../museum-frontend/app/styles/cameraStyles";

interface CameraViewProps {
  onClose: () => void;
  onCapture: (uri: string) => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onClose,
  onCapture,
}) => {
  const cameraRef = useRef<Camera | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  React.useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

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

  if (hasPermission === null) {
    return (
      <View style={cameraStyles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={cameraStyles.container}>
        <Text>No access to camera</Text>
      </View>
    );
  }

  return (
    <View style={cameraStyles.cameraContainer}>
      <StatusBar barStyle="light-content" />
      <Camera
        style={cameraStyles.camera}
        ref={cameraRef}
        type={CameraType.back}
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
      </Camera>
    </View>
  );
};

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { RadioButton } from '../../components/RadioButton';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export default function ConversationsScreen() {
  const [selectedLevel, setSelectedLevel] = useState('');
  const [hasPermission, setHasPermission] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [photo, setPhoto] = useState(null);

  const requestPermissions = async () => {
    if (Platform.OS === 'web') {
      return;
    }
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const handleLevelSelect = (level: string) => {
    setSelectedLevel(level);
    requestPermissions();
  };

  const takePicture = async () => {
    if (Platform.OS === 'web') {
      // For web, use file picker instead
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        setPhoto(result.assets[0].uri);
        setShowCamera(false);
      }
      return;
    }

    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status === 'granted') {
      setShowCamera(true);
    }
  };

  if (showCamera && Platform.OS !== 'web') {
    return (
      <Camera style={styles.camera}>
        <View style={styles.cameraControls}>
          <TouchableOpacity 
            style={styles.closeButton}
            onPress={() => setShowCamera(false)}
          >
            <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.captureButton}
            onPress={async () => {
              if (cameraRef.current) {
                const photo = await cameraRef.current.takePictureAsync();
                setPhoto(photo.uri);
                setShowCamera(false);
              }
            }}
          >
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>
      </Camera>
    );
  }

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1577083552431-6e5fd75a9475' }}
      style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <BlurView intensity={60} tint="light" style={styles.content}>
          <Text style={styles.title}>Art Discussion</Text>
          
          <View style={styles.levelSelector}>
            <Text style={styles.subtitle}>Select your expertise level:</Text>
            {LEVELS.map((level) => (
              <RadioButton
                key={level}
                label={level}
                selected={selectedLevel === level}
                onSelect={() => handleLevelSelect(level)}
              />
            ))}
          </View>

          {selectedLevel && (
            <TouchableOpacity 
              style={styles.cameraButton}
              onPress={takePicture}
            >
              <BlurView intensity={40} tint="light" style={styles.cameraButtonContent}>
                <Ionicons name="camera" size={24} color="#1a1a1a" />
                <Text style={styles.cameraButtonText}>Take a Photo of Artwork</Text>
              </BlurView>
            </TouchableOpacity>
          )}

          {photo && (
            <View style={styles.photoContainer}>
              <ImageBackground 
                source={{ uri: photo }} 
                style={styles.photoPreview}
                imageStyle={styles.photoPreviewImage}
              >
                <BlurView intensity={40} tint="light" style={styles.photoInfo}>
                  <Text style={styles.photoLevel}>Level: {selectedLevel}</Text>
                </BlurView>
              </ImageBackground>
            </View>
          )}

          <View style={styles.discussionList}>
            <Text style={styles.subtitle}>Recent Discussions</Text>
            <TouchableOpacity style={styles.discussionItem}>
              <BlurView intensity={40} tint="light" style={styles.itemContent}>
                <Text style={styles.itemTitle}>The Starry Night - Van Gogh</Text>
                <Text style={styles.itemMeta}>5 participants • Intermediate</Text>
              </BlurView>
            </TouchableOpacity>

            <TouchableOpacity style={styles.discussionItem}>
              <BlurView intensity={40} tint="light" style={styles.itemContent}>
                <Text style={styles.itemTitle}>Mona Lisa - Da Vinci</Text>
                <Text style={styles.itemMeta}>3 participants • Beginner</Text>
              </BlurView>
            </TouchableOpacity>
          </View>
        </BlurView>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flex: 1,
    margin: 20,
    borderRadius: 15,
    overflow: 'hidden',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 15,
  },
  levelSelector: {
    marginBottom: 30,
  },
  discussionList: {
    flex: 1,
  },
  discussionItem: {
    marginBottom: 15,
    borderRadius: 10,
    overflow: 'hidden',
  },
  itemContent: {
    padding: 15,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 5,
  },
  itemMeta: {
    fontSize: 14,
    color: '#666',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    flex: 1,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingBottom: 30,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    left: 20,
  },
  cameraButton: {
    marginBottom: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cameraButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    justifyContent: 'center',
  },
  cameraButtonText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: '600',
  },
  photoContainer: {
    marginBottom: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  photoPreview: {
    height: 200,
    justifyContent: 'flex-end',
  },
  photoPreviewImage: {
    borderRadius: 10,
  },
  photoInfo: {
    padding: 15,
  },
  photoLevel: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600',
  },
});
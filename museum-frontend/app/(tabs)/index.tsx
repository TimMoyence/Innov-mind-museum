import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  Animated,
  ImageBackground,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { homeStyles } from '../styles/homeStyles';

export default function HomeScreen() {
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: false,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: false,
      }),
    ]).start();
  }, []);

  return (
    <View style={homeStyles.welcomeContainer}>
      <StatusBar barStyle='light-content' />
      <ImageBackground
        source={{
          uri: 'https://images.unsplash.com/photo-1638186824584-6d6367254927?auto=format&fit=crop&w=1080',
        }}
        style={homeStyles.welcomeBackground}
      >
        <View style={homeStyles.welcomeOverlay}>
          <Animated.View
            style={[
              homeStyles.welcomeContent,
              {
                opacity: opacityAnim,
                transform: [{ translateY: translateYAnim }],
              },
            ]}
          >
            <View style={homeStyles.logoContainer}>
              <Text style={homeStyles.logoText}>NOA</Text>
              <Text style={homeStyles.logoSubText}>VISIT</Text>
            </View>

            <Text style={homeStyles.welcomeDescription}>
              Digital Art Discussion Companion App
            </Text>

            <TouchableOpacity
              style={homeStyles.enterButton}
              onPress={() => router.push('/(tabs)/conversations')}
            >
              <Text style={homeStyles.enterButtonText}>Enter</Text>
              <Feather name='log-in' size={18} color='#111' />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </ImageBackground>
    </View>
  );
}

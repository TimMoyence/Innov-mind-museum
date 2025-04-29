import { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  Dimensions,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LevelSelector } from "../../components/LevelSelector";
import { DiscussionItem } from "../../components/DiscussionItem";
import { mainStyles } from "../styles/mainStyles";
import { CameraView } from "@/components/CameraView";

const LEVELS = ["Beginner", "Intermediate", "Advanced"];

export default function ConversationsScreen() {
  const [selectedLevel, setSelectedLevel] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("All");

  const handleLevelSelect = (level: string) => {
    setSelectedLevel(level);
  };

  const takePicture = async () => {
    setShowCamera(true);
  };

  const handlePhotoCapture = (uri: string) => {
    setPhoto(uri);
    setShowCamera(false);
  };

  // Camera mode screen (VR style)
  if (showCamera) {
    return (
      <CameraView 
        onClose={() => setShowCamera(false)} 
        onCapture={handlePhotoCapture}
      />
    );
  }

  // Main screen - Inspired by MUSEUR main view
  return (
    <SafeAreaView style={mainStyles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={mainStyles.header}>
        <TouchableOpacity 
          style={mainStyles.menuButton}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={24} color="#111" />
        </TouchableOpacity>
        
        <View style={mainStyles.logoHeaderContainer}>
          <Text style={mainStyles.logoHeader}>★ ARTDISCUSS ★</Text>
        </View>
        
        <TouchableOpacity style={mainStyles.searchButton}>
          <Feather name="search" size={24} color="#111" />
        </TouchableOpacity>
      </View>

      <View style={mainStyles.tabs}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={mainStyles.tabsContent}
        >
          {["All", "Paintings", "Sculpture", "Photography"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[mainStyles.tabButton, activeTab === tab && mainStyles.activeTabButton]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[mainStyles.tabText, activeTab === tab && mainStyles.activeTabText]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView 
        style={mainStyles.content}
        contentContainerStyle={mainStyles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Expertise Level Selection */}
        <View style={mainStyles.sectionContainer}>
          <View style={mainStyles.sectionHeader}>
            <Text style={mainStyles.sectionTitle}>Select Your Level</Text>
          </View>
          
          <LevelSelector
            levels={LEVELS}
            selectedLevel={selectedLevel}
            onSelectLevel={handleLevelSelect}
          />
        </View>

        {/* Camera Option */}
        {selectedLevel && (
          <TouchableOpacity 
            style={mainStyles.cameraOption} 
            onPress={takePicture}
            activeOpacity={0.9}
          >
            <View style={mainStyles.cameraOptionContent}>
              <View style={mainStyles.cameraOptionTextContainer}>
                <Text style={mainStyles.cameraOptionTitle}>
                  Artwork Camera
                </Text>
                <Text style={mainStyles.cameraOptionDescription}>
                  Capture and discuss art pieces
                </Text>
                <View style={mainStyles.cameraOptionMeta}>
                  <View style={mainStyles.cameraOptionTag}>
                    <Text style={mainStyles.cameraOptionTagText}>AR Mode</Text>
                  </View>
                  <View style={mainStyles.cameraOptionBadge}>
                    <Text style={mainStyles.cameraOptionBadgeText}>{selectedLevel}</Text>
                  </View>
                </View>
              </View>
              <View style={mainStyles.cameraOptionIcon}>
                <Feather name="camera" size={24} color="#111" />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Photo Preview */}
        {photo && (
          <View style={mainStyles.photoPreviewContainer}>
            <View style={mainStyles.photoHeader}>
              <Text style={mainStyles.photoTitle}>Your Artwork</Text>
              <Text style={mainStyles.photoSubtitle}>Selected Level: {selectedLevel}</Text>
            </View>
            
            <Image
              source={{ uri: photo }}
              style={mainStyles.photoImage}
              resizeMode="cover"
            />
            
            <View style={mainStyles.photoStats}>
              <View style={mainStyles.photoStatItem}>
                <Text style={mainStyles.photoStatNumber}>0</Text>
                <Text style={mainStyles.photoStatLabel}>Comments</Text>
              </View>
              <View style={mainStyles.photoStatItem}>
                <Text style={mainStyles.photoStatNumber}>0</Text>
                <Text style={mainStyles.photoStatLabel}>Views</Text>
              </View>
            </View>
          </View>
        )}

        {/* Discussions */}
        <View style={mainStyles.sectionContainer}>
          <View style={mainStyles.sectionHeader}>
            <Text style={mainStyles.sectionTitle}>Recent Discussions</Text>
            <TouchableOpacity style={mainStyles.seeAllButton}>
              <Text style={mainStyles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          <DiscussionItem
            imageUrl="https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&w=500"
            title="The Starry Night - Van Gogh"
            location="Manhattan, NYC"
            time="Mon-Fri (10am-8pm)"
            participants={5}
            tags={["Painting", "Artwork"]}
          />

          <DiscussionItem
            imageUrl="https://images.unsplash.com/photo-1423742774270-6884aac775fa?auto=format&fit=crop&w=500"
            title="Mona Lisa - Da Vinci"
            location="Paris, France"
            time="Wed-Sun (9am-7pm)"
            participants={3}
            tags={["Exhibition"]}
          />
          
          <DiscussionItem
            imageUrl="https://images.unsplash.com/photo-1595524362380-053b4cd0632c?auto=format&fit=crop&w=500"
            title="David - Michelangelo"
            location="Florence, Italy"
            time="Tue-Sun (10am-6pm)"
            participants={7}
            tags={["Sculpture", "Exhibition"]}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LevelSelector } from "../../components/LevelSelector";
import { DiscussionItem } from "../../components/DiscussionItem";
import { mainStyles } from "../styles/mainStyles";
import { CameraView } from "../../components/CameraView";

const LEVELS = ["Beginner", "Intermediate", "Advanced"];

// Exemple de données fictives pour le développement
const MOCK_DISCUSSIONS = [
  {
    id: "1",
    imageUrl: "https://images.unsplash.com/photo-1541963463532-d68292c34b19?auto=format&fit=crop&w=500",
    title: "The Starry Night - Van Gogh",
    location: "Manhattan, NYC",
    time: "Mon-Fri (10am-8pm)",
    participants: 5,
    tags: ["Painting", "Artwork"],
  },
  {
    id: "2",
    imageUrl: "https://images.unsplash.com/photo-1423742774270-6884aac775fa?auto=format&fit=crop&w=500",
    title: "Mona Lisa - Da Vinci",
    location: "Paris, France",
    time: "Wed-Sun (9am-7pm)",
    participants: 3,
    tags: ["Exhibition"],
  },
  {
    id: "3",
    imageUrl: "https://images.unsplash.com/photo-1562522730-7c98d13c6690?q=80&w=2940??auto=format&fit=crop&w=500",
    title: "David - Michelangelo",
    location: "Florence, Italy",
    time: "Tue-Sun (10am-6pm)",
    participants: 7,
    tags: ["Sculpture", "Exhibition"],
  },
];

// Fonction qui simule un appel API pour récupérer les discussions
// Cette fonction sera remplacée par un vrai appel API dans le futur
const fetchDiscussions = async (filter?: string): Promise<typeof MOCK_DISCUSSIONS> => {
  // Simulation d'un délai réseau
  await new Promise(resolve => setTimeout(resolve, 300));
  
  if (!filter || filter === "All") {
    return MOCK_DISCUSSIONS;
  }
  
  return MOCK_DISCUSSIONS.filter(discussion => 
    discussion.tags.some(tag => tag === filter)
  );
};

// Type pour les discussions
interface Discussion {
  id: string;
  imageUrl: string;
  title: string;
  location: string;
  time: string;
  participants: number;
  tags: string[];
}

export default function ConversationsScreen() {
  const [selectedLevel, setSelectedLevel] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("All");
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fonction pour charger les discussions
  const loadDiscussions = async (filter?: string) => {
    setIsLoading(true);
    try {
      const data = await fetchDiscussions(filter);
      setDiscussions(data);
    } catch (error) {
      console.error("Error fetching discussions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Charger les discussions au premier rendu
  useEffect(() => {
    loadDiscussions();
  }, []);

  // Charger les discussions lorsque l'onglet change
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    loadDiscussions(tab);
  };

  const handleLevelSelect = (level: string) => {
    setSelectedLevel(level);
  };

  const takePicture = () => {
    setShowCamera(true);
  };

  const handlePhotoCapture = (uri: string) => {
    setPhoto(uri);
    setShowCamera(false);
  };

  // Camera mode screen
  if (showCamera) {
    return (
      <CameraView 
        onClose={() => setShowCamera(false)} 
        onCapture={handlePhotoCapture}
      />
    );
  }

  // Main screen
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
          <Text style={mainStyles.logoHeader}>★ NOAVISIT ★</Text>
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
          {["All", "Painting", "Sculpture", "Exhibition"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[mainStyles.tabButton, activeTab === tab && mainStyles.activeTabButton]}
              onPress={() => handleTabChange(tab)}
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

          {isLoading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#0000ff" />
              <Text style={{ marginTop: 10, color: '#666' }}>Chargement des discussions...</Text>
            </View>
          ) : discussions.length > 0 ? (
            discussions.map((discussion, index) => (
              <DiscussionItem
                key={discussion.id}
                imageUrl={discussion.imageUrl}
                title={discussion.title}
                location={discussion.location}
                time={discussion.time}
                participants={discussion.participants}
                tags={discussion.tags}
              />
            ))
          ) : (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#666' }}>Aucune discussion trouvée</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
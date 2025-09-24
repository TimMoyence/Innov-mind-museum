import { StyleSheet } from "react-native";

export const mainStyles = StyleSheet.create({
  // Main Container
  container: {
    flex: 1,
    backgroundColor: "#f8f8f8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  menuButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  logoHeaderContainer: {
    alignItems: "center",
  },
  logoHeader: {
    fontSize: 18,
    fontWeight: "400",
    color: "#111",
    letterSpacing: 1,
  },
  searchButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },

  // Tabs
  tabs: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  tabsContent: {
    paddingHorizontal: 15,
  },
  tabButton: {
    paddingVertical: 15,
    paddingHorizontal: 20,
  },
  activeTabButton: {
    borderBottomWidth: 2,
    borderBottomColor: "#111",
  },
  tabText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "400",
  },
  activeTabText: {
    color: "#111",
    fontWeight: "500",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 30,
  },

  // Sections
  sectionContainer: {
    marginTop: 25,
    marginHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111",
    letterSpacing: 0.5,
  },
  seeAllButton: {},
  seeAllText: {
    color: "#666",
    fontSize: 14,
  },

  // Camera Option
  cameraOption: {
    marginTop: 25,
    marginHorizontal: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  cameraOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
  },
  cameraOptionTextContainer: {
    flex: 1,
  },
  cameraOptionTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111",
    marginBottom: 4,
  },
  cameraOptionDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  cameraOptionMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  cameraOptionTag: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  cameraOptionTagText: {
    fontSize: 12,
    color: "#111",
  },
  cameraOptionBadge: {
    backgroundColor: "#111",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cameraOptionBadgeText: {
    fontSize: 12,
    color: "white",
  },
  cameraOptionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },

  // Photo Preview
  photoPreviewContainer: {
    marginTop: 25,
    marginHorizontal: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  photoHeader: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  photoTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111",
    marginBottom: 4,
  },
  photoSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  photoImage: {
    width: "100%",
    height: 250,
  },
  photoStats: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  photoStatItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  photoStatNumber: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111",
    marginBottom: 2,
  },
  photoStatLabel: {
    fontSize: 12,
    color: "#666",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f8f8",
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#111",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  cameraButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "white",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  cameraButtonText: {
    color: "#111",
    fontWeight: "500",
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 4,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  tabButtonActive: {
    backgroundColor: "#0066cc11",
    borderRadius: 16,
  },
  tabButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  tabButtonTextActive: {
    color: "#0066cc",
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  discussionList: {
    flexGrow: 0,
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: "center",
    marginTop: 40,
    paddingHorizontal: 24,
  },
  emptyStateImage: {
    width: "100%",
    height: 180,
    borderRadius: 16,
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  chatContainer: {
    marginTop: 16,
    marginHorizontal: 16,
    backgroundColor: "white",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
  },
  chatSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },
  chatToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    justifyContent: "center",
    alignItems: "center",
  },
  chatContent: {
    marginTop: 16,
  },
  chatMessages: {
    maxHeight: 260,
  },
  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  loadingBubbleText: {
    color: "#666",
    fontSize: 13,
  },
 aiChatOption: {
    marginTop: 10,
    backgroundColor: '#EFF6FF', // Couleur bleu clair pour distinguer du composant caméra
  },
  
  aiTag: {
    backgroundColor: '#3B82F6', // Bleu pour le tag AI
  },
  
  aiIcon: {
    backgroundColor: '#93C5FD', // Bleu clair pour l'icône
  },
  
  // Styles pour l'écran de chat
  conversationContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  
  conversationContent: {
    padding: 16,
    paddingBottom: 20,
  },
  
  // Style pour les bulles de message
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
    marginBottom: 12,
  },
  
  userMessageBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#3B82F6',
    borderBottomRightRadius: 4,
  },
  
  aiMessageBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  
  userMessageText: {
    color: 'white',
  },
  
  aiMessageText: {
    color: '#1F2937',
  },
  
  messageTimestamp: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.6,
    alignSelf: 'flex-end',
  },
  
  // Zone de saisie du message
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: 'white',
    zIndex: 100, // S'assurer que la zone de saisie est au-dessus
  },
  
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    zIndex: 1, // S'assurer que le TextInput est au-dessus
  },
  
  sendButton: {
    marginLeft: 10,
    backgroundColor: '#3B82F6',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  disabledSendButton: {
    backgroundColor: '#E5E7EB',
  },
  
  // Indicateur de frappe de l'IA
  aiTypingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E5E7EB',
    padding: 10,
    borderRadius: 16,
    marginBottom: 12,
  },
  
  aiTypingText: {
    marginLeft: 8,
    color: '#6B7280',
    fontSize: 14,
  },
  
  // Écran de conversation vide
  emptyConversation: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    minHeight: 300,
  },
  
  emptyConversationText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 16,
  },
  
  // Image dans le chat
  chatImageContainer: {
    padding: 10,
    backgroundColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  
  chatImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  
  changeImageButton: {
    marginLeft: 12,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  
  changeImageText: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '500',
  },
})

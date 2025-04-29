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
});

import { StyleSheet } from "react-native";

export const componentStyles = StyleSheet.create({
  // Level Selection
  levelButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  levelButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    marginHorizontal: 5,
    alignItems: "center",
    backgroundColor: "white",
  },
  levelButtonSelected: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
  levelButtonText: {
    color: "#111",
    fontSize: 14,
    fontWeight: "400",
  },
  levelButtonTextSelected: {
    color: "white",
    fontWeight: "500",
  },

  // Discussion Items
  discussionItem: {
    marginBottom: 20,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  discussionImageContainer: {
    position: "relative",
  },
  discussionImage: {
    width: "100%",
    height: 180,
  },
  discussionTags: {
    position: "absolute",
    bottom: 0,
    left: 0,
    flexDirection: "row",
    padding: 10,
  },
  discussionTag: {
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
  },
  discussionTagText: {
    fontSize: 12,
    color: "#111",
  },
  discussionContent: {
    padding: 15,
  },
  discussionTitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111",
    marginBottom: 4,
  },
  discussionDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  discussionMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  discussionTime: {
    fontSize: 12,
    color: "#666",
  },
  discussionParticipants: {
    fontSize: 12,
    color: "#666",
  },
});

import { StyleSheet } from "react-native";

export const homeStyles = StyleSheet.create({
  welcomeContainer: {
    flex: 1,
    backgroundColor: "#111",
  },
  welcomeBackground: {
    flex: 1,
    justifyContent: "center",
  },
  welcomeOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  welcomeContent: {
    width: "100%",
    maxWidth: 350,
    alignItems: "center",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 50,
  },
  logoText: {
    fontSize: 90,
    fontWeight: "200",
    color: "white",
    letterSpacing: 10,
    textAlign: "center",
    lineHeight: 100,
  },
  logoSubText: {
    fontSize: 50,
    fontWeight: "200",
    color: "white",
    letterSpacing: 5,
    lineHeight: 60,
    textAlign: "center",
  },
  welcomeDescription: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    marginBottom: 80,
    fontWeight: "300",
    letterSpacing: 1,
  },
  enterButton: {
    backgroundColor: "white",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 0,
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    justifyContent: "center",
  },
  enterButtonText: {
    color: "#111",
    fontSize: 16,
    fontWeight: "500",
    marginRight: 8,
    letterSpacing: 1,
  },
});

import { StyleSheet } from "react-native";

export const blurredHomeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f0f0",
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: "#4a4a4a",
    marginBottom: 30,
    textAlign: "center",
  },
  link: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  linkText: {
    color: "#1a1a1a",
    fontSize: 16,
    fontWeight: "600",
  },
});

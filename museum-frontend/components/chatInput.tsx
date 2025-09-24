import { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Text,
} from "react-native";
import { Feather } from "@expo/vector-icons";

interface ChatInputProps {
  onSendMessage: (message: string) => void | Promise<void>;
}

export const ChatInput = ({ onSendMessage }: ChatInputProps) => {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage("");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
      style={styles.container}
    >
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Posez une question sur l'art..."
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
          autoFocus={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, !message.trim() && styles.disabledSendButton]}
          onPress={handleSend}
          disabled={!message.trim()}
        >
          <Feather name="send" size={20} color={message.trim() ? "#fff" : "#A0A0A0"} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// Styles pour le composant de saisie
const styles = StyleSheet.create({
  container: {
    width: "100%",
    position: "absolute",
    bottom: 65, // Augmenté pour être au-dessus du menu de navigation
    left: 0,
    right: 0,
    zIndex: 1000, // Valeur élevée pour être au-dessus des autres éléments
    elevation: 5, // Pour Android
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: "#3B82F6",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  disabledSendButton: {
    backgroundColor: "#E5E7EB",
  },
});

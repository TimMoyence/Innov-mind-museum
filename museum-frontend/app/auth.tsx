import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import APIService, { setJwtToken } from "../context/api";
import { useAuth } from "../context/AuthContext";
import { homeStyles } from "./styles/homeStyles";

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [firstname, setFirstname] = useState<string>("");
  const [lastname, setLastname] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { setIsAuthenticated } = useAuth();

  const handleLogin = async (): Promise<void> => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setIsLoading(true);

    try {
      console.log("Trying to login with:", { email });
      const response = await APIService.auth.login(email, password);

      if (response && response.token) {
        await AsyncStorage.setItem("userToken", response.token);
        setJwtToken(response.token);
        setIsAuthenticated(true);

        setTimeout(() => {
          router.navigate("/(tabs)");
        }, 100);
      } else {
        Alert.alert("Error", "Login failed - No token received");
      }
    } catch (error: any) {
      console.error("Login error:", error);

      const message =
        error instanceof Error ? error.message : "Unexpected login error";

      Alert.alert("Error", message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (): Promise<void> => {
    if (!email || !password || !firstname || !lastname) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setIsLoading(true);

    try {
      await APIService.auth.register({
        email,
        password,
        firstname,
        lastname,
      });

      Alert.alert(
        "Registration successful",
        "Your account has been successfully created",
        [{ text: "OK", onPress: () => setIsLogin(true) }]
      );

      // Champs réinitialisés après l'inscription
      setFirstname("");
      setLastname("");
      setEmail("");
      setPassword("");
    } catch (error) {
      console.error("Registration error:", error);
      Alert.alert("Error", "Error during registration");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = (): void => {
    if (!email) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    Alert.alert(
      "Password reset",
      "Would you like to receive a password reset email?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Send",
          onPress: async () => {
            setIsLoading(true);
            try {
              await APIService.auth.forgotPassword(email);
              Alert.alert(
                "Email sent",
                "If this email address is associated with an account, you will receive a link to reset your password."
              );
            } catch (error) {
              Alert.alert(
                "Email sent",
                "If this email address is associated with an account, you will receive a link to reset your password."
              );
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSubmit = (): void => {
    if (isLogin) {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <ImageBackground
      source={{
        uri: "https://images.unsplash.com/photo-1638186824584-6d6367254927?auto=format&fit=crop&w=500",
      }}
      style={homeStyles.welcomeBackground}
    >
      <BlurView intensity={60} tint="light" style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>NOA VISIT</Text>
          <Text style={styles.subtitle}>
            {isLogin ? "Log in to continue" : "Create your account"}
          </Text>
        </View>

        <View style={styles.form}>
          {!isLogin && (
            <>
              <BlurView
                intensity={40}
                tint="light"
                style={styles.inputContainer}
              >
                <Ionicons name="person-outline" size={24} color="#1a1a1a" />
                <TextInput
                  style={styles.input}
                  placeholder="First name"
                  placeholderTextColor="#666"
                  value={firstname}
                  onChangeText={setFirstname}
                />
              </BlurView>

              <BlurView
                intensity={40}
                tint="light"
                style={styles.inputContainer}
              >
                <Ionicons name="person-outline" size={24} color="#1a1a1a" />
                <TextInput
                  style={styles.input}
                  placeholder="Last name"
                  placeholderTextColor="#666"
                  value={lastname}
                  onChangeText={setLastname}
                />
              </BlurView>
            </>
          )}

          <BlurView intensity={40} tint="light" style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={24} color="#1a1a1a" />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </BlurView>

          <BlurView intensity={40} tint="light" style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={24} color="#1a1a1a" />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </BlurView>

          {isLogin && (
            <TouchableOpacity
              style={styles.forgotPasswordButton}
              onPress={handleForgotPassword}
            >
              <Text style={styles.forgotPasswordText}>
                Forgot password?
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            <BlurView
              intensity={40}
              tint="light"
              style={styles.submitButtonContent}
            >
              {isLoading ? (
                <ActivityIndicator color="#1a1a1a" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isLogin ? "Log in" : "Sign up"}
                </Text>
              )}
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsLogin(!isLogin)}
            disabled={isLoading}
          >
            <Text style={styles.switchButtonText}>
              {isLogin
                ? "No account? Sign up"
                : "Already have an account? Log in"}
            </Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f0f0",
  },
  content: {
    flex: 1,
    margin: 20,
    borderRadius: 15,
    overflow: "hidden",
    padding: 20,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
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
    textAlign: "center",
  },
  form: {
    gap: 15,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    overflow: "hidden",
    padding: 15,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: "#1a1a1a",
  },
  forgotPasswordButton: {
    alignSelf: "flex-end",
  },
  forgotPasswordText: {
    fontSize: 14,
    color: "#1a1a1a",
    textDecorationLine: "underline",
  },
  submitButton: {
    marginTop: 20,
    borderRadius: 10,
    overflow: "hidden",
  },
  submitButtonContent: {
    padding: 15,
    alignItems: "center",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  switchButton: {
    marginTop: 15,
    alignItems: "center",
  },
  switchButtonText: {
    fontSize: 14,
    color: "#1a1a1a",
    textDecorationLine: "underline",
  },
});

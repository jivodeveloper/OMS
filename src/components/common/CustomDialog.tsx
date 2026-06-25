import React from "react";
import { View, Text, Modal, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../constants/theme";

type Props = {
  visible: boolean;
  title?: string;
  message: string;
  onClose: () => void;
};

export default function CustomDialog({
  visible,
  title = "Alert",
  message,
  onClose,
}: Props) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Ionicons
            name="alert-circle-outline"
            size={42}
            color={COLORS.primary}
            style={{ marginBottom: 12 }}
          />

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },

  dialog: {
    backgroundColor: "#fff",
    width: "85%",
    borderRadius: 14,
    padding: 22,
    alignItems: "center",
    elevation: 5,
  },

  title: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },

  message: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: "center",
    marginBottom: 18,
    lineHeight: 20,
  },

  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 8,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});

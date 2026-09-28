import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import DialogFooter from "@/src/features/approval/components/dialogs/DialogFooter";
import DialogHeader from "@/src/features/approval/components/dialogs/DialogHeader";
import DialogShell from "@/src/features/approval/components/dialogs/DialogShell";
import { COLORS } from "@/src/constants/theme";
import { fs, sp } from "@/src/utils/responsive";
import {
  advancePaymentError,
  advancePaymentService,
} from "@/src/services/advancePayment.service";

/**
 * "Confirm your password" before the Payment user types a payee's bank account
 * by hand.
 *
 * The server checks the password and answers with a token that unlocks typing
 * on this request for a while; the payout carries it back when it is saved
 * (`manual_token`), and the server REFUSES a typed account without one. This
 * dialog is the asking, never the check — the same arrangement as the web's
 * `ManualAccountPassword`, in the app's own dialog shell.
 */
export default function ManualAccountPassword({
  requestId,
  visible,
  onClose,
  onConfirmed,
}: {
  requestId: number;
  visible: boolean;
  onClose: () => void;
  onConfirmed: (token: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPassword("");
      setError("");
    }
  }, [visible]);

  if (!visible) return null;

  const confirm = async () => {
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    try {
      const token = await advancePaymentService.confirmManualPassword(requestId, password);
      setPassword("");
      setError("");
      onConfirmed(token);
    } catch (err) {
      setError(advancePaymentError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell visible onRequestClose={busy ? () => {} : onClose}>
      <DialogHeader
        icon="lock-closed"
        accent={COLORS.primary}
        title="Confirm your password"
        subtitle="A bank account typed by hand is not one SAP holds for the payee. Confirm it is you before entering it."
        onClose={busy ? undefined : onClose}
      />

      <View style={styles.body}>
        <Text style={styles.label}>Your password</Text>
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (error) setError("");
          }}
          placeholder="Password"
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => void confirm()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <DialogFooter
        cancelLabel="Cancel"
        onCancel={onClose}
        confirmLabel={busy ? "Checking…" : "Confirm"}
        onConfirm={() => void confirm()}
        accent={COLORS.primary}
        loading={busy}
        disabled={busy}
      />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: sp(20), paddingBottom: sp(4) },
  label: {
    fontSize: fs(12),
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: sp(6),
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: sp(12),
    backgroundColor: COLORS.inputBackground,
    paddingHorizontal: sp(12),
    paddingVertical: sp(11),
    fontSize: fs(14),
    color: COLORS.text,
  },
  inputError: { borderColor: COLORS.error },
  error: { fontSize: fs(11.5), color: COLORS.error, marginTop: sp(6), fontWeight: "600" },
});

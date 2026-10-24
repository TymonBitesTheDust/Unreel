import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PIN_PATTERN } from '../lib/friction';
import { radius, space, type, usePalette } from '../theme';
import { Button } from './ui';

type Props = {
  visible: boolean;
  mode: 'verify' | 'create';
  /** What the PIN unlocks, e.g. "Turn blocking off". */
  actionLabel?: string;
  /** Resolve with an error message to show, or null on success. */
  onSubmit(pin: string): Promise<string | null>;
  onCancel(): void;
};

export function PinSheet({ visible, mode, actionLabel, onSubmit, onCancel }: Props) {
  const c = usePalette();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setPin('');
      setConfirm('');
      setError(null);
    }
  }, [visible]);

  const creating = mode === 'create';
  const canSubmit = PIN_PATTERN.test(pin) && (!creating || confirm.length > 0) && !busy;

  async function submit() {
    if (creating && pin !== confirm) {
      setError("The two PINs don't match.");
      return;
    }
    setBusy(true);
    const message = await onSubmit(pin);
    setBusy(false);
    if (message) {
      setError(message);
      setPin('');
    }
  }

  const inputStyle = [styles.input, { borderColor: c.line, color: c.ink, backgroundColor: c.background }];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <Text style={[type.heading, { color: c.ink }]}>{creating ? 'Set a PIN' : 'Enter your PIN'}</Text>
          <Text style={[type.small, styles.lead, { color: c.muted }]}>
            {creating
              ? 'You’ll need it to turn blocking off, pause it, or loosen any setting. 4 to 8 digits.'
              : `Needed to ${actionLabel ? actionLabel.toLowerCase() : 'continue'}.`}
          </Text>

          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 8))}
            placeholder="PIN"
            placeholderTextColor={c.muted}
            keyboardType="number-pad"
            secureTextEntry
            autoFocus
            textContentType={creating ? 'newPassword' : 'password'}
            style={inputStyle}
            accessibilityLabel="PIN"
            onSubmitEditing={() => canSubmit && !creating && void submit()}
          />
          {creating && (
            <TextInput
              value={confirm}
              onChangeText={(t) => setConfirm(t.replace(/\D/g, '').slice(0, 8))}
              placeholder="Same PIN again"
              placeholderTextColor={c.muted}
              keyboardType="number-pad"
              secureTextEntry
              style={[inputStyle, { marginTop: space.sm }]}
              accessibilityLabel="Confirm PIN"
            />
          )}

          {error && (
            <Text style={[type.small, styles.error, { color: c.danger }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}

          <View style={styles.actions}>
            <Button label="Cancel" variant="quiet" onPress={onCancel} />
            <Button label={creating ? 'Save PIN' : 'Continue'} onPress={submit} disabled={!canSubmit} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 10, 24, 0.45)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
    padding: space.xl,
    paddingBottom: space.xxl + space.lg,
  },
  lead: { marginTop: space.xs, marginBottom: space.lg },
  input: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 22,
    letterSpacing: 6,
  },
  error: { marginTop: space.md },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.xl },
});

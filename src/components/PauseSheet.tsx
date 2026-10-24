import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PendingChange } from '../lib/friction';
import { radius, space, type, usePalette } from '../theme';
import { Button } from './ui';

/** Every option is ≥ 15 minutes because iOS can't schedule a shorter pause. */
const OPTIONS: PendingChange[] = [
  { label: 'Pause for 15 minutes', pauseMinutes: 15 },
  { label: 'Pause for 1 hour', pauseMinutes: 60 },
  { label: 'Pause until tomorrow', pauseUntilMidnight: true },
  { label: 'Turn blocking off', config: { enabled: false } },
];

type Props = {
  visible: boolean;
  delaySec: number;
  hasPin: boolean;
  onChoose(change: PendingChange): void;
  onClose(): void;
};

export function PauseSheet({ visible, delaySec, hasPin, onChoose, onClose }: Props) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const friction = [hasPin && 'your PIN', delaySec > 0 && `a ${Math.max(1, Math.round(delaySec / 60))}-minute wait`]
    .filter(Boolean)
    .join(' and ');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + space.xl }]}>
        <Text style={[type.heading, { color: c.ink }]}>Take a break from blocking?</Text>
        <Text style={[type.small, { color: c.muted, marginTop: space.xs }]}>
          {friction ? `This needs ${friction}.` : 'This applies straight away.'} Blocking comes back on by itself
          when a pause ends.
        </Text>
        <View style={styles.options}>
          {OPTIONS.map((o) => (
            <Pressable
              key={o.label}
              onPress={() => onChoose(o)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.option, { borderColor: c.line, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[type.body, { color: o.config?.enabled === false ? c.danger : c.ink }]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <Button label="Keep blocking" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 10, 24, 0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
    padding: space.xl,
  },
  options: { marginVertical: space.lg },
  option: { paddingVertical: space.md + 2, borderBottomWidth: StyleSheet.hairlineWidth },
});

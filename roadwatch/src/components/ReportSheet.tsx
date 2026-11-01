import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KIND_INFO, KIND_ORDER, type HazardKind } from '../lib/hazards';
import { KIND_COLOR, radius, space, type, usePalette } from '../theme';

const HINT: Record<HazardKind, string> = {
  police: 'Disappears after an hour',
  speed_camera: 'Stays until you remove it',
  traffic_camera: 'Stays until you remove it',
};

/** Report something at the car's current position. Big targets: this gets used at a glance. */
export function ReportSheet({
  visible,
  onReport,
  onClose,
}: {
  visible: boolean;
  onReport: (kind: HazardKind) => void;
  onClose: () => void;
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: c.surface, paddingBottom: insets.bottom + space.lg }]}>
        <Text style={[type.title, { color: c.ink }]}>Report here</Text>
        <Text style={[type.small, { color: c.muted }]}>
          Saved on this phone at your current location. Please ask a passenger to report while you drive.
        </Text>
        <View style={styles.grid}>
          {KIND_ORDER.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="button"
              accessibilityLabel={`Report ${KIND_INFO[kind].name}`}
              onPress={() => onReport(kind)}
              style={({ pressed }) => [styles.tile, { backgroundColor: KIND_COLOR[kind], opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.emoji}>{KIND_INFO[kind].emoji}</Text>
              <Text style={styles.tileTitle}>{KIND_INFO[kind].name}</Text>
              <Text style={styles.tileHint}>{HINT[kind]}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
          <Text style={[type.body, { color: c.muted, fontWeight: '600' }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    gap: space.md,
    paddingTop: space.xl,
    paddingHorizontal: space.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  grid: { flexDirection: 'row', gap: space.sm },
  tile: {
    flex: 1,
    minHeight: 132,
    borderRadius: radius.md,
    padding: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  emoji: { fontSize: 36 },
  tileTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  tileHint: { color: 'rgba(255,255,255,0.85)', fontSize: 11, textAlign: 'center' },
  cancel: { alignItems: 'center', paddingVertical: space.md },
});

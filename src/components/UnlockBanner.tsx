import { StyleSheet, Text, View } from 'react-native';

import { countdown } from '../lib/time';
import { useFriction } from '../state/FrictionProvider';
import { radius, space, type, usePalette } from '../theme';
import { Button } from './ui';

/** Shows a loosening change that's waiting out the unlock delay, then asks for confirmation. */
export function UnlockBanner() {
  const c = usePalette();
  const { pending, now, confirmPending, cancelPending } = useFriction();
  if (!pending) return null;

  const ready = now >= pending.readyAt;
  return (
    <View style={[styles.wrap, { backgroundColor: c.surface, borderColor: ready ? c.brand : c.line }]}>
      <Text style={[type.body, { color: c.ink, fontWeight: '600' }]}>{pending.change.label}</Text>
      <Text style={[type.small, { color: c.muted, marginTop: space.xs }]} accessibilityLiveRegion="polite">
        {ready
          ? `Still want to? Confirm within ${countdown(pending.expiresAt - now)} or it’s cancelled.`
          : `Available in ${countdown(pending.readyAt - now)}. Most urges pass before this does.`}
      </Text>
      <View style={styles.actions}>
        <Button label="Never mind" variant="quiet" onPress={() => void cancelPending()} />
        <Button label="Confirm" onPress={() => void confirmPending()} disabled={!ready} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.group, borderWidth: 1.5, padding: space.lg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.md },
});

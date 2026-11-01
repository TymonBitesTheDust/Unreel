import { StyleSheet, Text, View } from 'react-native';

import { MINUTE } from '../lib/time';
import { space, type, usePalette } from '../theme';

type Props = { title: string; usedMs: number; limitMinutes: number; note?: string };

/** A group row: "Today · 22 of 60 min" over a bar that turns red once the time is used up. */
export function QuotaMeter({ title, usedMs, limitMinutes, note }: Props) {
  const c = usePalette();
  const usedMinutes = Math.min(limitMinutes, Math.max(0, Math.floor(usedMs / MINUTE)));
  const fraction = limitMinutes > 0 ? Math.min(1, Math.max(0, usedMs / (limitMinutes * MINUTE))) : 0;

  return (
    <View
      style={[styles.row, { borderTopColor: c.line }]}
      accessible
      accessibilityLabel={`${title}: ${usedMinutes} of ${limitMinutes} minutes used.${note ? ` ${note}` : ''}`}
    >
      <View style={styles.top}>
        <Text style={[type.body, styles.title, { color: c.ink }]}>{title}</Text>
        <Text style={[type.small, { color: c.muted, fontVariant: ['tabular-nums'] }]}>
          {usedMinutes} of {limitMinutes} min
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.line }]}>
        {fraction > 0 && (
          <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: fraction >= 1 ? c.danger : c.brand }]} />
        )}
      </View>
      {note && <Text style={[type.small, { color: c.muted, marginTop: space.xs }]}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  title: { flex: 1 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, minWidth: 8, borderRadius: 4 },
});

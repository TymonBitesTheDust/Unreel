import { StyleSheet, Text, View } from 'react-native';

import type { DayStats } from '../lib/blocker';
import { weekdayInitial } from '../lib/time';
import { space, type, usePalette } from '../theme';

const BAR_MAX = 72;

/** Seven slim bars, today in brand colour. Counts sit above non-empty days. */
export function WeekChart({ days }: { days: DayStats[] }) {
  const c = usePalette();
  const max = Math.max(1, ...days.map((d) => d.total));
  const total = days.reduce((sum, d) => sum + d.total, 0);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${total} blocked in the last ${days.length} days. ${days
        .map((d) => `${weekdayInitial(d.date)} ${d.total}`)
        .join(', ')}`}
    >
      {days.map((d, i) => {
        const isToday = i === days.length - 1;
        const height = d.total === 0 ? 3 : Math.max(6, (d.total / max) * BAR_MAX);
        return (
          <View key={d.date} style={styles.col}>
            <Text style={[type.caption, styles.count, { color: d.total ? c.muted : 'transparent' }]}>{d.total}</Text>
            <View
              style={[
                styles.bar,
                { height, backgroundColor: isToday ? c.brand : c.ink, opacity: isToday ? 1 : d.total ? 0.22 : 0.12 },
              ]}
            />
            <Text style={[type.caption, { color: isToday ? c.ink : c.muted, fontWeight: isToday ? '600' : '400' }]}>
              {weekdayInitial(d.date)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  col: { alignItems: 'center', gap: space.xs, flex: 1 },
  count: { fontVariant: ['tabular-nums'] },
  bar: { width: 14, borderRadius: 4 },
});

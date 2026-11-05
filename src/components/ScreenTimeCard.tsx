import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ScreenTime } from '../lib/blocker';
import { durationText } from '../lib/time';
import { space, type, usePalette, type Palette } from '../theme';
import { Group, Segmented } from './ui';

type AppKey = 'youtube' | 'instagram';

/** Display order and names. Same as native-android MainActivity.kt. */
const APPS: { key: AppKey; name: string; parts: { id: string; label: string }[] }[] = [
  {
    key: 'youtube',
    name: 'YouTube',
    parts: [
      { id: 'shorts', label: 'Shorts' },
      { id: 'video', label: 'Videos' },
      { id: 'other', label: 'Not watching' },
    ],
  },
  {
    key: 'instagram',
    name: 'Instagram',
    parts: [
      { id: 'scrolling', label: 'Scrolling Reels' },
      { id: 'normal', label: 'Posts & Stories' },
      { id: 'chat', label: 'Chat' },
      { id: 'other', label: 'Other' },
    ],
  },
];

/** The same colour for the same kind of part in both apps; "other" stays neutral. */
function partColor(id: string, c: Palette): string {
  if (id === 'shorts' || id === 'scrolling') return c.vizOrange;
  if (id === 'video' || id === 'normal') return c.vizBlue;
  if (id === 'chat') return c.vizAqua;
  return c.muted;
}

/** Time in each part of YouTube and Instagram, today or over the last 7 days. */
export function ScreenTimeCard({ screenTime }: { screenTime: ScreenTime }) {
  const c = usePalette();
  const [range, setRange] = useState<'today' | 'week'>('today');
  const days = range === 'today' ? [screenTime.today] : screenTime.days;

  return (
    <Group
      title="Screen time"
      footer="Counted while YouTube or Instagram is on screen, whether or not blocking is on. It stays on this phone, and Reset numbers clears it."
    >
      <View style={styles.period}>
        <Segmented
          options={[
            { value: 'today', label: 'Today' },
            { value: 'week', label: 'Last 7 days' },
          ]}
          value={range}
          onChange={(v) => setRange(v as 'today' | 'week')}
        />
      </View>
      {APPS.map((app) => {
        const parts = app.parts.map((part) => ({
          ...part,
          ms: days.reduce((sum, day) => sum + ((day.apps[app.key] as Record<string, number>)[part.id] ?? 0), 0),
          color: partColor(part.id, c),
        }));
        const total = parts.reduce((sum, p) => sum + p.ms, 0);
        return (
          <View key={app.key} style={[styles.app, { borderTopColor: c.line }]}>
            <View style={styles.header}>
              <Text style={[type.body, styles.grow, { color: c.ink, fontWeight: '600' }]}>{app.name}</Text>
              <Text style={[type.body, { color: c.ink, fontWeight: '600' }]}>{durationText(total)}</Text>
            </View>
            {range === 'week' && total > 0 && (
              <Text style={[type.small, { color: c.muted }]}>About {durationText(total / days.length)} a day</Text>
            )}
            <SegmentedBar parts={parts} empty={c.line} />
            {parts.map((part) => (
              <View
                key={part.id}
                style={styles.part}
                accessible
                accessibilityLabel={`${part.label}: ${durationText(part.ms)}`}
              >
                <View style={[styles.swatch, { backgroundColor: part.color }]} />
                <Text style={[type.small, styles.grow, { color: c.ink }]}>{part.label}</Text>
                <Text style={[type.small, { color: c.muted }]}>{durationText(part.ms)}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </Group>
  );
}

/**
 * One whole split into parts: a thin bar with no text (the rows below name each part and give
 * its time). Fully rounded ends, a 2pt gap between parts, a part at zero draws nothing.
 */
function SegmentedBar({ parts, empty }: { parts: { id: string; ms: number; color: string }[]; empty: string }) {
  const shown = parts.filter((p) => p.ms > 0);
  return (
    <View
      style={[styles.bar, shown.length === 0 && { backgroundColor: empty }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {shown.map((p) => (
        <View key={p.id} style={{ flexGrow: p.ms, flexBasis: 0, minWidth: 2, backgroundColor: p.color }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  period: { paddingHorizontal: space.lg, paddingVertical: space.md },
  app: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2, marginVertical: space.xs },
  part: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
});

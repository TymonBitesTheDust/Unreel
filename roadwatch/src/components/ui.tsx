import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, type, usePalette } from '../theme';

export function Screen({ children }: { children: ReactNode }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + space.xxl }]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const c = usePalette();
  return (
    <View style={styles.groupWrap}>
      {title && <Text style={[type.small, styles.groupTitle, { color: c.muted }]}>{title.toUpperCase()}</Text>}
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>{children}</View>
      {footer && <Text style={[type.caption, styles.groupFooter, { color: c.muted }]}>{footer}</Text>}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  right,
  onPress,
  first,
  destructive,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  first?: boolean;
  destructive?: boolean;
}) {
  const c = usePalette();
  const content = (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
      <View style={styles.rowText}>
        <Text style={[type.body, { color: destructive ? c.danger : c.ink }]}>{title}</Text>
        {subtitle && <Text style={[type.small, { color: c.muted, marginTop: 2 }]}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  first,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  first?: boolean;
}) {
  const c = usePalette();
  return (
    <Row
      first={first}
      title={title}
      subtitle={subtitle}
      right={
        <Switch value={value} onValueChange={onChange} trackColor={{ true: c.brand }} accessibilityLabel={title} />
      }
    />
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  format,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  const c = usePalette();
  return (
    <View style={[styles.segmented, { backgroundColor: c.background }]}>
      {options.map((o) => {
        const selected = o === value;
        return (
          <Pressable
            key={String(o)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o)}
            style={[styles.segment, selected && { backgroundColor: c.brand }]}
          >
            <Text style={[type.small, { fontWeight: '700', color: selected ? c.onBrand : c.ink }]}>{format(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.xl },
  groupWrap: { gap: space.sm },
  groupTitle: { fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: space.xs },
  group: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  groupFooter: { paddingHorizontal: space.xs, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    minHeight: 56,
  },
  rowText: { flex: 1 },
  segmented: { flexDirection: 'row', margin: space.md, padding: 4, borderRadius: radius.sm, gap: 4 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.sm - 3 },
});

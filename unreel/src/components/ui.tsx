import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, type, usePalette } from '../theme';

/** Scrollable page with the app background and safe-area padding. */
export function Screen({ children }: { children: ReactNode }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + space.xxl }]}
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

/** A titled group of rows, like a settings section. */
export function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const c = usePalette();
  return (
    <View style={styles.groupWrap}>
      {title && <Text style={[type.heading, styles.groupTitle, { color: c.ink }]}>{title}</Text>}
      <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.line }]}>{children}</View>
      {footer && <Text style={[type.caption, styles.groupFooter, { color: c.muted }]}>{footer}</Text>}
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  first?: boolean;
  disabled?: boolean;
};

export function Row({ title, subtitle, right, onPress, first, disabled }: RowProps) {
  const c = usePalette();
  const content = (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
      <View style={styles.rowText}>
        <Text style={[type.body, { color: disabled ? c.muted : c.ink }]}>{title}</Text>
        {subtitle && <Text style={[type.small, { color: c.muted, marginTop: 2 }]}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      {content}
    </Pressable>
  );
}

export function SwitchRow(props: Omit<RowProps, 'right' | 'onPress'> & { value: boolean; onChange(v: boolean): void }) {
  const c = usePalette();
  return (
    <Row
      {...props}
      right={
        <Switch
          value={props.value}
          onValueChange={props.onChange}
          disabled={props.disabled}
          trackColor={{ true: c.brand, false: c.line }}
          thumbColor="#FFFFFF"
          accessibilityLabel={props.title}
        />
      }
    />
  );
}

type ButtonProps = {
  label: string;
  onPress(): void;
  variant?: 'primary' | 'quiet' | 'onBrand';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  const c = usePalette();
  const palette = {
    primary: { bg: c.ink, fg: c.background },
    quiet: { bg: 'transparent', fg: c.ink },
    onBrand: { bg: c.onBrand, fg: c.brand },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      <Text style={[type.body, styles.buttonLabel, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Small set of mutually exclusive options. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange(v: T): void;
}) {
  const c = usePalette();
  return (
    <View style={[styles.segmented, { backgroundColor: c.background, borderColor: c.line }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: c.surface, borderColor: c.line }]}
          >
            <Text style={[type.small, { color: selected ? c.ink : c.muted, fontWeight: selected ? '600' : '400' }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Inline callout for something that needs the user's attention. */
export function Notice({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const c = usePalette();
  return (
    <View style={[styles.notice, { backgroundColor: c.warnSurface }]} accessibilityRole="alert">
      <Text style={[type.body, { color: c.ink, fontWeight: '600' }]}>{title}</Text>
      <Text style={[type.small, { color: c.ink, marginTop: space.xs }]}>{body}</Text>
      {action && <View style={{ marginTop: space.md, alignItems: 'flex-start' }}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.xl },
  groupWrap: { gap: space.sm },
  groupTitle: { marginLeft: space.xs },
  group: { borderRadius: radius.group, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  groupFooter: { marginHorizontal: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 56,
  },
  rowText: { flex: 1 },
  button: {
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonLabel: { fontWeight: '600' },
  segmented: { flexDirection: 'row', borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth, padding: 3 },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.control - 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  notice: { borderRadius: radius.group, padding: space.lg },
});

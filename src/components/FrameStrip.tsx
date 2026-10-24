import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';

import { space, type, usePalette } from '../theme';

const FRAME_W = 12;
const FRAME_H = 21; // ≈ 9:16, the shape of the thing being cut out
const STRIKE_LENGTH = Math.hypot(FRAME_W, FRAME_H);
const STRIKE_ANGLE = `-${(Math.atan2(FRAME_H, FRAME_W) * 180) / Math.PI}deg`;
const MAX_FRAMES = 40;

/**
 * Today's blocks as a row of crossed-out vertical video frames — one per Short or Reel stopped.
 * The newest frame drops in when a block happens while the dashboard is open (skipped when the
 * user prefers reduced motion).
 */
export function FrameStrip({ count, pulseKey }: { count: number; pulseKey?: number }) {
  const c = usePalette();
  const shown = Math.min(count, MAX_FRAMES);
  const overflow = count - shown;
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pulseKey) return;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [pulseKey, pop]);

  if (count === 0) {
    return (
      <View style={styles.row} accessible accessibilityLabel="Nothing blocked yet today">
        <View style={[styles.frame, { borderColor: c.onBrandMuted, borderStyle: 'dashed' }]} />
      </View>
    );
  }

  return (
    <View style={styles.row} accessible accessibilityLabel={`${count} blocked today`}>
      {Array.from({ length: shown }, (_, i) => {
        const isNewest = i === shown - 1;
        const frame = (
          <View style={[styles.frame, { borderColor: c.onBrandMuted }]}>
            <View style={[styles.strike, { backgroundColor: c.signal }]} />
          </View>
        );
        return isNewest ? (
          <Animated.View
            key={i}
            style={{
              opacity: pop,
              transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }],
            }}
          >
            {frame}
          </Animated.View>
        ) : (
          <View key={i}>{frame}</View>
        );
      })}
      {overflow > 0 && <Text style={[type.small, { color: c.onBrandMuted, alignSelf: 'center' }]}>+{overflow}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2, alignItems: 'center' },
  frame: {
    width: FRAME_W,
    height: FRAME_H,
    borderRadius: 2.5,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  strike: {
    position: 'absolute',
    width: STRIKE_LENGTH,
    height: 2,
    left: (FRAME_W - STRIKE_LENGTH) / 2 - 1.5,
    top: FRAME_H / 2 - 2.5,
    transform: [{ rotate: STRIKE_ANGLE }],
  },
});

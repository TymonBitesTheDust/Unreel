import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { KIND_INFO, SOURCE_NAME, type Hazard } from '../lib/hazards';
import { KIND_COLOR } from '../theme';

function age(ms: number): string {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

type Props = {
  hazard: Hazard;
  onCalloutPress?: (hazard: Hazard) => void;
};

export const HazardMarker = memo(function HazardMarker({ hazard, onCalloutPress }: Props) {
  // Custom marker views are snapshotted to a bitmap; track changes only until the first render
  // has landed, then stop (keeps hundreds of markers cheap on Android).
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracks(false), 600);
    return () => clearTimeout(t);
  }, []);

  const description = [
    hazard.speedLimit && `Limit ${hazard.speedLimit}`,
    hazard.street,
    hazard.reportedAt ? `${SOURCE_NAME[hazard.source]}, ${age(hazard.reportedAt)}` : SOURCE_NAME[hazard.source],
    hazard.source === 'report' && 'Tap to remove',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Marker
      identifier={hazard.id}
      coordinate={{ latitude: hazard.latitude, longitude: hazard.longitude }}
      title={hazard.label}
      description={description}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      zIndex={hazard.kind === 'police' ? 3 : hazard.kind === 'speed_camera' ? 2 : 1}
      onCalloutPress={onCalloutPress ? () => onCalloutPress(hazard) : undefined}
    >
      <View style={[styles.pin, { backgroundColor: KIND_COLOR[hazard.kind] }]}>
        <Text style={styles.emoji}>{KIND_INFO[hazard.kind].emoji}</Text>
      </View>
    </Marker>
  );
});

const styles = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 16, lineHeight: 20 },
});

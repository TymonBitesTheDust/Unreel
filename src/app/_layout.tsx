import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, useFonts } from '@expo-google-fonts/barlow-condensed';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BlockerProvider } from '../state/BlockerProvider';
import { FrictionProvider } from '../state/FrictionProvider';
import { fonts, usePalette } from '../theme';

export default function RootLayout() {
  const c = usePalette();
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_600SemiBold, BarlowCondensed_700Bold });

  // Render nothing for the few frames fonts take to load; fall back to system fonts on error.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <BlockerProvider>
        <FrictionProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerStyle: { backgroundColor: c.background },
              headerTintColor: c.ink,
              headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
              contentStyle: { backgroundColor: c.background },
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Unreel' }} />
            <Stack.Screen name="setup" options={{ title: 'Set up', presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          </Stack>
        </FrictionProvider>
      </BlockerProvider>
    </SafeAreaProvider>
  );
}

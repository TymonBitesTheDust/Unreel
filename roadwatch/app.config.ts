import type { ExpoConfig } from 'expo/config';

/**
 * One Google Maps Platform key, used for the map itself (Maps SDK for Android / iOS) and for search
 * and routes (Places API (New), Routes API). Put it in roadwatch/.env or an EAS environment variable.
 */
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

const BRAND = '#0F766E';

const config: ExpoConfig = {
  name: 'RoadWatch',
  slug: 'roadwatch',
  scheme: 'roadwatch',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0B1211',
  ios: {
    bundleIdentifier: 'com.roadwatch.app',
    supportsTablet: false,
    infoPlist: {
      // Spoken warnings while another app is in front. ("location" is added by expo-location.)
      UIBackgroundModes: ['location', 'audio'],
      // Lets the app check for Google Maps and Waze before handing off a route.
      LSApplicationQueriesSchemes: ['comgooglemaps', 'waze'],
    },
    entitlements: {
      // Warnings break through Focus modes that allow time-sensitive notifications.
      'com.apple.developer.usernotifications.time-sensitive': true,
    },
  },
  android: {
    package: 'com.roadwatch.app',
    adaptiveIcon: {
      backgroundColor: BRAND,
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Location runs through a foreground service during a drive, so background location (and
    // microphone) permissions are never needed.
    blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.RECORD_AUDIO'],
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'RoadWatch uses your location to show police and cameras near you and to warn you before you reach them.',
        locationAlwaysAndWhenInUsePermission:
          'RoadWatch uses your location during a drive to warn you about police and cameras ahead, even while Google Maps or Waze is open.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: true,
        androidForegroundServiceIcon: './assets/notification-icon.png',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: BRAND,
        sounds: ['./assets/sounds/radar_alert.wav'],
        enableRemoteNotifications: false,
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        // Short alert sounds don't need Android's media playback service.
        enableBackgroundPlayback: false,
      },
    ],
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: googleMapsApiKey,
        iosGoogleMapsApiKey: googleMapsApiKey || undefined,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;

// The background location task must be defined before anything else runs, including when the OS
// starts the app in the background with no screen. Then hand over to Expo Router as usual.
import './src/lib/locationTask';
import 'expo-router/entry';

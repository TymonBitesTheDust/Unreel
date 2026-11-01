/**
 * Start turn-by-turn navigation in Google Maps or Waze. RoadWatch keeps running in the background
 * and keeps warning about police and cameras while the other app is in front.
 */
import { Linking, Platform } from 'react-native';

import type { LatLng } from './geo';

const ll = (p: LatLng) => `${p.latitude},${p.longitude}`;

async function openFirst(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      // Custom schemes need canOpenURL on iOS (declared in LSApplicationQueriesSchemes);
      // https links always open, in the app if it's installed or in the browser if not.
      if (!url.startsWith('https:') && Platform.OS === 'ios' && !(await Linking.canOpenURL(url))) continue;
      await Linking.openURL(url);
      return;
    } catch {
      // Not installed; try the next one.
    }
  }
  throw new Error('Could not open a navigation app');
}

export function openInGoogleMaps(dest: LatLng): Promise<void> {
  const web = `https://www.google.com/maps/dir/?api=1&destination=${ll(dest)}&travelmode=driving&dir_action=navigate`;
  return openFirst(
    Platform.OS === 'android'
      ? [`google.navigation:q=${ll(dest)}&mode=d`, web]
      : [`comgooglemaps://?daddr=${ll(dest)}&directionsmode=driving`, web],
  );
}

export function openInWaze(dest: LatLng): Promise<void> {
  // Waze's documented deep link; opens the app when installed, otherwise its web page.
  return openFirst([`https://waze.com/ul?ll=${ll(dest)}&navigate=yes`]);
}

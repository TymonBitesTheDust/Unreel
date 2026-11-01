/**
 * The background location task. Imported for its side effect from the root layout: Expo requires
 * the task to be defined at module scope, so it exists even when the OS wakes the app in the
 * background without showing any screen.
 */
import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { handleLocation, LOCATION_TASK } from './radar';

TaskManager.defineTask<{ locations?: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Location task error', error.message);
    return;
  }
  const locations = data?.locations ?? [];
  // Updates can arrive batched; only the newest matters for warnings.
  const latest = locations.reduce<LocationObject | null>((a, b) => (!a || b.timestamp > a.timestamp ? b : a), null);
  if (latest) handleLocation(latest);
});

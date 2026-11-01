import { useSyncExternalStore } from 'react';

import { getState, subscribe, type RadarState } from '../lib/radar';

export function useRadar(): RadarState {
  return useSyncExternalStore(subscribe, getState, getState);
}

import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  BlockStats,
  BlockerConfig,
  ConfigPatch,
  NativeStatus,
  RulesInfo,
  SelectionSummary,
  UnreelBlockerEvents,
} from './UnreelBlocker.types';

/**
 * Raw native surface. Methods marked (android) / (ios) only exist on that platform — call them
 * through the platform-aware wrapper in ../index.ts rather than directly.
 */
export declare class UnreelBlockerNativeModule extends NativeModule<UnreelBlockerEvents> {
  getStatus(): NativeStatus;
  getConfig(): Partial<BlockerConfig>;
  setConfig(patch: ConfigPatch): Promise<Partial<BlockerConfig>>;
  getStats(days: number): BlockStats;
  resetStats(): void;

  /** (android) */
  openServiceSettings?(): boolean;
  /** (android) */
  openAppInfo?(): boolean;
  /** (android) Installs a newer detection-rules JSON. Throws ERR_INVALID_RULES. */
  updateRules?(json: string): RulesInfo;
  /** (android) */
  resetRules?(): RulesInfo;

  /** (ios) */
  requestAuthorization?(): Promise<string>;
  /** (ios) Resolves null if the user cancelled. */
  presentAppPicker?(): Promise<SelectionSummary | null>;
}

/**
 * Null in Expo Go and on web, where custom native code isn't available. The app checks
 * `isAvailable` and explains that a development build is needed instead of crashing at import.
 */
export default requireOptionalNativeModule<UnreelBlockerNativeModule>('UnreelBlocker');

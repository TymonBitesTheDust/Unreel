import Storage from 'expo-sqlite/kv-store';

/**
 * JSON values in the SQLite key-value store. The sync calls matter: the background location task
 * can start the app cold, and it needs settings and cached cameras before its first fix.
 */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  // Writes are small and infrequent; do them off the UI thread and never let them throw.
  Storage.setItem(key, JSON.stringify(value)).catch(() => {});
}

#!/usr/bin/env node
/**
 * Copies shared Swift sources (shared/ios/*) to every place that compiles them.
 *
 * Why copies: the Expo module is its own CocoaPod and app extensions are separate Xcode targets;
 * neither can reference files outside its own folder reliably. One source of truth plus this
 * script beats three hand-maintained copies drifting apart.
 *
 *   node scripts/sync-shared-swift.mjs          # write copies
 *   node scripts/sync-shared-swift.mjs --check  # CI: exit 1 if any copy is stale
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const copies = {
  'shared/ios/UnreelShared.swift': [
    'targets/_shared/UnreelShared.swift', // linked into every extension + the app target
    'modules/unreel-blocker/ios/UnreelShared.swift',
  ],
  'shared/ios/ShieldApplier.swift': [
    'targets/activity-monitor/ShieldApplier.swift',
    'modules/unreel-blocker/ios/ShieldApplier.swift',
  ],
};

const banner = (src) => `// GENERATED from ${src} by scripts/sync-shared-swift.mjs — do not edit this copy.\n`;

const check = process.argv.includes('--check');
let stale = 0;

for (const [src, targets] of Object.entries(copies)) {
  const body = banner(src) + readFileSync(join(root, src), 'utf8');
  for (const target of targets) {
    const path = join(root, target);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === body) continue;
    if (check) {
      console.error(`stale: ${target} (run npm run sync:swift)`);
      stale++;
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
      console.log(`synced ${target}`);
    }
  }
}

if (stale) process.exit(1);

/**
 * DeviceActivity monitor: re-applies shields at midnight, when a pause ends and when the daily
 * allowance is used up — i.e. at moments when the Unreel app itself is usually not running.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'device-activity-monitor',
  name: 'UnreelActivityMonitor',
  // `<main bundle id>.monitor` — UnreelShared derives the App Group from this shape.
  bundleIdentifier: '.monitor',
  deploymentTarget: '16.4',
  frameworks: ['DeviceActivity', 'ManagedSettings', 'FamilyControls'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});

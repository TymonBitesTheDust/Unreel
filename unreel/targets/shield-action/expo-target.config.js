/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'shield-action',
  name: 'UnreelShieldAction',
  bundleIdentifier: '.shieldaction',
  deploymentTarget: '16.4',
  frameworks: ['ManagedSettings'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
